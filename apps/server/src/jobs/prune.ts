// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import type { Instant, TimeZone } from '@asys/domain';
import { and, eq, lt, lte, max, sql } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { Db } from '../db/database';
import { changeCounters, changeLog, idempotencyKeys, sessions } from '../db/schema';
import { nextCronRun } from './cron';
import { JobRegistry, type JobHandler } from './registry';
import type { ScheduleJobInput } from './schedule-job';

/** The job kinds the server registers itself. */
export enum CoreJobKind {
  Prune = 'prune',
}

/** Prune runs every day at 03:00 in the owner's time zone. */
export const PRUNE_CRON = '0 3 * * *';

/** Each owner has at most one prune job. */
export const PRUNE_DEDUPE_KEY = 'prune';

/** How long the change log and the idempotency keys are kept (ADR 0003). */
export const RETENTION_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Deletes the owner's sessions that expired at or before `now`, and its change-log rows and
 * idempotency keys created before `now` minus `RETENTION_DAYS`. The change log goes as a
 * contiguous prefix: everything up to the highest old `seq`, even rows newer than the
 * cutoff, because `created_at` is the transaction start while `seq` follows commit order,
 * so deleting by age alone could leave a hole `changesSince` cannot detect.
 * `pruned_through` then moves up to that `seq` and never back. Must run inside the
 * caller's `withOwner(ownerId, ...)`, after `lockCounter`; it takes no lock itself.
 */
export const pruneOwner = (ownerId: string, now: Instant) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const cutoff = new Date(now - RETENTION_DAYS * DAY_MS);

    const oldest = yield* db
      .select({ seq: max(changeLog.seq) })
      .from(changeLog)
      .where(and(eq(changeLog.ownerId, ownerId), lt(changeLog.createdAt, cutoff)));
    const prunedThrough = oldest[0].seq;
    if (prunedThrough !== null) {
      yield* db
        .delete(changeLog)
        .where(and(eq(changeLog.ownerId, ownerId), lte(changeLog.seq, prunedThrough)));
      yield* db
        .update(changeCounters)
        .set({ prunedThrough: sql`greatest(${changeCounters.prunedThrough}, ${prunedThrough})` })
        .where(eq(changeCounters.ownerId, ownerId));
    }

    yield* db
      .delete(idempotencyKeys)
      .where(and(eq(idempotencyKeys.ownerId, ownerId), lt(idempotencyKeys.createdAt, cutoff)));

    yield* db
      .delete(sessions)
      .where(and(eq(sessions.ownerId, ownerId), lte(sessions.expiresAt, new Date(now))));
  });

/** The prune job handler: prunes the job's owner at the worker's clock time. */
export const prune: JobHandler = (job) => pruneOwner(job.ownerId, job.now);

/** A new daily prune job for an owner in `timeZone`, first due at the next 03:00 after `now`. */
export const pruneJob = (timeZone: TimeZone, now: Instant): ScheduleJobInput => ({
  id: randomUUID(),
  kind: CoreJobKind.Prune,
  payload: {},
  runAt: nextCronRun(PRUNE_CRON, timeZone, now),
  cron: PRUNE_CRON,
  dedupeKey: PRUNE_DEDUPE_KEY,
});

/** Registers the core job kinds (prune) in the `JobRegistry` when the layer is built. */
export const coreJobsLayer: Layer.Layer<never, never, JobRegistry> = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* JobRegistry;
    yield* registry.register(CoreJobKind.Prune, prune);
  }),
);
