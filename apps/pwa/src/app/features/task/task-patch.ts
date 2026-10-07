// SPDX-License-Identifier: EUPL-1.2
import { type DateSpec, sameDateSpec, type Task, type TaskPatch } from '@asys/domain';

import type { DraftFields } from '../../core/data/draft-follow';

/** The editable fields of a Task as the editor holds them; areaId '' means No Area. */
export interface TaskDraft {
  readonly title: string;
  readonly notes: string;
  readonly areaId: string;
  readonly important: boolean | null;
  readonly estimateMinutes: number | null;
  readonly availableFrom: DateSpec | null;
  readonly due: DateSpec | null;
}

/** Whether two optional DateSpecs are the same date and time. */
const sameSpec = (a: DateSpec | null, b: DateSpec | null): boolean =>
  a === null || b === null ? a === b : sameDateSpec(a, b);

/** The fields of a Task draft that follow the store, compared by value (dates by DateSpec). */
export const TASK_DRAFT_FIELDS: DraftFields<TaskDraft> = {
  keys: ['title', 'notes', 'areaId', 'important', 'estimateMinutes', 'availableFrom', 'due'],
  same: (key, a, b) =>
    key === 'availableFrom' || key === 'due' ? sameSpec(a[key], b[key]) : a[key] === b[key],
};

/** The draft of a stored Task. */
export const draftOf = (task: Task): TaskDraft => ({
  title: task.title,
  notes: task.notes,
  areaId: task.areaId ?? '',
  important: task.important,
  estimateMinutes: task.estimateMinutes,
  availableFrom: task.availableFrom,
  due: task.due,
});

/** The fields of `draft` that differ from `baseline`, as an EditTask patch. */
export const buildTaskPatch = (baseline: TaskDraft, draft: TaskDraft): TaskPatch => {
  const title = draft.title.trim();

  return {
    ...(title === baseline.title ? {} : { title }),
    ...(draft.notes === baseline.notes ? {} : { notes: draft.notes }),
    ...(draft.areaId === baseline.areaId
      ? {}
      : { areaId: draft.areaId === '' ? null : draft.areaId }),
    ...(draft.important === baseline.important ? {} : { important: draft.important }),
    ...(draft.estimateMinutes === baseline.estimateMinutes
      ? {}
      : { estimateMinutes: draft.estimateMinutes }),
    ...(sameSpec(draft.availableFrom, baseline.availableFrom)
      ? {}
      : { availableFrom: draft.availableFrom }),
    ...(sameSpec(draft.due, baseline.due) ? {} : { due: draft.due }),
  };
};
