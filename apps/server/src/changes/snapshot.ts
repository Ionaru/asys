// SPDX-License-Identifier: EUPL-1.2
import type { Snapshot } from '@asys/contract';
import { TaskStatus } from '@asys/domain';
import { inArray, isNull } from 'drizzle-orm';
import { Effect } from 'effect';
import { Db } from '../db/database';
import { rowToArea, rowToLink, rowToReviewItem, rowToSettings, rowToTask } from '../db/mappers';
import { areas, changeCounters, reviewItems, settings, taskBlockers, tasks } from '../db/schema';
import { withOwner } from '../db/with-owner';

/**
 * The owner's working set (open and delegated Tasks, the blockers between them, all
 * Areas, unresolved Review items, Settings) and the head `seq`, read in one
 * repeatable-read transaction so they are consistent with each other.
 */
export const readSnapshot = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;

      const counters = yield* db.select({ lastSeq: changeCounters.lastSeq }).from(changeCounters);
      if (counters.length !== 1) {
        return yield* Effect.die(`Expected one change counter row, found ${counters.length}`);
      }

      const taskRows = yield* db
        .select()
        .from(tasks)
        .where(inArray(tasks.status, [TaskStatus.Open, TaskStatus.Delegated]));
      const blockerRows = yield* db
        .select()
        .from(taskBlockers)
        .where(
          inArray(
            taskBlockers.taskId,
            db
              .select({ id: tasks.id })
              .from(tasks)
              .where(inArray(tasks.status, [TaskStatus.Open, TaskStatus.Delegated])),
          ),
        );
      const areaRows = yield* db.select().from(areas);
      const reviewRows = yield* db.select().from(reviewItems).where(isNull(reviewItems.resolvedAt));
      const settingsRows = yield* db.select().from(settings);
      if (settingsRows.length !== 1) {
        return yield* Effect.die(`Expected one settings row, found ${settingsRows.length}`);
      }

      const snapshot: Snapshot = {
        seq: counters[0].lastSeq,
        tasks: taskRows.map(rowToTask),
        blockers: blockerRows.map(rowToLink),
        areas: areaRows.map(rowToArea),
        reviewItems: reviewRows.map(rowToReviewItem),
        settings: rowToSettings(settingsRows[0]),
      };
      return snapshot;
    }),
    { isolationLevel: 'repeatable read' },
  );
