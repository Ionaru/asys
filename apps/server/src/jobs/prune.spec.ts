// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { ChangesExpired, IdempotencyKeyReused, type CommandRequest } from '@asys/contract';
import { CommandTag, TransitionResultTag } from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { and, eq } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { changesSince, lockCounter } from '../changes/change-log';
import { runCommand } from '../commands/run-command';
import { appDatabase, Db, ownerDatabase } from '../db/database';
import { changeCounters, changeLog, idempotencyKeys, jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { nextCronRun } from './cron';
import { coreJobsLayer, CoreJobKind, PRUNE_CRON, pruneOwner } from './prune';
import { JobRegistry } from './registry';
import { JobOutcome, runDueJobs } from './worker';

// These tests run against the real database (docker compose), on the real clock.

const DAY_MS = 24 * 60 * 60 * 1000;

const capture = (idempotencyKey: string = randomUUID()): CommandRequest => ({
  _tag: CommandTag.CaptureTask,
  idempotencyKey,
  taskId: randomUUID(),
  title: 'a task',
  captureText: '',
});

const captureN = (o: string, count: number) =>
  Effect.forEach(Array.from({ length: count }), () => runCommand(o, capture()), { concurrency: 1 });

/** Prunes as the job does: inside the owner's transaction, after the counter lock. */
const prune = (o: string, now: number) =>
  withOwner(
    o,
    Effect.gen(function* () {
      yield* lockCounter;
      yield* pruneOwner(o, now);
    }),
  );

/** `asys_app` has no UPDATE on these tables, so back-dating goes through `asys_owner`. */
const backdateLog = (o: string, seqs: ReadonlyArray<number>, createdAt: Date) =>
  withOwner(
    o,
    Effect.gen(function* () {
      const db = yield* Db;
      for (const seq of seqs) {
        yield* db
          .update(changeLog)
          .set({ createdAt })
          .where(and(eq(changeLog.ownerId, o), eq(changeLog.seq, seq)));
      }
    }),
  ).pipe(Effect.provide(ownerDatabase()));

const backdateKeys = (o: string, createdAt: Date, key?: string) =>
  withOwner(
    o,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db
        .update(idempotencyKeys)
        .set({ createdAt })
        .where(
          key === undefined
            ? eq(idempotencyKeys.ownerId, o)
            : and(eq(idempotencyKeys.ownerId, o), eq(idempotencyKeys.key, key)),
        );
    }),
  ).pipe(Effect.provide(ownerDatabase()));

const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

const state = (o: string) =>
  withOwner(
    o,
    Effect.gen(function* () {
      const db = yield* Db;
      const log = yield* db.select({ seq: changeLog.seq }).from(changeLog);
      const keys = yield* db.select({ key: idempotencyKeys.key }).from(idempotencyKeys);
      const [counter] = yield* db.select().from(changeCounters);
      return {
        seqs: log.map((row) => row.seq).toSorted((a, b) => a - b),
        keys: keys.map((row) => row.key),
        prunedThrough: counter.prunedThrough,
      };
    }),
  );

