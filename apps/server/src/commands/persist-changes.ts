// SPDX-License-Identifier: EUPL-1.2
import { ChangeEntity, ChangeOp, type Change, type DomainState } from '@asys/domain';
import { and, eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { Db } from '../db/database';
import { areaToRow, linkToRow, reviewItemToRow, settingsToRow, taskToRow } from '../db/mappers';
import { areas, reviewItems, settings, taskBlockers, tasks } from '../db/schema';

/**
 * Writes `changes` to the entity tables in the given order: a put updates the row when `state`
 * holds that id and inserts it otherwise (never an upsert), a blocker removal deletes the link.
 * Must run inside the caller's `withOwner(ownerId, ...)`.
 */
export const persistChanges = (
  ownerId: string,
  state: DomainState,
  changes: ReadonlyArray<Change>,
) =>
  Effect.gen(function* () {
    const db = yield* Db;

    for (const change of changes) {
      switch (change.entity) {
        case ChangeEntity.Task: {
          const row = taskToRow(ownerId, change.after);
          if (state.tasks.some((task) => task.id === change.id)) {
            yield* db
              .update(tasks)
              .set(row)
              .where(and(eq(tasks.ownerId, ownerId), eq(tasks.id, change.id)));
          } else {
            yield* db.insert(tasks).values(row);
          }
          break;
        }
        case ChangeEntity.Area: {
          const row = areaToRow(ownerId, change.after);
          if (state.areas.some((area) => area.id === change.id)) {
            yield* db
              .update(areas)
              .set(row)
              .where(and(eq(areas.ownerId, ownerId), eq(areas.id, change.id)));
          } else {
            yield* db.insert(areas).values(row);
          }
          break;
        }
        case ChangeEntity.ReviewItem: {
          const row = reviewItemToRow(ownerId, change.after);
          if (state.reviewItems.some((item) => item.id === change.id)) {
            yield* db
              .update(reviewItems)
              .set(row)
              .where(and(eq(reviewItems.ownerId, ownerId), eq(reviewItems.id, change.id)));
          } else {
            yield* db.insert(reviewItems).values(row);
          }
          break;
        }
        case ChangeEntity.Blocker:
          if (change.op === ChangeOp.Remove) {
            yield* db
              .delete(taskBlockers)
              .where(and(eq(taskBlockers.ownerId, ownerId), eq(taskBlockers.id, change.id)));
          } else {
            yield* db.insert(taskBlockers).values(linkToRow(ownerId, change.after));
          }
          break;
        case ChangeEntity.Settings:
          yield* db
            .update(settings)
            .set(settingsToRow(ownerId, change.after))
            .where(eq(settings.ownerId, ownerId));
          break;
      }
    }
  });
