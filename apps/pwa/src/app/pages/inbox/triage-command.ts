// SPDX-License-Identifier: EUPL-1.2
import { CommandTag, type Task, TaskStatus, type TriageTask } from '@asys/domain';

import { buildTaskPatch, draftOf, type TaskDraft } from '../../core/data/task-patch';

/**
 * The TriageTask for the card's Task and its draft, or null while Importance or an Estimate is missing.
 * Besides Importance and the Estimate it carries only the fields that differ from the stored Task, and
 * never a blank title, so the stored one stays. It expects the Task at the version it was triaged at, so a
 * change from another device during the Undo window makes it NotApplicable instead of being overwritten.
 */
export const triageCommand = (task: Task, draft: TaskDraft): TriageTask | null => {
  const { important, estimateMinutes } = draft;

  if (important === null || estimateMinutes === null) {
    return null;
  }

  const patch = buildTaskPatch(draftOf(task), draft);

  return {
    _tag: CommandTag.TriageTask,
    taskId: task.id,
    important,
    estimateMinutes,
    expect: { status: TaskStatus.Open, version: task.version },
    ...(patch.areaId === undefined ? {} : { areaId: patch.areaId }),
    ...(patch.title === undefined || patch.title === '' ? {} : { title: patch.title }),
    ...(patch.notes === undefined ? {} : { notes: patch.notes }),
    ...(patch.availableFrom === undefined ? {} : { availableFrom: patch.availableFrom }),
    ...(patch.due === undefined ? {} : { due: patch.due }),
  };
};
