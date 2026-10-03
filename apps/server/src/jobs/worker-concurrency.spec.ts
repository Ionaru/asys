// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import { eq, sql } from 'drizzle-orm';
import { Deferred, Effect, Fiber, Layer } from 'effect';
import { lockCounter } from '../changes/change-log';
import { appDatabase, Db } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { type JobContext, JobRegistry } from './registry';
import { scheduleJob } from './schedule-job';
import { JobOutcome, runDueJobs } from './worker';

// These tests run against the real database (docker compose), on the real
// clock. A command (scheduleJob under the owner's counter lock) and the worker
// take the counter first and the jobs rows second, so neither order deadlocks
// (decision 8 of the slice 1 plan). Both sides are forked from the test body: a
// fiber forked inside a transaction would inherit its connection.

const HOUR_MS = 60 * 60 * 1000;

const bandAt = (seconds: number) => new Date(Date.UTC(1900, 0, 1, 0, 0, seconds));

const backendPid = Effect.gen(function* () {
  const db = yield* Db;
  const rows = yield* db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`, 'objects');
  return rows[0].pid;
});

/** Polls until some backend waits for a lock the backend `pid` holds. */
const waitUntilBlocking = (pid: number) =>
  Effect.gen(function* () {
    const db = yield* Db;
    while (true) {
      const rows = yield* db.execute<{ n: number }>(
        sql`select count(*)::int as n from pg_stat_activity where ${pid}::int = any(pg_blocking_pids(pid))`,
        'objects',
      );
      if (rows[0].n > 0) return;
      yield* Effect.sleep('20 millis');
    }
  }).pipe(
    Effect.timeout('3 seconds'),
    Effect.catchTag('TimeoutError', () =>
      Effect.die(new Error(`No backend ever waited for a lock held by backend ${pid}`)),
    ),
  );

const readJob = (owner: string, id: string) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      const rows = yield* db.select().from(jobs).where(eq(jobs.id, id));
      return rows[0];
    }),
  );

const insertJob = (owner: string, kind: string, dedupeKey: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const id = randomUUID();
    yield* withOwner(
      owner,
      db
        .insert(jobs)
        .values({ ownerId: owner, id, kind, payload: {}, runAt: bandAt(0), dedupeKey }),
    );
    return id;
  });

const moveJob = (owner: string, kind: string, dedupeKey: string, runAt: number) =>
  Effect.gen(function* () {
    yield* lockCounter;
    yield* scheduleJob(owner, {
      id: randomUUID(),
      kind,
      payload: {},
      runAt,
      cron: null,
      dedupeKey,
    });
  });

layer(Layer.mergeAll(appDatabase(), JobRegistry.layer), { excludeTestServices: true })(
  'the job worker, concurrency',
  (it) => {
    it.effect(
      'skips a job that a command moved while the worker waited for the counter',
      () =>
        Effect.gen(function* () {
          const owner = yield* scopedOwner();
          const registry = yield* JobRegistry;
          const kind = `test-${randomUUID()}`;
          const calls: Array<JobContext> = [];
          yield* registry.register(kind, (job) => {
            calls.push(job);
            return Effect.void;
          });
          const key = `k-${randomUUID()}`;
          const id = yield* insertJob(owner, kind, key);
          const movedAt = Date.now() + HOUR_MS;
          const pidSeen = yield* Deferred.make<number>();
          const release = yield* Deferred.make<void>();

          const command = yield* Effect.forkChild(
            withOwner(
              owner,
              Effect.gen(function* () {
                yield* lockCounter;
                yield* Deferred.succeed(pidSeen, yield* backendPid);
                yield* Deferred.await(release);
                yield* moveJob(owner, kind, key, movedAt);
              }),
            ),
          );
          const pid = yield* Deferred.await(pidSeen);
          const worker = yield* Effect.forkChild(runDueJobs({ max: 100 }));
          yield* waitUntilBlocking(pid).pipe(
            Effect.tapCause(() => Deferred.succeed(release, undefined)),
          );
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(command);
          const runs = yield* Fiber.join(worker);

          assert.strictEqual(runs.find((run) => run.id === id)?.outcome, JobOutcome.Skipped);
          assert.strictEqual(calls.length, 0);
          const row = yield* readJob(owner, id);
          assert.strictEqual(row.runAt.getTime(), movedAt);
          assert.strictEqual(row.attempts, 0);
          assert.isNull(row.finishedAt);
        }),
      15_000,
    );

    it.effect(
      'lets a command wait for a running job and then move it',
      () =>
        Effect.gen(function* () {
          const owner = yield* scopedOwner();
          const registry = yield* JobRegistry;
          const kind = `test-${randomUUID()}`;
          const calls: Array<JobContext> = [];
          const pidSeen = yield* Deferred.make<number>();
          const releaseHandler = yield* Deferred.make<void>();
          yield* registry.register(kind, (job) =>
            Effect.gen(function* () {
              calls.push(job);
              yield* Deferred.succeed(pidSeen, yield* backendPid);
              yield* Deferred.await(releaseHandler);
            }),
          );
          const key = `k-${randomUUID()}`;
          const id = yield* insertJob(owner, kind, key);
          const movedAt = Date.now() + HOUR_MS;

          const worker = yield* Effect.forkChild(runDueJobs({ max: 100 }));
          const pid = yield* Deferred.await(pidSeen);
          const command = yield* Effect.forkChild(
            withOwner(owner, moveJob(owner, kind, key, movedAt)),
          );
          yield* waitUntilBlocking(pid).pipe(
            Effect.tapCause(() => Deferred.succeed(releaseHandler, undefined)),
          );
          yield* Deferred.succeed(releaseHandler, undefined);
          const runs = yield* Fiber.join(worker);
          yield* Fiber.join(command);

          assert.strictEqual(runs.find((run) => run.id === id)?.outcome, JobOutcome.Succeeded);
          assert.strictEqual(calls.length, 1);
          const row = yield* readJob(owner, id);
          assert.strictEqual(row.runAt.getTime(), movedAt);
          assert.isNull(row.finishedAt);
          assert.strictEqual(row.attempts, 0);
        }),
      15_000,
    );
  },
);
