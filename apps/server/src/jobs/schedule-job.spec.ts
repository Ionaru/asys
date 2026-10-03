// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Cause, Effect, Exit } from 'effect';
import { lockCounter } from '../changes/change-log';
import { appDatabase, Db } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { scheduleJob, type ScheduleJobInput } from './schedule-job';

// These tests run against the real database (docker compose).
// Every test uses its own owner and asserts only on its own rows.

const T1 = Date.parse('2030-01-01T00:00:00.000Z');
const T2 = Date.parse('2030-06-01T00:00:00.000Z');

const input = (overrides: Partial<ScheduleJobInput> = {}): ScheduleJobInput => ({
  id: randomUUID(),
  kind: 'test',
  payload: { n: 1 },
  runAt: T1,
  cron: null,
  dedupeKey: null,
  ...overrides,
});

/** Schedules in the owner's write transaction, counter lock first. */
const schedule = (owner: string, job: ScheduleJobInput) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      yield* lockCounter;
      return yield* scheduleJob(owner, job);
    }),
  );

const jobsWhere = (owner: string, column: 'id' | 'dedupeKey', value: string) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      return yield* db.select().from(jobs).where(eq(jobs[column], value));
    }),
  );

layer(appDatabase())('scheduleJob', (it) => {
  it.effect('inserts a fresh row with the defaults and returns the given id', () =>
    Effect.gen(function* () {
      const owner = yield* scopedOwner();
      const job = input({ dedupeKey: `fresh:${randomUUID()}`, cron: '0 9 * * *' });

      const id = yield* schedule(owner, job);
      const rows = yield* jobsWhere(owner, 'id', job.id);

      assert.strictEqual(id, job.id);
      assert.strictEqual(rows.length, 1);
      const [row] = rows;
      assert.strictEqual(row.kind, 'test');
      assert.deepStrictEqual(row.payload, { n: 1 });
      assert.strictEqual(row.runAt.getTime(), T1);
      assert.strictEqual(row.cron, '0 9 * * *');
      assert.strictEqual(row.dedupeKey, job.dedupeKey);
      assert.strictEqual(row.attempts, 0);
      assert.strictEqual(row.failed, false);
      assert.isNull(row.claimedUntil);
      assert.isNull(row.finishedAt);
      assert.isNull(row.lastError);
    }),
  );

  it.effect('makes two rows for two calls without a dedupe key', () =>
    Effect.gen(function* () {
      const owner = yield* scopedOwner();
      const first = input();
      const second = input();

      const firstId = yield* schedule(owner, first);
      const secondId = yield* schedule(owner, second);

      assert.strictEqual(firstId, first.id);
      assert.strictEqual(secondId, second.id);
      assert.strictEqual((yield* jobsWhere(owner, 'id', first.id)).length, 1);
      assert.strictEqual((yield* jobsWhere(owner, 'id', second.id)).length, 1);
    }),
  );

  it.effect('moves the existing row of a dedupe key and resets it', () =>
    Effect.gen(function* () {
      const owner = yield* scopedOwner();
      const db = yield* Db;
      const dedupeKey = `reminder:${randomUUID()}`;
      const first = input({ dedupeKey, kind: 'first', payload: { n: 1 }, runAt: T1, cron: null });
      yield* schedule(owner, first);
      yield* withOwner(
        owner,
        db
          .update(jobs)
          .set({
            attempts: 5,
            failed: true,
            finishedAt: new Date(T1),
            lastError: 'x',
            claimedUntil: new Date(T1 + 3_600_000),
          })
          .where(eq(jobs.id, first.id)),
      );

      const second = input({
        dedupeKey,
        kind: 'second',
        payload: { n: 2 },
        runAt: T2,
        cron: '0 9 * * *',
      });
      const id = yield* schedule(owner, second);
      const rows = yield* jobsWhere(owner, 'dedupeKey', dedupeKey);

      assert.strictEqual(id, first.id);
      assert.strictEqual(rows.length, 1);
      const [row] = rows;
      assert.strictEqual(row.id, first.id);
      assert.strictEqual(row.kind, 'first');
      assert.strictEqual(row.claimedUntil?.getTime(), T1 + 3_600_000);
      assert.strictEqual(row.runAt.getTime(), T2);
      assert.deepStrictEqual(row.payload, { n: 2 });
      assert.strictEqual(row.cron, '0 9 * * *');
      assert.strictEqual(row.attempts, 0);
      assert.strictEqual(row.failed, false);
      assert.isNull(row.finishedAt);
      assert.isNull(row.lastError);
    }),
  );

  it.effect('keeps dedupe keys apart per owner', () =>
    Effect.gen(function* () {
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      const db = yield* Db;
      const first = input({ dedupeKey: 'test-key' });
      const second = input({ dedupeKey: 'test-key' });

      const idA = yield* schedule(a, first);
      const idB = yield* schedule(b, second);
      const seenByB = yield* withOwner(b, db.select().from(jobs).where(eq(jobs.id, first.id)));

      assert.strictEqual(idA, first.id);
      assert.strictEqual(idB, second.id);
      assert.strictEqual((yield* jobsWhere(a, 'id', first.id)).length, 1);
      assert.strictEqual((yield* jobsWhere(b, 'id', second.id)).length, 1);
      assert.deepStrictEqual(seenByB, []);
    }),
  );

  it.effect('dies on an invalid cron expression and writes no row', () =>
    Effect.gen(function* () {
      const owner = yield* scopedOwner();
      for (const cron of ['bad', '0 0 31 2 *']) {
        const job = input({ cron });

        const exit = yield* Effect.exit(schedule(owner, job));
        const rows = yield* jobsWhere(owner, 'id', job.id);

        assert.isTrue(Exit.isFailure(exit), `${cron}: fails`);
        if (Exit.isFailure(exit)) {
          assert.isTrue(Cause.hasDies(exit.cause), `${cron}: dies`);
        }
        assert.deepStrictEqual(rows, [], `${cron}: no row`);
      }
    }),
  );
});
