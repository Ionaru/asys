// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import { sql } from 'drizzle-orm';
import { Deferred, Effect, Fiber } from 'effect';
import { appDatabase, Db } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { claimJobs } from './claim';

// These tests run against the real database (docker compose), on the real
// clock. claim_jobs skips rows another transaction has locked, so concurrent
// claimers never get the same job (ADR 0012).

const bandAt = (seconds: number) => new Date(Date.UTC(1900, 0, 1, 0, 0, seconds));

const insertBand = (owner: string, count: number) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const ids = Array.from({ length: count }, () => randomUUID());
    yield* withOwner(
      owner,
      db.insert(jobs).values(
        ids.map((id, i) => ({
          ownerId: owner,
          id,
          kind: 'test',
          payload: {},
          runAt: bandAt(i),
        })),
      ),
    );
    return ids;
  });

layer(appDatabase(), { excludeTestServices: true })('claimJobs, concurrency', (it) => {
  it.effect(
    'skips the rows another open transaction has claimed',
    () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const db = yield* Db;
        const ids = yield* insertBand(owner, 10);
        const claimed = yield* Deferred.make<void>();
        const done = yield* Deferred.make<void>();

        // Both claimers are forked from the test body: a fiber forked inside a
        // transaction would inherit its connection.
        const first = yield* Effect.forkChild(
          db.transaction(() =>
            Effect.gen(function* () {
              const jobsClaimed = yield* claimJobs({ lease: '10 minutes', max: 5 });
              yield* Deferred.succeed(claimed, undefined);
              yield* Deferred.await(done);
              return jobsClaimed;
            }),
          ),
        );
        yield* Deferred.await(claimed);

        const second = yield* Effect.forkChild(
          db.transaction(() =>
            Effect.gen(function* () {
              yield* db.execute(sql`select set_config('lock_timeout', '2000ms', true)`);
              return yield* claimJobs({ lease: '10 minutes', max: 5 });
            }),
          ),
        );
        const secondClaimed = yield* Fiber.join(second).pipe(
          Effect.ensuring(Deferred.succeed(done, undefined)),
        );
        const firstClaimed = yield* Fiber.join(first);

        const firstIds = new Set(firstClaimed.map((job) => job.id));
        const secondIds = new Set(secondClaimed.map((job) => job.id));
        assert.strictEqual(firstIds.size, 5);
        assert.strictEqual(secondIds.size, 5);
        assert.strictEqual(new Set([...firstIds, ...secondIds]).size, 10);
        assert.deepStrictEqual(new Set([...firstIds, ...secondIds]), new Set(ids));
      }),
    15_000,
  );

  it.effect(
    'hands each of forty jobs to exactly one of four claimers',
    () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const ids = yield* insertBand(owner, 40);
        const mine = new Set<string>(ids);

        const claimer = Effect.gen(function* () {
          const seen: Array<string> = [];
          while (true) {
            const batch = yield* claimJobs({ lease: '10 minutes', max: 3 });
            if (batch.length === 0) return seen;
            seen.push(...batch.map((job) => job.id).filter((id) => mine.has(id)));
          }
        });
        const results = yield* Effect.forEach([1, 2, 3, 4], () => claimer, {
          concurrency: 'unbounded',
        });

        const all = results.flat();
        assert.strictEqual(all.length, 40);
        assert.deepStrictEqual(new Set(all), mine);
      }),
    15_000,
  );
});
