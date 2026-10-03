// SPDX-License-Identifier: EUPL-1.2
import { sql } from 'drizzle-orm';
import { Duration, Effect } from 'effect';
import { Db } from '../db/database';

/** A job the worker holds a lease on. */
export interface ClaimedJob {
  readonly id: string;
  readonly ownerId: string;
}

/**
 * Claims up to `max` due jobs across all owners through `claim_jobs`, leasing each for
 * `lease` and counting an attempt. Sets no owner and opens no transaction: inside a
 * caller's transaction it joins it. A non-finite or non-positive lease, or a `max`
 * that is not a positive integer, is a defect. The result is unordered.
 */
export const claimJobs = (options: { readonly lease: Duration.Input; readonly max: number }) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const ms = Duration.toMillis(options.lease);
    if (!Number.isFinite(ms) || ms <= 0) {
      return yield* Effect.die(`The lease must be a positive, finite duration, got ${ms} ms`);
    }
    if (!Number.isInteger(options.max) || options.max <= 0) {
      return yield* Effect.die(`The claim size must be a positive integer, got ${options.max}`);
    }
    const rows = yield* db.execute<{ id: string; owner_id: string }>(
      sql`select id, owner_id from claim_jobs(${`${ms} milliseconds`}::interval, ${options.max}::integer)`,
      'objects',
    );
    return rows.map((row): ClaimedJob => ({ id: row.id, ownerId: row.owner_id }));
  });

/**
 * The age of the oldest due, unfinished job in seconds (fractional), or 0 when none
 * is due. The interval is converted in SQL because the driver cannot decode it.
 */
export const oldestDueJobAgeSeconds = Effect.gen(function* () {
  const db = yield* Db;
  const rows = yield* db.execute<{ seconds: number }>(
    sql`select extract(epoch from oldest_due_job_age())::float8 as seconds`,
    'objects',
  );
  return rows[0].seconds;
});
