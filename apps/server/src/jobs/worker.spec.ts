// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Deferred, Effect, Fiber, Layer } from 'effect';
import { lockCounter } from '../changes/change-log';
import { appDatabase, Db } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { removeOwner, scopedOwner } from '../test/owners';
import { createOwner } from '../owners/create-owner';
import { claimJobs } from './claim';
import { nextCronRun } from './cron';
import { type JobContext, type JobHandler, JobRegistry } from './registry';
import { scheduleJob } from './schedule-job';
import { JobOutcome, jobWorkerLayer, runDueJobs, runJob, type JobRun } from './worker';

// These tests run against the real database (docker compose), on the real
// clock. The worker claims the jobs of every owner, so each due job sits in a
// band from 1900 on, and the tests assert only on their own rows and runs.

const CRON = '0 3 * * *';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const bandAt = (seconds: number) => new Date(Date.UTC(1900, 0, 1, 0, 0, seconds));

/** Registers a handler under a fresh kind and records the contexts it is called with. */
const registerKind = (handler: JobHandler = () => Effect.void) =>
  Effect.gen(function* () {
    const registry = yield* JobRegistry;
    const kind = `test-${randomUUID()}`;
    const calls: Array<JobContext> = [];
    yield* registry.register(kind, (job) => {
      calls.push(job);
      return handler(job);
    });
    return { kind, calls };
  });

const insertJob = (
  owner: string,
  overrides: Partial<typeof jobs.$inferInsert> & { kind: string },
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const id = overrides.id ?? randomUUID();
    yield* withOwner(
      owner,
      db.insert(jobs).values({
        ownerId: owner,
        id,
        payload: {},
        runAt: bandAt(0),
        ...overrides,
      }),
    );
    return id;
  });

const readJob = (owner: string, id: string) =>
  withOwner(
    owner,
    Effect.gen(function* () {
      const db = yield* Db;
      const rows = yield* db.select().from(jobs).where(eq(jobs.id, id));
      return rows[0];
    }),
  );

const runFor = (runs: ReadonlyArray<JobRun>, id: string) => {
  const run = runs.find((candidate) => candidate.id === id);
  if (run === undefined) throw new Error(`No run for job ${id}`);
  return run;
};

const boom = () => Effect.fail({ _tag: 'Boom' });

const waitUntil = (description: string, check: Effect.Effect<boolean, unknown, Db>) =>
  Effect.gen(function* () {
    while (!(yield* check)) {
      yield* Effect.sleep('50 millis');
    }
  }).pipe(
    Effect.timeoutOrElse({
      duration: '3 seconds',
      orElse: () => Effect.die(new Error(`Timed out: ${description}`)),
    }),
  );

