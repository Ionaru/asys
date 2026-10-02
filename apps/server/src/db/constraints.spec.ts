// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { ChangeEntity, ChangeOp, TaskKind, TaskStatus } from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { removeOwner } from '../test/owners';
import { appDatabase, Db } from './database';
import { changeCounters, changeLog, reviewItems, settings, taskBlockers, tasks } from './schema';
import { findSqlError } from './sql-error';
import { withOwner } from './with-owner';

// Check and unique constraints reject bad rows in the database itself.
// Every owner id is random, so rows left by other runs never match.

const createdAt = new Date('2026-10-02T08:00:00.000Z');

const taskRow = (ownerId: string, overrides: Partial<typeof tasks.$inferInsert> = {}) => ({
  ownerId,
  id: randomUUID(),
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'a task',
  notes: '',
  captureText: '',
  dueMoveCount: 0,
  version: 1,
  createdAt,
  ...overrides,
});

const insertTask = (ownerId: string, overrides: Partial<typeof tasks.$inferInsert> = {}) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const row = taskRow(ownerId, overrides);
    yield* db.insert(tasks).values(row);
    return row.id;
  });

const reviewRow = (ownerId: string, overrides: Partial<typeof reviewItems.$inferInsert> = {}) => ({
  ownerId,
  id: randomUUID(),
  kind: 'a kind',
  subjects: [],
  payload: {},
  dedupeKey: 'k',
  createdAt,
  ...overrides,
});

const changeRow = (ownerId: string, overrides: Partial<typeof changeLog.$inferInsert>) => ({
  ownerId,
  seq: 1,
  entity: ChangeEntity.Task,
  entityId: randomUUID(),
  op: ChangeOp.Put,
  data: {},
  ...overrides,
});

const assertCheckViolation = (exit: Exit.Exit<unknown, unknown>, constraint: string) => {
  if (Exit.isSuccess(exit)) {
    return assert.fail(`expected ${constraint} to be violated, but the statement succeeded`);
  }
  const sqlError = findSqlError(Cause.squash(exit.cause));
  if (!sqlError) {
    return assert.fail(`expected an SqlError, got: ${String(Cause.squash(exit.cause))}`);
  }
  const reason = sqlError.reason;
  assert.strictEqual(reason._tag, 'ConstraintError');
  const cause = reason.cause as { readonly code?: string; readonly constraint?: string };
  assert.strictEqual(cause.code, '23514');
  assert.strictEqual(cause.constraint, constraint);
};

const assertUniqueViolation = (exit: Exit.Exit<unknown, unknown>, constraint: string) => {
  if (Exit.isSuccess(exit)) {
    return assert.fail(`expected ${constraint} to be violated, but the statement succeeded`);
  }
  const sqlError = findSqlError(Cause.squash(exit.cause));
  if (!sqlError) {
    return assert.fail(`expected an SqlError, got: ${String(Cause.squash(exit.cause))}`);
  }
  const reason = sqlError.reason;
  if (reason._tag !== 'UniqueViolation') {
    return assert.fail(`expected a UniqueViolation, got: ${reason._tag}`);
  }
  assert.strictEqual(reason.constraint, constraint);
};

interface CheckCase {
  readonly name: string;
  readonly constraint: string;
  readonly violate: (ownerId: string) => Effect.Effect<unknown, unknown, Db>;
}

const insertSettings = (ownerId: string, urgencyWindowDays: number) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.insert(settings).values({ ownerId, timeZone: 'Europe/Amsterdam', urgencyWindowDays });
  });

