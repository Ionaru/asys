// SPDX-License-Identifier: EUPL-1.2
import type { Instant } from '@asys/domain';
import { sql } from 'drizzle-orm';
import { Effect } from 'effect';
import { Db } from '../db/database';
import { jobs } from '../db/schema';
import { nextCronRun } from './cron';

/** A job to schedule: `cron` is null for a one-off job, `dedupeKey` null when it never needs replacing. */
export interface ScheduleJobInput {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly runAt: Instant;
  readonly cron: string | null;
  readonly dedupeKey: string | null;
}

/**
 * Schedules a job for the owner and returns its id. A non-null `cron` must parse and
 * fire at least once (otherwise a defect, and nothing is written). A dedupe key the
 * owner already has replaces that row's `run_at`, `payload` and `cron`, resets its
 * attempts, finish state and last error, keeps its lease and `kind`, and returns the
 * existing row's id instead of `input.id`. Must run inside the caller's `withOwner`,
 * after `lockCounter`; it does not take the lock itself.
 */
export const scheduleJob = (ownerId: string, input: ScheduleJobInput) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const cron = input.cron;
    if (cron !== null) {
      yield* Effect.try(() => nextCronRun(cron, 'UTC', input.runAt)).pipe(Effect.orDie);
    }
    const rows = yield* db
      .insert(jobs)
      .values({
        ownerId,
        id: input.id,
        kind: input.kind,
        payload: input.payload,
        runAt: new Date(input.runAt),
        cron,
        dedupeKey: input.dedupeKey,
      })
      .onConflictDoUpdate({
        target: [jobs.ownerId, jobs.dedupeKey],
        set: {
          runAt: sql`excluded.run_at`,
          payload: sql`excluded.payload`,
          cron: sql`excluded.cron`,
          attempts: 0,
          finishedAt: null,
          failed: false,
          lastError: null,
        },
      })
      .returning({ id: jobs.id });
    return rows[0].id;
  });
