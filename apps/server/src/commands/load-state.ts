// SPDX-License-Identifier: EUPL-1.2
import { CommandTag, type Command, type DomainState } from '@asys/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { Effect } from 'effect';
import { Db } from '../db/database';
import { rowToArea, rowToLink, rowToReviewItem, rowToSettings, rowToTask } from '../db/mappers';
import { areas, reviewItems, settings, taskBlockers, tasks } from '../db/schema';

/**
 * Loads exactly the state `command` needs: the settings row always (missing is a defect), plus
 * the rows its tag reads, whatever their status. Every other array is empty. Must run inside
 * the caller's `withOwner(ownerId, ...)`; every query also filters by `ownerId`.
 */
export const loadState = (ownerId: string, command: Command) =>
  Effect.gen(function* () {
    const db = yield* Db;

    const settingsRows = yield* db.select().from(settings).where(eq(settings.ownerId, ownerId));
    if (settingsRows.length !== 1) {
      return yield* Effect.die(`Expected one settings row, found ${settingsRows.length}`);
    }

    const taskRows = (ids: ReadonlyArray<string>) =>
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.ownerId, ownerId), inArray(tasks.id, [...ids])));
    const areaRows = () => db.select().from(areas).where(eq(areas.ownerId, ownerId));

    let state: DomainState = {
      tasks: [],
      links: [],
      areas: [],
      reviewItems: [],
      settings: rowToSettings(settingsRows[0]),
    };

    switch (command._tag) {
      case CommandTag.CaptureTask:
      case CommandTag.TriageTask:
      case CommandTag.EditTask:
      case CommandTag.LogProgress:
      case CommandTag.CompleteTask:
      case CommandTag.DropTask: {
        const taskResult = yield* taskRows([command.taskId]);
        const areaResult = yield* areaRows();
        state = { ...state, tasks: taskResult.map(rowToTask), areas: areaResult.map(rowToArea) };
        break;
      }
      case CommandTag.AddBlocker: {
        const taskResult = yield* taskRows([command.taskId, command.blockerId]);
        const linkResult = yield* db
          .select()
          .from(taskBlockers)
          .where(eq(taskBlockers.ownerId, ownerId));
        state = { ...state, tasks: taskResult.map(rowToTask), links: linkResult.map(rowToLink) };
        break;
      }
      case CommandTag.RemoveBlocker: {
        const linkResult = yield* db
          .select()
          .from(taskBlockers)
          .where(and(eq(taskBlockers.ownerId, ownerId), eq(taskBlockers.id, command.linkId)));
        state = { ...state, links: linkResult.map(rowToLink) };
        break;
      }
      case CommandTag.CreateArea:
      case CommandTag.UpdateArea: {
        const areaResult = yield* areaRows();
        state = { ...state, areas: areaResult.map(rowToArea) };
        break;
      }
      case CommandTag.ResolveReviewItem: {
        const itemResult = yield* db
          .select()
          .from(reviewItems)
          .where(and(eq(reviewItems.ownerId, ownerId), eq(reviewItems.id, command.reviewItemId)));
        state = { ...state, reviewItems: itemResult.map(rowToReviewItem) };
        break;
      }
      case CommandTag.SetTimeZone:
      case CommandTag.SetUrgencyWindow:
        break;
    }

    return state;
  });