const checkCases: ReadonlyArray<CheckCase> = [
  {
    name: 'an estimate of 0 minutes',
    constraint: 'tasks_estimate_check',
    violate: (o) => insertTask(o, { estimateMinutes: 0 }),
  },
  {
    name: 'a due time of 24:00',
    constraint: 'tasks_due_time_check',
    violate: (o) => insertTask(o, { dueDate: '2026-10-05', dueTime: '24:00' }),
  },
  {
    name: 'a due time without a due date',
    constraint: 'tasks_due_time_check',
    violate: (o) => insertTask(o, { dueDate: null, dueTime: '10:00' }),
  },
  {
    name: 'an available-from time without an available-from date',
    constraint: 'tasks_available_from_time_check',
    violate: (o) => insertTask(o, { availableFromDate: null, availableFromTime: '10:00' }),
  },
  {
    name: 'a task that blocks itself',
    constraint: 'task_blockers_not_self_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        const id = yield* insertTask(o);
        yield* db
          .insert(taskBlockers)
          .values({ ownerId: o, id: randomUUID(), taskId: id, blockerId: id });
      }),
  },
  {
    name: 'an urgency window of 0 days',
    constraint: 'settings_urgency_window_check',
    violate: (o) => insertSettings(o, 0),
  },
  {
    name: 'a settings change with an entity id',
    constraint: 'change_log_entity_id_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db
          .insert(changeLog)
          .values(changeRow(o, { entity: ChangeEntity.Settings, entityId: randomUUID() }));
      }),
  },
  {
    name: 'a task change without an entity id',
    constraint: 'change_log_entity_id_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.insert(changeLog).values(changeRow(o, { entityId: null }));
      }),
  },
  {
    name: 'a remove change with data',
    constraint: 'change_log_data_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.insert(changeLog).values(changeRow(o, { op: ChangeOp.Remove, data: {} }));
      }),
  },
  {
    name: 'a put change without data',
    constraint: 'change_log_data_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.insert(changeLog).values(changeRow(o, { op: ChangeOp.Put, data: null }));
      }),
  },
  {
    name: 'pruned_through above last_seq',
    constraint: 'change_counters_seq_check',
    violate: (o) =>
      Effect.gen(function* () {
        const db = yield* Db;
        yield* db.insert(changeCounters).values({ ownerId: o, lastSeq: 1, prunedThrough: 2 });
      }),
  },
];

layer(appDatabase())('check and unique constraints', (it) => {
  for (const { name, constraint, violate } of checkCases) {
    it.effect(`${constraint} rejects ${name}`, () =>
      Effect.gen(function* () {
        const o = randomUUID();
        const exit = yield* Effect.exit(withOwner(o, violate(o)));

        yield* removeOwner(o);
        assertCheckViolation(exit, constraint);
      }),
    );
  }

  it.effect('task_blockers_link_key rejects the same link under two ids', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const o = randomUUID();
      const exit = yield* Effect.exit(
        withOwner(
          o,
          Effect.gen(function* () {
            const taskId = yield* insertTask(o);
            const blockerId = yield* insertTask(o);
            yield* db
              .insert(taskBlockers)
              .values({ ownerId: o, id: randomUUID(), taskId, blockerId });
            yield* db
              .insert(taskBlockers)
              .values({ ownerId: o, id: randomUUID(), taskId, blockerId });
          }),
        ),
      );

      yield* removeOwner(o);
      assertUniqueViolation(exit, 'task_blockers_link_key');
    }),
  );

  it.effect('review_items_open_dedupe_key rejects two unresolved items with one key', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const o = randomUUID();
      const exit = yield* Effect.exit(
        withOwner(
          o,
          Effect.gen(function* () {
            yield* db.insert(reviewItems).values(reviewRow(o));
            yield* db.insert(reviewItems).values(reviewRow(o));
          }),
        ),
      );

      yield* removeOwner(o);
      assertUniqueViolation(exit, 'review_items_open_dedupe_key');
    }),
  );

  it.effect('review_items_open_dedupe_key allows a resolved item beside an open one', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const o = randomUUID();
      const exit = yield* Effect.exit(
        withOwner(
          o,
          Effect.gen(function* () {
            yield* db.insert(reviewItems).values(reviewRow(o));
            yield* db.insert(reviewItems).values(reviewRow(o, { resolvedAt: createdAt }));
          }),
        ),
      );

      yield* removeOwner(o);
      assert.isTrue(Exit.isSuccess(exit), 'a resolved item must not count as open');
    }),
  );
});