layer(Layer.mergeAll(appDatabase(), JobRegistry.layer), { excludeTestServices: true })(
  'the job worker',
  (it) => {
    it.effect('runs a due one-off job under its owner and finishes it', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const { kind, calls } = yield* registerKind();
        const id = yield* insertJob(owner, { kind, payload: { n: 1 } });

        const before = Date.now();
        const runs = yield* runDueJobs({ max: 100 });
        const after = Date.now();

        const run = runFor(runs, id);
        assert.strictEqual(run.outcome, JobOutcome.Succeeded);
        assert.strictEqual(run.ownerId, owner);
        assert.strictEqual(calls.length, 1);
        const call = calls[0];
        assert.strictEqual(call.ownerId, owner);
        assert.strictEqual(call.id, id);
        assert.strictEqual(call.kind, kind);
        assert.deepStrictEqual(call.payload, { n: 1 });
        assert.strictEqual(call.runAt, bandAt(0).getTime());
        assert.isAtLeast(call.now, before);
        assert.isAtMost(call.now, after);
        const row = yield* readJob(owner, id);
        assert.isAtLeast(row.finishedAt?.getTime() ?? 0, before);
        assert.isAtMost(row.finishedAt?.getTime() ?? Infinity, after);
        assert.isNull(row.claimedUntil);
        assert.strictEqual(row.attempts, 1);
      }),
    );

    it.effect('runs a cron job that missed three days once and schedules the next run', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const { kind, calls } = yield* registerKind();
        const id = yield* insertJob(owner, {
          kind,
          cron: CRON,
          runAt: new Date(Date.now() - 3 * DAY_MS),
        });

        const before = Date.now();
        const runs = yield* runDueJobs({ max: 100 });
        const after = Date.now();

        assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Succeeded);
        assert.strictEqual(calls.length, 1);
        const row = yield* readJob(owner, id);
        const runAt = row.runAt.getTime();
        assert.isAbove(runAt, after);
        assert.isAtMost(runAt, after + 25 * HOUR_MS);
        assert.include(
          [
            nextCronRun(CRON, 'Europe/Amsterdam', before),
            nextCronRun(CRON, 'Europe/Amsterdam', after),
          ],
          runAt,
        );
        assert.strictEqual(row.attempts, 0);
        assert.isNull(row.finishedAt);
        assert.isNull(row.claimedUntil);

        yield* runDueJobs({ max: 100 });
        assert.strictEqual(calls.length, 1);
      }),
    );

    it.effect('evaluates the cron expression in the time zone of the owner', () =>
      Effect.gen(function* () {
        const owner = randomUUID();
        yield* createOwner({ ownerId: owner, name: 'Test owner', timeZone: 'Asia/Tokyo' });
        yield* Effect.gen(function* () {
          const { kind } = yield* registerKind();
          const id = yield* insertJob(owner, { kind, cron: CRON });

          const before = Date.now();
          const runs = yield* runDueJobs({ max: 100 });
          const after = Date.now();

          assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Succeeded);
          const row = yield* readJob(owner, id);
          assert.include(
            [nextCronRun(CRON, 'Asia/Tokyo', before), nextCronRun(CRON, 'Asia/Tokyo', after)],
            row.runAt.getTime(),
          );
        }).pipe(Effect.ensuring(removeOwner(owner).pipe(Effect.orDie)));
      }),
    );

    it.effect('skips a job that finished between the claim and the run', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const db = yield* Db;
        const { kind, calls } = yield* registerKind();
        const id = yield* insertJob(owner, { kind });
        const claimed = (yield* claimJobs({ lease: '5 minutes', max: 100 })).find(
          (job) => job.id === id,
        );
        assert.isDefined(claimed);
        if (claimed === undefined) return;
        const finishedAt = new Date(Date.UTC(2000, 0, 1));
        yield* withOwner(owner, db.update(jobs).set({ finishedAt }).where(eq(jobs.id, id)));

        const outcome = yield* runJob(claimed);

        assert.strictEqual(outcome, JobOutcome.Skipped);
        assert.strictEqual(calls.length, 0);
        const row = yield* readJob(owner, id);
        assert.isNull(row.claimedUntil);
        assert.strictEqual(row.finishedAt?.getTime(), finishedAt.getTime());
        assert.strictEqual(row.attempts, 1);
      }),
    );

    it.effect('retries with a longer backoff on the attempt before the last', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const { kind } = yield* registerKind(boom);
        const id = yield* insertJob(owner, { kind, attempts: 6 });

        const before = Date.now();
        const runs = yield* runDueJobs({ max: 100 });
        const after = Date.now();

        assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Retrying);
        const row = yield* readJob(owner, id);
        assert.strictEqual(row.attempts, 7);
        assert.isFalse(row.failed);
        assert.isNull(row.finishedAt);
        assert.strictEqual(row.lastError, 'Fail: Boom');
        assert.isNull(row.claimedUntil);
        assert.isAtLeast(row.runAt.getTime(), before + 800 * 64);
        assert.isAtMost(row.runAt.getTime(), after + 1200 * 64);
      }),
    );

    it.effect('evaluates the cron expression in a GMT owner time zone', () =>
      Effect.gen(function* () {
        const owner = randomUUID();
        yield* createOwner({ ownerId: owner, name: 'GMT owner', timeZone: 'GMT' });
        yield* Effect.gen(function* () {
          const { kind } = yield* registerKind();
          const id = yield* insertJob(owner, { kind, cron: CRON });

          const before = Date.now();
          const runs = yield* runDueJobs({ max: 100 });
          const after = Date.now();

          assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Succeeded);
          const row = yield* readJob(owner, id);
          assert.include(
            [nextCronRun(CRON, 'GMT', before), nextCronRun(CRON, 'GMT', after)],
            row.runAt.getTime(),
          );
        }).pipe(Effect.ensuring(removeOwner(owner).pipe(Effect.orDie)));
      }),
    );

    it.effect('resets the attempts and the last error of a cron job that succeeds', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const { kind } = yield* registerKind();
        const id = yield* insertJob(owner, { kind, cron: CRON, attempts: 3, lastError: 'x' });

        const runs = yield* runDueJobs({ max: 100 });

        assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Succeeded);
        const row = yield* readJob(owner, id);
        assert.strictEqual(row.attempts, 0);
        assert.isNull(row.lastError);
        assert.isNull(row.claimedUntil);
      }),
    );

    it.effect('retries a failing job after a backoff and records a sanitised error', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const { kind } = yield* registerKind(boom);
        const id = yield* insertJob(owner, { kind });

        const before = Date.now();
        const runs = yield* runDueJobs({ max: 100 });
        const after = Date.now();

        assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Retrying);
        const row = yield* readJob(owner, id);
        assert.strictEqual(row.attempts, 1);
        assert.isAtLeast(row.runAt.getTime(), before + 800);
        assert.isAtMost(row.runAt.getTime(), after + 1200);
        assert.strictEqual(row.lastError, 'Fail: Boom');
        assert.isNull(row.finishedAt);
        assert.isNull(row.claimedUntil);
      }),
    );

    it.effect('rolls back what a failing handler wrote', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const sideId = randomUUID();
        const { kind } = yield* registerKind((job) =>
          Effect.gen(function* () {
            yield* scheduleJob(job.ownerId, {
              id: sideId,
              kind: 'side',
              payload: {},
              runAt: Date.now() + DAY_MS,
              cron: null,
              dedupeKey: null,
            });
            return yield* boom();
          }),
        );
        const id = yield* insertJob(owner, { kind });

        const runs = yield* runDueJobs({ max: 100 });

        assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Retrying);
        assert.isUndefined(yield* readJob(owner, sideId));
        assert.isNotNull((yield* readJob(owner, id)).lastError);
      }),
    );

    it.effect('fails a one-off job for good on its last attempt', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const { kind } = yield* registerKind(boom);
        const id = yield* insertJob(owner, { kind, attempts: 7 });

        const runs = yield* runDueJobs({ max: 100 });

        assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Failed);
        const row = yield* readJob(owner, id);
        assert.strictEqual(row.attempts, 8);
        assert.isTrue(row.failed);
        assert.isNotNull(row.finishedAt);
      }),
    );

    it.effect('gives a cron job its next run after its last attempt fails', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const { kind } = yield* registerKind(boom);
        const id = yield* insertJob(owner, { kind, cron: CRON, attempts: 7 });

        const before = Date.now();
        const runs = yield* runDueJobs({ max: 100 });
        const after = Date.now();

        assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Failed);
        const row = yield* readJob(owner, id);
        assert.strictEqual(row.attempts, 0);
        assert.include(
          [
            nextCronRun(CRON, 'Europe/Amsterdam', before),
            nextCronRun(CRON, 'Europe/Amsterdam', after),
          ],
          row.runAt.getTime(),
        );
        assert.isFalse(row.failed);
        assert.isNull(row.finishedAt);
        assert.strictEqual(row.lastError, 'Fail: Boom');
      }),
    );

    it.effect('treats a job moved by a command before the run as not yet attempted', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const { kind } = yield* registerKind(boom);
        const key = `k-${randomUUID()}`;
        const id = yield* insertJob(owner, { kind, dedupeKey: key });
        const claimed = (yield* claimJobs({ lease: '5 minutes', max: 100 })).find(
          (job) => job.id === id,
        );
        assert.isDefined(claimed);
        if (claimed === undefined) return;
        yield* withOwner(
          owner,
          Effect.gen(function* () {
            yield* lockCounter;
            yield* scheduleJob(owner, {
              id: randomUUID(),
              kind,
              payload: {},
              runAt: bandAt(0).getTime() - 60_000,
              cron: null,
              dedupeKey: key,
            });
          }),
        );

        const before = Date.now();
        const outcome = yield* runJob(claimed);
        const after = Date.now();

        assert.strictEqual(outcome, JobOutcome.Retrying);
        const row = yield* readJob(owner, id);
        assert.strictEqual(row.attempts, 1);
        assert.isAtLeast(row.runAt.getTime(), before + 800);
        assert.isAtMost(row.runAt.getTime(), after + 1200);
      }),
    );

    it.effect('retries a job of a kind nobody registered', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const id = yield* insertJob(owner, { kind: `never-${randomUUID()}` });

        const runs = yield* runDueJobs({ max: 100 });

        assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Retrying);
        assert.strictEqual((yield* readJob(owner, id)).lastError, 'Fail: UnknownJobKind');
      }),
    );

    it.effect('keeps a defect in one handler from stopping the rest of the batch', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const dying = yield* registerKind(() => Effect.die(new Error('x')));
        const fine = yield* registerKind();
        const dyingId = yield* insertJob(owner, { kind: dying.kind, runAt: bandAt(0) });
        const fineId = yield* insertJob(owner, { kind: fine.kind, runAt: bandAt(1) });

        const runs = yield* runDueJobs({ max: 100 });

        assert.strictEqual(runFor(runs, dyingId).outcome, JobOutcome.Retrying);
        assert.strictEqual((yield* readJob(owner, dyingId)).lastError, 'Die: Error');
        assert.strictEqual(runFor(runs, fineId).outcome, JobOutcome.Succeeded);
        assert.strictEqual(fine.calls.length, 1);
      }),
    );

    it.effect('runs only max jobs, the earliest first', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const first = yield* registerKind();
        const second = yield* registerKind();
        const secondId = yield* insertJob(owner, { kind: second.kind, runAt: bandAt(1) });
        const firstId = yield* insertJob(owner, { kind: first.kind, runAt: bandAt(0) });

        const runs = yield* runDueJobs({ max: 1 });

        assert.strictEqual(runFor(runs, firstId).outcome, JobOutcome.Succeeded);
        assert.isFalse(runs.some((run) => run.id === secondId));
        assert.strictEqual(first.calls.length, 1);
        assert.strictEqual(second.calls.length, 0);
      }),
    );

    it.effect('leaves a job its handler re-scheduled for tomorrow unfinished', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const key = `k-${randomUUID()}`;
        let tomorrow = 0;
        const { kind } = yield* registerKind((job) =>
          Effect.gen(function* () {
            tomorrow = Date.now() + DAY_MS;
            yield* scheduleJob(job.ownerId, {
              id: randomUUID(),
              kind: job.kind,
              payload: {},
              runAt: tomorrow,
              cron: null,
              dedupeKey: key,
            });
          }),
        );
        const id = yield* insertJob(owner, { kind, dedupeKey: key });

        yield* runDueJobs({ max: 100 });

        const row = yield* readJob(owner, id);
        assert.strictEqual(row.runAt.getTime(), tomorrow);
        assert.isNull(row.finishedAt);
      }),
    );

    it.effect('does not lease a job its handler re-scheduled into the past', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const key = `k-${randomUUID()}`;
        const { kind } = yield* registerKind((job) =>
          scheduleJob(job.ownerId, {
            id: randomUUID(),
            kind: job.kind,
            payload: {},
            runAt: bandAt(0).getTime() - 60_000,
            cron: null,
            dedupeKey: key,
          }),
        );
        const id = yield* insertJob(owner, { kind, dedupeKey: key });

        yield* runDueJobs({ max: 100 });

        assert.isNull((yield* readJob(owner, id)).claimedUntil);
        const claimed = yield* claimJobs({ lease: '5 minutes', max: 100 });
        assert.isTrue(claimed.some((job) => job.id === id));
      }),
    );

    it.effect('skips a job that was moved into the future after the claim', () =>
      Effect.gen(function* () {
        const owner = yield* scopedOwner();
        const db = yield* Db;
        const { kind, calls } = yield* registerKind();
        const id = yield* insertJob(owner, { kind });
        const claimed = (yield* claimJobs({ lease: '5 minutes', max: 100 })).find(
          (job) => job.id === id,
        );
        assert.isDefined(claimed);
        if (claimed === undefined) return;
        const moved = new Date(Date.now() + HOUR_MS);
        yield* withOwner(owner, db.update(jobs).set({ runAt: moved }).where(eq(jobs.id, id)));

        const outcome = yield* runJob(claimed);

        assert.strictEqual(outcome, JobOutcome.Skipped);
        assert.strictEqual(calls.length, 0);
        const row = yield* readJob(owner, id);
        assert.isNull(row.claimedUntil);
        assert.strictEqual(row.runAt.getTime(), moved.getTime());
      }),
    );

    it.effect('aborts a job whose owner has no counter row and leaves its lease', () =>
      Effect.gen(function* () {
        const owner = randomUUID();
        yield* Effect.gen(function* () {
          const { kind, calls } = yield* registerKind();
          const id = yield* insertJob(owner, { kind });

          const runs = yield* runDueJobs({ max: 100 });

          assert.strictEqual(runFor(runs, id).outcome, JobOutcome.Aborted);
          assert.strictEqual(calls.length, 0);
          const row = yield* readJob(owner, id);
          assert.isAbove(row.claimedUntil?.getTime() ?? 0, Date.now());
          assert.strictEqual(row.attempts, 1);
          assert.isNull(row.lastError);
        }).pipe(Effect.ensuring(removeOwner(owner).pipe(Effect.orDie)));
      }),
    );

    it.effect(
      'aborts the job of an owner whose counter is locked and still runs the next owner',
      () =>
        Effect.gen(function* () {
          const a = yield* scopedOwner();
          const b = yield* scopedOwner();
          const { kind } = yield* registerKind();
          const idA = yield* insertJob(a, { kind, runAt: bandAt(0) });
          const idB = yield* insertJob(b, { kind, runAt: bandAt(1) });
          const locked = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const holder = yield* Effect.forkChild(
            withOwner(
              a,
              Effect.gen(function* () {
                yield* lockCounter;
                yield* Deferred.succeed(locked, undefined);
                yield* Deferred.await(release);
              }),
            ),
          );
          yield* Deferred.await(locked);

          const runs = yield* runDueJobs({ lockTimeout: '200 millis', max: 100 }).pipe(
            Effect.ensuring(Deferred.succeed(release, undefined)),
          );
          yield* Fiber.join(holder);

          assert.strictEqual(runFor(runs, idA).outcome, JobOutcome.Aborted);
          assert.strictEqual(runFor(runs, idB).outcome, JobOutcome.Succeeded);
        }),
      15_000,
    );

    it.effect(
      'polls while the worker layer is open and stops when its scope closes',
      () =>
        Effect.gen(function* () {
          const owner = yield* scopedOwner();
          const polled = yield* registerKind();
          const polledId = yield* insertJob(owner, { kind: polled.kind });

          yield* Effect.scoped(
            Effect.gen(function* () {
              yield* Layer.build(jobWorkerLayer({ interval: '50 millis' }));
              yield* waitUntil(
                'the worker never finished the job',
                Effect.map(readJob(owner, polledId), (row) => row.finishedAt !== null),
              );
            }),
          );

          const late = yield* registerKind();
          const lateId = yield* insertJob(owner, { kind: late.kind });
          yield* Effect.sleep('500 millis');

          assert.strictEqual(polled.calls.length, 1);
          assert.strictEqual(late.calls.length, 0);
          assert.isNull((yield* readJob(owner, lateId)).finishedAt);
        }),
      15_000,
    );
  },
);
