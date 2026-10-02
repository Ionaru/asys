// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { ChangesExpired, TaskSchema } from '@asys/contract';
import {
  ChangeEntity,
  ChangeOp,
  TaskKind,
  TaskStatus,
  WORK_ACTIVE_HOURS,
  type Area,
  type BlockerLink,
  type Change,
  type ReviewItem,
  type Task,
} from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { Cause, Deferred, Effect, Exit, Fiber, Schema } from 'effect';
import { sql } from 'drizzle-orm';
import { Db, appDatabase, ownerDatabase } from '../db/database';
import { changeLog } from '../db/schema';
import { findSqlError } from '../db/sql-error';
import { withOwner } from '../db/with-owner';
import { newOwner, removeOwner } from '../test/owners';
import { appendChanges, changesSince, lockCounter } from './change-log';

// These tests run against the real database (docker compose).

const task = (): Task => ({
  id: randomUUID(),
  kind: TaskKind.Task,
  status: TaskStatus.Open,
  title: 'a task',
  notes: '',
  captureText: '',
  areaId: null,
  availableFrom: null,
  due: null,
  estimateMinutes: null,
  important: null,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: 1_000_000,
  closedAt: null,
});

const putTask = (after: Task): Change => ({
  entity: ChangeEntity.Task,
  op: ChangeOp.Put,
  id: after.id,
  after,
});

/** Locks the counter, then appends `changes` after its last seq, in one transaction. */
const append = (owner: string, changes: ReadonlyArray<Change>) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const counter = yield* lockCounter;
      return yield* appendChanges(owner, counter.lastSeq, changes);
    }),
  );

const readLog = (owner: string) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      return yield* db.select().from(changeLog).orderBy(changeLog.seq);
    }),
  );

const readCounter = (owner: string) => withOwner(owner, lockCounter);

layer(appDatabase())('lockCounter', (it) => {
  it.effect('returns the counter of a new owner as numbers', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const counter = yield* withOwner(owner, lockCounter);

      yield* removeOwner(owner);
      assert.deepStrictEqual(counter, { lastSeq: 0, prunedThrough: 0 });
      assert.strictEqual(typeof counter.lastSeq, 'number');
      assert.strictEqual(typeof counter.prunedThrough, 'number');
    }),
  );

  it.effect('is a defect, not a typed failure, for an owner without a counter', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(withOwner(randomUUID(), lockCounter));

      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        assert.isTrue(Cause.hasDies(exit.cause));
        assert.isFalse(Cause.hasFails(exit.cause));
      }
    }),
  );
});

layer(appDatabase())('appendChanges', (it) => {
  it.effect('numbers changes from the locked counter and moves the counter', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const a = task();
      const b = task();
      const settings = { timeZone: 'Europe/London', urgencyWindowDays: 5 };
      const linkId = randomUUID();

      const afterTasks = yield* append(owner, [putTask(a), putTask(b)]);
      const logAfterTasks = yield* readLog(owner);
      const counterAfterTasks = yield* readCounter(owner);

      const afterSettings = yield* append(owner, [
        { entity: ChangeEntity.Settings, op: ChangeOp.Put, after: settings },
      ]);
      const afterRemove = yield* append(owner, [
        { entity: ChangeEntity.Blocker, op: ChangeOp.Remove, id: linkId },
      ]);
      const afterEmpty = yield* withOwner(
        owner,
        Effect.gen(function* () {
          const counter = yield* lockCounter;
          assert.strictEqual(counter.lastSeq, 4);
          return yield* appendChanges(owner, counter.lastSeq, []);
        }),
      );
      const log = yield* readLog(owner);
      const counter = yield* readCounter(owner);

      yield* removeOwner(owner);
      assert.strictEqual(afterTasks, 2);
      assert.deepStrictEqual(
        logAfterTasks.map((row) => ({
          seq: row.seq,
          entity: row.entity,
          op: row.op,
          entityId: row.entityId,
          data: row.data,
        })),
        [
          {
            seq: 1,
            entity: ChangeEntity.Task,
            op: ChangeOp.Put,
            entityId: a.id,
            data: Schema.encodeSync(TaskSchema)(a),
          },
          {
            seq: 2,
            entity: ChangeEntity.Task,
            op: ChangeOp.Put,
            entityId: b.id,
            data: Schema.encodeSync(TaskSchema)(b),
          },
        ],
      );
      assert.strictEqual(counterAfterTasks.lastSeq, 2);

      assert.strictEqual(afterSettings, 3);
      assert.deepStrictEqual(
        { entityId: log[2].entityId, data: log[2].data },
        { entityId: null, data: settings },
      );
      assert.strictEqual(afterRemove, 4);
      assert.deepStrictEqual(
        { entityId: log[3].entityId, data: log[3].data },
        { entityId: linkId, data: null },
      );
      assert.strictEqual(afterEmpty, 4);
      assert.strictEqual(log.length, 4);
      assert.strictEqual(counter.lastSeq, 4);
    }),
  );
});

