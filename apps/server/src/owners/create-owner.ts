// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { DEFAULT_URGENCY_WINDOW_DAYS, isValidTimeZone, seedAreas } from '@asys/domain';
import { Clock, Data, Effect } from 'effect';
import { Db } from '../db/database';
import { areaToRow, settingsToRow } from '../db/mappers';
import { areas, changeCounters, settings, users } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { pruneJob } from '../jobs/prune';
import { scheduleJob } from '../jobs/schedule-job';

export enum CreateOwnerRejectedReason {
  InvalidName = 'invalid_name',
  InvalidTimeZone = 'invalid_time_zone',
  OwnerExists = 'owner_exists',
}

export class CreateOwnerRejected extends Data.TaggedError('CreateOwnerRejected')<{
  readonly reason: CreateOwnerRejectedReason;
}> {}

export interface CreateOwnerInput {
  readonly ownerId: string;
  readonly name: string;
  readonly timeZone: string;
}

/**
 * Sets up a new User: the user row, settings, the two seeded Areas, the change counter and the
 * daily prune job. Must run inside the caller's `withOwner(input.ownerId, ...)`; rejects with
 * `CreateOwnerRejected` before writing when the name or time zone is invalid, and after the
 * user insert when the owner already exists.
 */
export const createOwnerRows = (input: CreateOwnerInput) =>
  Effect.gen(function* () {
    const name = input.name.trim();
    if (name === '' || name.includes('\u0000')) {
      return yield* new CreateOwnerRejected({ reason: CreateOwnerRejectedReason.InvalidName });
    }
    if (!isValidTimeZone(input.timeZone)) {
      return yield* new CreateOwnerRejected({ reason: CreateOwnerRejectedReason.InvalidTimeZone });
    }

    const db = yield* Db;
    const { ownerId } = input;

    const created = yield* db
      .insert(users)
      .values({ ownerId, name })
      .onConflictDoNothing()
      .returning({ ownerId: users.ownerId });
    if (created.length === 0) {
      return yield* new CreateOwnerRejected({ reason: CreateOwnerRejectedReason.OwnerExists });
    }

    yield* db.insert(settings).values(
      settingsToRow(ownerId, {
        timeZone: input.timeZone,
        urgencyWindowDays: DEFAULT_URGENCY_WINDOW_DAYS,
      }),
    );
    yield* db
      .insert(areas)
      .values(
        seedAreas({ workId: randomUUID(), personalId: randomUUID() }).map((area) =>
          areaToRow(ownerId, area),
        ),
      );
    yield* db.insert(changeCounters).values({ ownerId, lastSeq: 0, prunedThrough: 0 });

    const now = yield* Clock.currentTimeMillis;
    yield* scheduleJob(ownerId, pruneJob(input.timeZone, now));
  });

/** Sets up a new User in its own transaction; see `createOwnerRows`. */
export const createOwner = (input: CreateOwnerInput) =>
  withOwner(input.ownerId, createOwnerRows(input));