layer(appDatabase(), { excludeTestServices: true })('pruneOwner', (it) => {
  it.effect('empties the log, records pruned_through and makes since() expire', () =>
    Effect.gen(function* () {
      const o = yield* scopedOwner();
      yield* captureN(o, 3);

      yield* prune(o, Date.now() + 31 * DAY_MS);

      const after = yield* state(o);
      const fromZero = yield* Effect.flip(changesSince(o, 0));
      const fromTwo = yield* Effect.flip(changesSince(o, 2));
      const fromThree = yield* changesSince(o, 3);
      assert.deepStrictEqual(after.seqs, []);
      assert.strictEqual(after.prunedThrough, 3);
      assert.instanceOf(fromZero, ChangesExpired);
      assert.instanceOf(fromTwo, ChangesExpired);
      assert.deepStrictEqual(fromThree, { seq: 3, entries: [] });
    }),
  );

  it.effect('a partial prune keeps the newer entries', () =>
    Effect.gen(function* () {
      const o = yield* scopedOwner();
      yield* captureN(o, 3);
      yield* backdateLog(o, [1, 2], daysAgo(31));

      yield* prune(o, Date.now());

      const after = yield* state(o);
      const fromOne = yield* Effect.flip(changesSince(o, 1));
      const fromTwo = yield* changesSince(o, 2);
      assert.deepStrictEqual(after.seqs, [3]);
      assert.strictEqual(after.prunedThrough, 2);
      assert.instanceOf(fromOne, ChangesExpired);
      assert.strictEqual(fromTwo.entries.length, 1);
      assert.strictEqual(fromTwo.entries[0].seq, 3);
    }),
  );

  it.effect('deletes the contiguous prefix up to the newest old entry', () =>
    Effect.gen(function* () {
      const o = yield* scopedOwner();
      yield* captureN(o, 3);
      yield* backdateLog(o, [2], daysAgo(31));

      yield* prune(o, Date.now());

      const after = yield* state(o);
      const fromOne = yield* Effect.flip(changesSince(o, 1));
      const fromTwo = yield* changesSince(o, 2);
      assert.deepStrictEqual(after.seqs, [3]);
      assert.strictEqual(after.prunedThrough, 2);
      assert.instanceOf(fromOne, ChangesExpired);
      assert.deepStrictEqual(
        fromTwo.entries.map((entry) => entry.seq),
        [3],
      );
    }),
  );

  it.effect(
    'keeps an entry and a key of exactly 30 days and deletes them a millisecond later',
    () =>
      Effect.gen(function* () {
        const o = yield* scopedOwner();
        const t = Date.UTC(2026, 0, 1);
        yield* captureN(o, 1);
        yield* backdateLog(o, [1], new Date(t));
        yield* backdateKeys(o, new Date(t));

        yield* prune(o, t + 30 * DAY_MS);
        const atBoundary = yield* state(o);
        yield* prune(o, t + 30 * DAY_MS + 1);
        const pastBoundary = yield* state(o);

        assert.deepStrictEqual(atBoundary.seqs, [1]);
        assert.strictEqual(atBoundary.keys.length, 1);
        assert.strictEqual(atBoundary.prunedThrough, 0);
        assert.deepStrictEqual(pastBoundary.seqs, []);
        assert.strictEqual(pastBoundary.keys.length, 0);
        assert.strictEqual(pastBoundary.prunedThrough, 1);
      }),
  );

  it.effect('changes nothing when no entry is old', () =>
    Effect.gen(function* () {
      const o = yield* scopedOwner();
      yield* captureN(o, 3);
      const before = yield* state(o);

      yield* prune(o, Date.now());

      const after = yield* state(o);
      assert.deepStrictEqual(after.seqs, [1, 2, 3]);
      assert.strictEqual(after.prunedThrough, 0);
      assert.deepStrictEqual(after, before);
    }),
  );

  it.effect('never moves pruned_through backwards', () =>
    Effect.gen(function* () {
      const o = yield* scopedOwner();
      yield* captureN(o, 3);
      yield* prune(o, Date.now() + 31 * DAY_MS);
      assert.strictEqual((yield* state(o)).prunedThrough, 3);

      yield* prune(o, Date.now());

      assert.strictEqual((yield* state(o)).prunedThrough, 3);
    }),
  );

  it.effect('forgets an old idempotency key, so the key is evaluated afresh', () =>
    Effect.gen(function* () {
      const o = yield* scopedOwner();
      const keyK = randomUUID();
      const keyFresh = randomUUID();
      yield* runCommand(o, capture(keyK));
      yield* runCommand(o, capture(keyFresh));
      yield* backdateKeys(o, daysAgo(31), keyK);

      const before = yield* Effect.flip(runCommand(o, capture(keyK)));
      yield* prune(o, Date.now());
      const keysAfter = (yield* state(o)).keys;
      const afterPrune = yield* runCommand(o, capture(keyK));

      assert.instanceOf(before, IdempotencyKeyReused);
      assert.deepStrictEqual(keysAfter, [keyFresh]);
      assert.strictEqual(afterPrune._tag, TransitionResultTag.Applied);
    }),
  );

  it.effect("leaves another owner's log, keys and pruned_through untouched", () =>
    Effect.gen(function* () {
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      yield* captureN(a, 2);
      yield* captureN(b, 2);
      yield* backdateLog(a, [1, 2], daysAgo(31));
      yield* backdateKeys(a, daysAgo(31));
      yield* backdateLog(b, [1, 2], daysAgo(31));
      yield* backdateKeys(b, daysAgo(31));
      const bBefore = yield* state(b);

      yield* prune(a, Date.now());

      const aAfter = yield* state(a);
      const bAfter = yield* state(b);
      assert.deepStrictEqual(aAfter.seqs, []);
      assert.deepStrictEqual(aAfter.keys, []);
      assert.strictEqual(aAfter.prunedThrough, 2);
      assert.deepStrictEqual(bAfter, bBefore);
      assert.deepStrictEqual(bAfter.seqs, [1, 2]);
      assert.strictEqual(bAfter.keys.length, 2);
      assert.strictEqual(bAfter.prunedThrough, 0);
    }),
  );
});

layer(Layer.mergeAll(appDatabase(), coreJobsLayer.pipe(Layer.provideMerge(JobRegistry.layer))), {
  excludeTestServices: true,
})('the prune job through the worker', (it) => {
  it.effect('prunes the owner and moves to the next 03:00 Amsterdam time', () =>
    Effect.gen(function* () {
      const o = yield* scopedOwner();
      const db = yield* Db;
      yield* captureN(o, 3);
      yield* backdateLog(o, [1, 2], daysAgo(31));
      const [job] = yield* withOwner(
        o,
        db.select().from(jobs).where(eq(jobs.kind, CoreJobKind.Prune)),
      );
      yield* withOwner(
        o,
        db
          .update(jobs)
          .set({ runAt: new Date(Date.UTC(1900, 0, 1)) })
          .where(eq(jobs.id, job.id)),
      );

      const before = Date.now();
      const runs = yield* runDueJobs({ max: 100 });
      const after = Date.now();

      const run = runs.find((r) => r.id === job.id);
      const [row] = yield* withOwner(o, db.select().from(jobs).where(eq(jobs.id, job.id)));
      const log = yield* state(o);
      assert.strictEqual(run?.outcome, JobOutcome.Succeeded);
      assert.deepStrictEqual(log.seqs, [3]);
      assert.strictEqual(log.prunedThrough, 2);
      assert.include(
        [
          nextCronRun(PRUNE_CRON, 'Europe/Amsterdam', before),
          nextCronRun(PRUNE_CRON, 'Europe/Amsterdam', after),
        ],
        row.runAt.getTime(),
      );
      assert.strictEqual(row.attempts, 0);
      assert.strictEqual(row.finishedAt, null);
    }),
  );
});
