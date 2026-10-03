// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import { eq, inArray } from 'drizzle-orm';
import { Cause, Effect, Exit } from 'effect';
import { appDatabase, Db } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { claimJobs, oldestDueJobAgeSeconds } from './claim';

// These tests run against the real database (docker compose), on the real
// clock: claim_jobs and the age use the database clock and see every owner.
// Due jobs sit in a band from 1900 on, so they sort before any other due row,
// and the tests assert only on their own rows.

const LEASE_MS = 10 * 60 * 1000;

const bandAt = (seconds: number) => new Date(Date.UTC(1900, 0, 1, 0, 0, seconds));

const insertJob = (owner: string, overrides: Partial<typeof jobs.$inferInsert> = {}) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const id = overrides.id ?? randomUUID();
    yield* withOwner(
      owner,
      db.insert(jobs).values({
        ownerId: owner,
        id,
        kind: 'test',
        payload: {},
        runAt: bandAt(0),
        ...overrides,
      }),
    );
    return id;
  });

const readJobs = (owner: string, ids: ReadonlyArray<string>) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      return yield* db
        .select()
        .from(jobs)
        .where(inArray(jobs.id, [...ids]));
    }),
  );

const pairs = (claimed: ReadonlyArray<{ readonly id: string; readonly ownerId: string }>) =>
  new Set(claimed.map((job) => `${job.ownerId}/${job.id}`));

layer(appDatabase(), { excludeTestServices: true })('claimJobs', (it) => {
  it.effect('claims the due jobs of two owners while no owner is set', () =>
    Effect.gen(function* () {
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      const db = yield* Db;
      const idA = yield* insertJob(a, { runAt: bandAt(0) });
      const idB = yield* insertJob(b, { runAt: bandAt(1) });

      const before = Date.now();
      const claimed = yield* claimJobs({ lease: '10 minutes', max: 100 });
      const after = Date.now();

      const claimedPairs = pairs(claimed);
      assert.isTrue(claimedPairs.has(`${a}/${idA}`));
      assert.isTrue(claimedPairs.has(`${b}/${idB}`));
      for (const [owner, id] of [
        [a, idA],
        [b, idB],
      ]) {
        const [row] = yield* readJobs(owner, [id]);
        assert.strictEqual(row.attempts, 1);
        assert.isNotNull(row.claimedUntil);
        const until = row.claimedUntil?.getTime() ?? 0;
        assert.isAtLeast(until, before + LEASE_MS - 1000);
        assert.isAtMost(until, after + LEASE_MS + 1000);
      }
      const visible = yield* db.select().from(jobs).where(eq(jobs.id, idA));
      assert.deepStrictEqual(visible, []);
    }),
  );

  it.effect('skips finished, future and leased jobs and reclaims an expired lease', () =>
    Effect.gen(function* () {
      const owner = yield* scopedOwner();
      const hour = 60 * 60 * 1000;
      const finished = yield* insertJob(owner, { runAt: bandAt(0), finishedAt: new Date() });
      const future = yield* insertJob(owner, { runAt: new Date(Date.now() + hour) });
      const leased = yield* insertJob(owner, {
        runAt: bandAt(1),
        attempts: 1,
        claimedUntil: new Date(Date.now() + hour),
      });
      const expired = yield* insertJob(owner, {
        runAt: bandAt(2),
        attempts: 1,
        claimedUntil: new Date(Date.now() - 60 * 1000),
      });

      const claimed = yield* claimJobs({ lease: '10 minutes', max: 100 });

      const mine = new Set([finished, future, leased, expired]);
      assert.deepStrictEqual(
        claimed.filter((job) => mine.has(job.id)).map((job) => job.id),
        [expired],
      );
      const rows = yield* readJobs(owner, [finished, future, leased, expired]);
      const attempts = Object.fromEntries(rows.map((row) => [row.id, row.attempts]));
      assert.deepStrictEqual(attempts, {
        [finished]: 0,
        [future]: 0,
        [leased]: 1,
        [expired]: 2,
      });
    }),
  );

  it.effect('claims only max jobs, the earliest first', () =>
    Effect.gen(function* () {
      const owner = yield* scopedOwner();
      // Inserted latest first, so heap order is the reverse of run_at order.
      const ids: Array<string> = [];
      for (let i = 4; i >= 0; i--) {
        ids[i] = yield* insertJob(owner, { runAt: bandAt(i) });
      }

      const claimed = yield* claimJobs({ lease: '10 minutes', max: 2 });

      assert.deepStrictEqual(new Set(claimed.map((job) => job.id)), new Set(ids.slice(0, 2)));
      const rows = yield* readJobs(owner, ids);
      const attempts = Object.fromEntries(rows.map((row) => [row.id, row.attempts]));
      assert.deepStrictEqual(attempts, Object.fromEntries(ids.map((id, i) => [id, i < 2 ? 1 : 0])));
    }),
  );

  it.effect('dies on a bad lease or max', () =>
    Effect.gen(function* () {
      const bad = [
        { lease: 0, max: 1 },
        { lease: -1, max: 1 },
        { lease: Number.POSITIVE_INFINITY, max: 1 },
        { lease: '10 minutes' as const, max: 0 },
        { lease: '10 minutes' as const, max: 1.5 },
      ];
      for (const options of bad) {
        const exit = yield* Effect.exit(claimJobs(options));
        assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause));
      }
    }),
  );
});

layer(appDatabase(), { excludeTestServices: true })('oldestDueJobAgeSeconds', (it) => {
  it.effect('counts unfinished due jobs, claimed ones too, and ignores the rest', () =>
    Effect.gen(function* () {
      const owner = yield* scopedOwner();
      const ancient = new Date('1752-01-01T00:00:00.000Z');
      const baseline = yield* oldestDueJobAgeSeconds;

      yield* insertJob(owner, { runAt: ancient, finishedAt: new Date() });
      yield* insertJob(owner, { runAt: ancient, failed: true, finishedAt: new Date() });
      yield* insertJob(owner, { runAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      const ignored = yield* oldestDueJobAgeSeconds;

      yield* insertJob(owner, {
        runAt: ancient,
        claimedUntil: new Date(Date.now() + 60 * 60 * 1000),
      });
      const counted = yield* oldestDueJobAgeSeconds;

      assert.isAtLeast(ignored, baseline);
      assert.isAtMost(ignored, baseline + 5);
      assert.isAtLeast(counted, 100_000 * 86_400);
    }),
  );
});
