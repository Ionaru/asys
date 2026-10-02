// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import {
  ChangeEntity,
  ChangeOp,
  TaskKind,
  TaskStatus,
  type BlockerLink,
  type ReviewItem,
  type Task,
} from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { Db, appDatabase } from '../db/database';
import { linkToRow, reviewItemToRow, rowToArea, taskToRow } from '../db/mappers';
import { areas, reviewItems, taskBlockers, tasks } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { newOwner, removeOwner } from '../test/owners';
import { appendChanges, lockCounter } from './change-log';
import { readSnapshot } from './snapshot';

// These tests run against the real database (docker compose).

const task = (status: TaskStatus = TaskStatus.Open): Task => ({
  id: randomUUID(),
  kind: TaskKind.Task,
  status,
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

const reviewItem = (resolvedAt: number | null): ReviewItem => ({
  id: randomUUID(),
  kind: 'expectation_failed',
  subjects: [],
  payload: { reason: 'x' },
  dedupeKey: null,
  createdAt: 1_000_000,
  resolvedAt,
});

const byId = <T extends { readonly id: string }>(items: readonly T[]) =>
  items.toSorted((a, b) => a.id.localeCompare(b.id));

const putTask = (after: Task) => ({
  entity: ChangeEntity.Task as const,
  op: ChangeOp.Put as const,
  id: after.id,
  after,
});

layer(appDatabase())('readSnapshot', (it) => {
  it.effect('holds exactly the working set', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const t1 = task(TaskStatus.Open);
      const t2 = task(TaskStatus.Delegated);
      const t3 = task(TaskStatus.Done);
      const t4 = task(TaskStatus.Dropped);
      const t5 = task(TaskStatus.Skipped);
      const l1: BlockerLink = { id: randomUUID(), taskId: t1.id, blockerId: t3.id };
      const l2: BlockerLink = { id: randomUUID(), taskId: t3.id, blockerId: t1.id };
      const l3: BlockerLink = { id: randomUUID(), taskId: t5.id, blockerId: t1.id };
      const r1 = reviewItem(null);
      const r2 = reviewItem(2_000_000);
      const seededAreas = yield* withOwner(
        owner,
        Effect.gen(function* () {
          const db = yield* Db;
          yield* db.insert(tasks).values([t1, t2, t3, t4, t5].map((t) => taskToRow(owner, t)));
          yield* db.insert(taskBlockers).values([l1, l2, l3].map((l) => linkToRow(owner, l)));
          yield* db.insert(reviewItems).values([r1, r2].map((r) => reviewItemToRow(owner, r)));
          const rows = yield* db.select().from(areas);
          return rows.map(rowToArea);
        }),
      );

      const snapshot = yield* readSnapshot(owner);

      yield* removeOwner(owner);
      assert.strictEqual(seededAreas.length, 2);
      assert.deepStrictEqual(byId(snapshot.tasks), byId([t1, t2]));
      assert.deepStrictEqual(byId(snapshot.blockers), [l1]);
      assert.deepStrictEqual(byId(snapshot.areas), byId(seededAreas));
      assert.deepStrictEqual(byId(snapshot.reviewItems), [r1]);
      assert.deepStrictEqual(snapshot.settings, {
        timeZone: 'Europe/Amsterdam',
        urgencyWindowDays: 2,
      });
      assert.strictEqual(snapshot.seq, 0);
    }),
  );

  it.effect('reports the counter last_seq as seq', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      yield* withOwner(
        owner,
        Effect.gen(function* () {
          const counter = yield* lockCounter;
          yield* appendChanges(owner, counter.lastSeq, [putTask(task())]);
        }),
      );

      const snapshot = yield* readSnapshot(owner);

      yield* removeOwner(owner);
      assert.strictEqual(snapshot.seq, 1);
    }),
  );
});

layer(appDatabase(), { excludeTestServices: true })(
  'readSnapshot under concurrent writes',
  (it) => {
    it.effect('is consistent with its seq for every read', () =>
      Effect.gen(function* () {
        const owner = yield* newOwner();
        const done = yield* Deferred.make<void>();

        const write = Effect.gen(function* () {
          const db = yield* Db;
          const created = task();
          yield* withOwner(
            owner,
            Effect.gen(function* () {
              const counter = yield* lockCounter;
              yield* db.insert(tasks).values(taskToRow(owner, created));
              yield* appendChanges(owner, counter.lastSeq, [putTask(created)]);
            }),
          );
        });
        const writers = yield* Effect.forkChild(
          Effect.forEach(Array.from({ length: 100 }), () => write, {
            concurrency: 'unbounded',
            discard: true,
          }).pipe(Effect.andThen(Deferred.succeed(done, undefined))),
        );

        const reads = yield* Effect.gen(function* () {
          const seen: Array<{ readonly seq: number; readonly tasks: number }> = [];
          while (!(yield* Deferred.isDone(done))) {
            const snapshot = yield* readSnapshot(owner);
            seen.push({ seq: snapshot.seq, tasks: snapshot.tasks.length });
            yield* Effect.yieldNow;
          }
          const final = yield* readSnapshot(owner);
          seen.push({ seq: final.seq, tasks: final.tasks.length });
          return seen;
        }).pipe(Effect.provide(appDatabase({ maxConnections: 2 })));
        yield* Fiber.join(writers);

        yield* removeOwner(owner);
        assert.isTrue(reads.every((read) => read.tasks === read.seq));
        assert.deepStrictEqual(reads.at(-1), { seq: 100, tasks: 100 });
        assert.isAtLeast(reads.filter((read) => read.seq > 0 && read.seq < 100).length, 10);
      }),
    );
  },
);
