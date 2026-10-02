// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { Db, ownerDatabase } from '../db/database';
import {
  areas,
  changeCounters,
  changeLog,
  idempotencyKeys,
  reviewItems,
  settings,
  taskBlockers,
  tasks,
  trialItems,
  users,
} from '../db/schema';
import { withOwner } from '../db/with-owner';
import { createOwner } from '../owners/create-owner';

/**
 * Creates a fresh owner (user, settings, seeded areas, counter) with a random
 * lowercase id and returns the id. Clean up with `removeOwner`.
 */
export const newOwner = () =>
  Effect.gen(function* () {
    const ownerId = randomUUID();
    yield* createOwner({ ownerId, name: 'Test owner', timeZone: 'Europe/Amsterdam' });
    return ownerId;
  });

/**
 * Deletes every row of `ownerId`, children first. It connects as `asys_owner`
 * because `asys_app` lacks DELETE on most tables; forced row-level security
 * still limits the deletes to this owner.
 */
export const removeOwner = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db.delete(taskBlockers);
      yield* db.delete(tasks);
      yield* db.delete(areas);
      yield* db.delete(reviewItems);
      yield* db.delete(changeLog);
      yield* db.delete(idempotencyKeys);
      yield* db.delete(changeCounters);
      yield* db.delete(settings);
      yield* db.delete(users);
      yield* db.delete(trialItems);
    }),
  ).pipe(Effect.provide(ownerDatabase()));
