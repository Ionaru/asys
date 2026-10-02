// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { TaskKind, TaskStatus, WORK_ACTIVE_HOURS } from '@asys/domain';
import { PgClient } from '@effect/sql-pg';
import { assert, layer } from '@effect/vitest';
import { Cause, Duration, Effect, Exit } from 'effect';
import { removeOwner } from '../test/owners';
import { assertRejectedByRls } from '../test/rls';
import { appDatabase, Db, ownerDatabase } from './database';
import { findSqlError } from './sql-error';
import { areas, taskBlockers, tasks } from './schema';
import { withOwner } from './with-owner';

// These tests run against the real database (docker compose) and prove that
// row-level security, not application code, separates owners (ADR 0007), and
// that composite foreign keys keep links inside one owner.
// Every owner id is random, so rows left by other runs never match.

const singleConnection = {
  maxConnections: 1,
  minConnections: 1,
  idleTimeout: Duration.hours(1),
};

const taskRow = (ownerId: string, overrides: { readonly areaId?: string } = {}) => ({
  ownerId,
  id: randomUUID(),
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'a task',
  notes: '',
  captureText: '',
  dueMoveCount: 0,
  version: 1,
  createdAt: new Date('2026-10-02T08:00:00.000Z'),
  ...overrides,
});

const insertTask = (ownerId: string, overrides: { readonly areaId?: string } = {}) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const row = taskRow(ownerId, overrides);
    yield* db.insert(tasks).values(row);
    return row.id;
  });

const visibleOwners = Effect.gen(function* () {
  const db = yield* Db;
  const rows = yield* db.select({ ownerId: tasks.ownerId }).from(tasks);
  return new Set(rows.map((row) => row.ownerId));
});

layer(appDatabase())('as asys_app', (it) => {
  it.effect('a: withOwner(A) sees only A tasks and withOwner(B) only B tasks', () =>
    Effect.gen(function* () {
      const a = randomUUID();
      const b = randomUUID();
      yield* withOwner(a, insertTask(a));
      yield* withOwner(b, insertTask(b));

      const seenByA = yield* withOwner(a, visibleOwners);
      const seenByB = yield* withOwner(b, visibleOwners);

      yield* removeOwner(a);
      yield* removeOwner(b);
      assert.deepStrictEqual(seenByA, new Set([a]));
      assert.deepStrictEqual(seenByB, new Set([b]));
    }),
  );

  it.effect('c: inserting a task with another owner id is rejected by the with-check clause', () =>
    Effect.gen(function* () {
      const a = randomUUID();
      const b = randomUUID();
      // No RETURNING: that would also need the SELECT policy and hide the with-check clause.
      const exit = yield* Effect.exit(withOwner(a, insertTask(b)));

      yield* removeOwner(b);
      assertRejectedByRls(exit);
    }),
  );

  it.effect('a task of owner B cannot be linked as a blocker from owner A', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const a = randomUUID();
      const b = randomUUID();
      const x = yield* withOwner(b, insertTask(b));
      const y = yield* withOwner(a, insertTask(a));
      const z = randomUUID();
      yield* withOwner(
        a,
        db.insert(areas).values({
          ownerId: a,
          id: z,
          name: 'an area',
          activeHours: WORK_ACTIVE_HOURS,
          defaultPrivacy: null,
          version: 1,
        }),
      );

      // Owner B links its own task X to owner A's task Y.
      const blockerExit = yield* Effect.exit(
        withOwner(
          b,
          db.insert(taskBlockers).values({ ownerId: b, id: randomUUID(), taskId: x, blockerId: y }),
        ),
      );
      // Owner B links owner A's task Y to its own task X, so the task side is foreign.
      const taskExit = yield* Effect.exit(
        withOwner(
          b,
          db.insert(taskBlockers).values({ ownerId: b, id: randomUUID(), taskId: y, blockerId: x }),
        ),
      );
      // Owner B puts its own task in owner A's area Z.
      const areaExit = yield* Effect.exit(withOwner(b, insertTask(b, { areaId: z })));

      yield* removeOwner(a);
      yield* removeOwner(b);
      assertForeignKeyViolation(blockerExit, 'task_blockers_blocker_fk');
      assertForeignKeyViolation(taskExit, 'task_blockers_task_fk');
      assertForeignKeyViolation(areaExit, 'tasks_area_fk');
    }),
  );
});

const assertForeignKeyViolation = (exit: Exit.Exit<unknown, unknown>, constraint: string) => {
  if (Exit.isSuccess(exit)) {
    return assert.fail(`expected ${constraint} to be violated, but the insert succeeded`);
  }
  const sqlError = findSqlError(Cause.squash(exit.cause));
  if (!sqlError) {
    return assert.fail(`expected an SqlError, got: ${String(Cause.squash(exit.cause))}`);
  }
  const reason = sqlError.reason;
  assert.strictEqual(reason._tag, 'ConstraintError');
  const cause = reason.cause as { readonly code?: string; readonly constraint?: string };
  assert.strictEqual(cause.code, '23503');
  assert.strictEqual(cause.constraint, constraint);
};

layer(appDatabase(singleConnection))('as asys_app on one fresh connection', (it) => {
  it.effect('b: with no owner set, a select returns zero tasks and an insert fails', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const b = randomUUID();
      // Seeded through a separate pool, so this connection has never set app.owner_id.
      yield* withOwner(b, insertTask(b)).pipe(Effect.provide(appDatabase()));

      // A connection that never set app.owner_id: current_setting returns NULL.
      assert.strictEqual((yield* db.select().from(tasks)).length, 0);
      assertRejectedByRls(yield* Effect.exit(insertTask(b)));

      // The same connection after a transaction set it: current_setting returns ''.
      yield* withOwner(b, visibleOwners);
      assert.strictEqual((yield* db.select().from(tasks)).length, 0);
      assertRejectedByRls(yield* Effect.exit(insertTask(b)));

      yield* removeOwner(b);
    }),
  );
});

layer(appDatabase(singleConnection))('as asys_app on one connection', (it) => {
  it.effect('d: a query right after withOwner(A) on the same connection sees no tasks', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const pg = yield* PgClient.PgClient;
      const a = randomUUID();

      const inside = yield* withOwner(
        a,
        Effect.gen(function* () {
          yield* insertTask(a);
          const [row] = yield* pg<{ readonly pid: number }>`select pg_backend_pid() as pid`;
          return row.pid;
        }),
      );
      const [after] = yield* pg<{ readonly pid: number }>`select pg_backend_pid() as pid`;
      const leaked = yield* db.select().from(tasks);

      yield* removeOwner(a);
      assert.strictEqual(after.pid, inside, 'both queries must use the same backend');
      assert.strictEqual(leaked.length, 0);
    }),
  );
});

layer(ownerDatabase())('as asys_owner', (it) => {
  it.effect('f: forced row-level security still filters tasks for the table owner', () =>
    Effect.gen(function* () {
      const a = randomUUID();
      const b = randomUUID();
      yield* withOwner(a, insertTask(a));
      yield* withOwner(b, insertTask(b));

      const seenByA = yield* withOwner(a, visibleOwners);
      const seenWithoutOwner = yield* visibleOwners;

      yield* removeOwner(a);
      yield* removeOwner(b);
      assert.deepStrictEqual(seenByA, new Set([a]));
      assert.strictEqual(seenWithoutOwner.size, 0);
    }),
  );
});