layer(appDatabase())('changesSince', (it) => {
  it.effect('returns exactly the entries after its argument, in order', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const a = task();
      const b = task();
      yield* append(owner, [putTask(a), putTask(b)]);

      const all = yield* changesSince(owner, 0);
      const none = yield* changesSince(owner, 2);
      const last = yield* changesSince(owner, 1);

      yield* removeOwner(owner);
      const entryA = { seq: 1, ...putTask(a) };
      const entryB = { seq: 2, ...putTask(b) };
      assert.deepStrictEqual(all, { seq: 2, entries: [entryA, entryB] });
      assert.deepStrictEqual(none, { seq: 2, entries: [] });
      assert.deepStrictEqual(last, { seq: 2, entries: [entryB] });
    }),
  );

  it.effect('returns entries in seq order whatever the insertion order', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const tasks = [task(), task(), task()];
      yield* withOwner(
        owner,
        Effect.gen(function* () {
          const db = yield* Db;
          for (const seq of [3, 1, 2]) {
            const created = tasks[seq - 1];
            yield* db.insert(changeLog).values({
              ownerId: owner,
              seq,
              entity: ChangeEntity.Task,
              entityId: created.id,
              op: ChangeOp.Put,
              data: Schema.encodeSync(TaskSchema)(created),
            });
          }
          yield* db.execute(sql`update change_counters set last_seq = 3`);
        }),
      );

      const result = yield* changesSince(owner, 0);

      yield* removeOwner(owner);
      assert.deepStrictEqual(result, {
        seq: 3,
        entries: tasks.map((created, index) => ({ seq: index + 1, ...putTask(created) })),
      });
    }),
  );

  it.effect('round-trips all six change shapes', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const blocked = task();
      const link: BlockerLink = { id: randomUUID(), taskId: blocked.id, blockerId: randomUUID() };
      const area: Area = {
        id: randomUUID(),
        name: 'An area',
        activeHours: WORK_ACTIVE_HOURS,
        defaultPrivacy: null,
        version: 1,
      };
      const item: ReviewItem = {
        id: randomUUID(),
        kind: 'expectation_failed',
        subjects: [{ type: 'task', id: blocked.id }],
        payload: { reason: 'x', nested: { count: 2 } },
        dedupeKey: 'k1',
        createdAt: 1_000_000,
        resolvedAt: null,
      };
      const changes: ReadonlyArray<Change> = [
        putTask(blocked),
        { entity: ChangeEntity.Blocker, op: ChangeOp.Put, id: link.id, after: link },
        { entity: ChangeEntity.Blocker, op: ChangeOp.Remove, id: link.id },
        { entity: ChangeEntity.Area, op: ChangeOp.Put, id: area.id, after: area },
        { entity: ChangeEntity.ReviewItem, op: ChangeOp.Put, id: item.id, after: item },
        {
          entity: ChangeEntity.Settings,
          op: ChangeOp.Put,
          after: { timeZone: 'Europe/London', urgencyWindowDays: 5 },
        },
      ];
      yield* append(owner, changes);

      const result = yield* changesSince(owner, 0);

      yield* removeOwner(owner);
      assert.deepStrictEqual(
        result.entries,
        changes.map((change, index) => ({ ...change, seq: index + 1 })),
      );
    }),
  );

  it.effect('expires outside [pruned_through, last_seq]', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      yield* withOwner(
        owner,
        Effect.gen(function* () {
          const db = yield* Db;
          yield* db.execute(sql`update change_counters set last_seq = 7, pruned_through = 5`);
        }),
      ).pipe(Effect.provide(ownerDatabase()));

      const tooOld = yield* Effect.flip(changesSince(owner, 4));
      const atPruned = yield* changesSince(owner, 5);
      const atHead = yield* changesSince(owner, 7);
      const tooNew = yield* Effect.flip(changesSince(owner, 8));

      yield* removeOwner(owner);
      assert.instanceOf(tooOld, ChangesExpired);
      assert.strictEqual((tooOld as ChangesExpired).after, 4);
      assert.strictEqual(atPruned.seq, 7);
      assert.deepStrictEqual(atHead, { seq: 7, entries: [] });
      assert.instanceOf(tooNew, ChangesExpired);
      assert.strictEqual((tooNew as ChangesExpired).after, 8);
    }),
  );
});

layer(appDatabase(), { excludeTestServices: true })('the counter lock', (it) => {
  it.effect('blocks a second locker while the first transaction is open', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const db = yield* Db;
      const locked = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const holder = yield* Effect.forkChild(
        withOwner(
          owner,
          Effect.gen(function* () {
            yield* lockCounter;
            yield* Deferred.succeed(locked, undefined);
            yield* Deferred.await(release);
          }),
        ),
      );
      yield* Deferred.await(locked);

      const exit = yield* Effect.exit(
        withOwner(owner, db.execute(sql`select 1 from change_counters for update nowait`)),
      );

      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(holder);
      yield* removeOwner(owner);
      assert.isTrue(Exit.isFailure(exit));
      if (Exit.isFailure(exit)) {
        const sqlError = findSqlError(Cause.squash(exit.cause));
        assert.isDefined(sqlError);
        assert.strictEqual(sqlError?.reason._tag, 'LockTimeoutError');
      }
    }),
  );
});
