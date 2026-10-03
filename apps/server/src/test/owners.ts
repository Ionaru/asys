// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { Db, ownerDatabase } from '../db/database';
import {
  areas,
  changeCounters,
  changeLog,
  idempotencyKeys,
  jobs,
  reviewItems,
  settings,
  taskBlockers,
  tasks,
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
 * A fresh owner that is removed again when the test's scope closes, so a
 * failing test still cleans up. Needs a `Scope` (`it.effect` provides one).
 */
export const scopedOwner = () =>
  Effect.acquireRelease(newOwner(), (ownerId) => removeOwner(ownerId).pipe(Effect.orDie));

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
      yield* db.delete(jobs);
    }),
  ).pipe(Effect.provide(ownerDatabase()));
