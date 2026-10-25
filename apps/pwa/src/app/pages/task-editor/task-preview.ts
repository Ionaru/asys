// SPDX-License-Identifier: EUPL-1.2
import type { Task } from '@asys/domain';

import type { TaskDraft } from './task-patch';

/** The stored Task with the draft's Importance, Estimate, Area and dates: what explainTask previews while the person edits. */
export const previewTask = (task: Task, draft: TaskDraft): Task => ({
  ...task,
  important: draft.important,
  estimateMinutes: draft.estimateMinutes,
  areaId: draft.areaId === '' ? null : draft.areaId,
  availableFrom: draft.availableFrom,
  due: draft.due,
});
