// SPDX-License-Identifier: EUPL-1.2
import type { Instant } from '@asys/domain';
import { and, eq, sql } from 'drizzle-orm';
import { Clock, Duration, Effect, Exit, Layer, Schedule } from 'effect';
import { lockCounter } from '../changes/change-log';
import { Db } from '../db/database';
import { jobs, settings } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { describeError } from '../logging/describe-error';
import { MAX_ATTEMPTS, retryDelay } from './backoff';
import { claimJobs, type ClaimedJob } from './claim';
import { nextCronRun } from './cron';
import { UnknownJobKind } from './job-error';
import { JobRegistry } from './registry';

/** What happened to a claimed job in one run. */
export enum JobOutcome {
  Succeeded = 'succeeded',
  Retrying = 'retrying',
  Failed = 'failed',
  Skipped = 'skipped',
  Aborted = 'aborted',
}

/** The outcome of one claimed job. */
export interface JobRun {
  readonly id: string;
  readonly ownerId: string;
  readonly outcome: JobOutcome;
}

const body = (claimed: ClaimedJob, lockTimeout: Duration.Input) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const registry = yield* JobRegistry;
    yield* db.execute(
      sql`select set_config('lock_timeout', ${`${Duration.toMillis(lockTimeout)}ms`}, true)`,
    );
    yield* lockCounter;

    const settingsRows = yield* db.select({ timeZone: settings.timeZone }).from(settings);
    if (settingsRows.length !== 1) {
      return yield* Effect.die(`Expected one settings row, found ${settingsRows.length}`);
    }
    const timeZone = settingsRows[0].timeZone;
    const now: Instant = yield* Clock.currentTimeMillis;

    const rows = yield* db
      .select({
        kind: jobs.kind,
        payload: jobs.payload,
        runAt: jobs.runAt,
        cron: jobs.cron,
        attempts: jobs.attempts,
        finishedAt: jobs.finishedAt,
        due: sql<boolean>`${jobs.runAt} <= now()`.mapWith(Boolean),
      })
      .from(jobs)
      .where(and(eq(jobs.ownerId, claimed.ownerId), eq(jobs.id, claimed.id)))
      .for('update');
    if (rows.length === 0) return JobOutcome.Skipped;
    const row = rows[0];

    yield* db
      .update(jobs)
      .set({ claimedUntil: null })
      .where(and(eq(jobs.ownerId, claimed.ownerId), eq(jobs.id, claimed.id)));
    if (!row.due || row.finishedAt !== null) return JobOutcome.Skipped;

    const runAt: Instant = row.runAt.getTime();
    const unchanged = and(
      eq(jobs.ownerId, claimed.ownerId),
      eq(jobs.id, claimed.id),
      eq(jobs.runAt, row.runAt),
    );
    const nextRun = (cron: string): Date =>
      new Date(nextCronRun(cron, timeZone, Math.max(now, runAt)));

    const handler = yield* registry.get(row.kind);
    const exit = yield* Effect.exit(
      db.transaction(() =>
        handler === undefined
          ? Effect.fail(new UnknownJobKind({ kind: row.kind }))
          : handler({
              ownerId: claimed.ownerId,
              id: claimed.id,
              kind: row.kind,
              payload: row.payload,
              runAt,
              now,
            }),
      ),
    );

    if (Exit.isSuccess(exit)) {
      yield* db
        .update(jobs)
        .set(
          row.cron === null
            ? { finishedAt: new Date(now) }
            : { runAt: nextRun(row.cron), attempts: 0, lastError: null },
        )
        .where(unchanged);
      return JobOutcome.Succeeded;
    }

    const lastError = describeError(exit.cause);
    const attempts = Math.max(row.attempts, 1);
    if (attempts < MAX_ATTEMPTS) {
      const delay = yield* retryDelay(attempts);
      yield* db
        .update(jobs)
        .set({ attempts, runAt: new Date(now + delay), lastError })
        .where(unchanged);
      return JobOutcome.Retrying;
    }
    yield* db
      .update(jobs)
      .set(
        row.cron === null
          ? { attempts, failed: true, finishedAt: new Date(now), lastError }
          : { attempts: 0, runAt: nextRun(row.cron), lastError },
      )
      .where(unchanged);
    return JobOutcome.Failed;
  });

/**
 * Runs one claimed job in one owner-scoped transaction. Takes the owner's counter lock
 * first (the lock order is the counter, then jobs rows), locks the job row and skips it
 * when it is gone, not due by the database clock or already finished. Otherwise runs its
 * handler in a savepoint, so a failure or defect rolls back only the handler's writes,
 * then finishes a one-off job or reschedules a cron job on success, and on failure
 * retries with backoff until `MAX_ATTEMPTS`. Every update is guarded by the `run_at`
 * read under the lock, so a handler that moved its own job keeps its move. The error is
 * stored as `describeError` gives it, never as a message. A lock wait longer than
 * `lockTimeout` (30 seconds by default) is a defect.
 */
export const runJob = (claimed: ClaimedJob, options?: { readonly lockTimeout?: Duration.Input }) =>
  withOwner(claimed.ownerId, body(claimed, options?.lockTimeout ?? '30 seconds'));

/**
 * Claims up to `max` due jobs (10 by default) with a lease (5 minutes by default) and
 * runs them one after another. A job whose run fails or dies outside its handler's
 * savepoint is logged and reported as `Aborted`; its row stays as the claim left it and
 * is claimed again after the lease. A failing claim fails the whole call.
 */
export const runDueJobs = (options?: {
  readonly lease?: Duration.Input;
  readonly max?: number;
  readonly lockTimeout?: Duration.Input;
}) =>
  Effect.gen(function* () {
    const claimed = yield* claimJobs({
      lease: options?.lease ?? '5 minutes',
      max: options?.max ?? 10,
    });
    const runs: Array<JobRun> = [];
    for (const job of claimed) {
      const outcome = yield* runJob(job, { lockTimeout: options?.lockTimeout }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning(`Job ${job.id} aborted: ${describeError(cause)}`).pipe(
            Effect.as(JobOutcome.Aborted),
          ),
        ),
      );
      runs.push({ id: job.id, ownerId: job.ownerId, outcome });
    }
    return runs;
  });

/**
 * Polls for due jobs every `interval` (5 seconds by default) for as long as the layer's
 * scope is open. A failing poll is logged and the loop carries on.
 */
export const jobWorkerLayer = (options?: {
  readonly interval?: Duration.Input;
  readonly lease?: Duration.Input;
  readonly max?: number;
  readonly lockTimeout?: Duration.Input;
}): Layer.Layer<never, never, Db | JobRegistry> =>
  Layer.effectDiscard(
    Effect.forkScoped(
      runDueJobs(options).pipe(
        Effect.catchCause((cause) => Effect.logWarning(`Job poll failed: ${describeError(cause)}`)),
        Effect.repeat(Schedule.spaced(options?.interval ?? '5 seconds')),
      ),
    ),
  );
