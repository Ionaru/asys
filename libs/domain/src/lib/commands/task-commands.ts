// SPDX-License-Identifier: MPL-2.0

import { TaskKind, TaskStatus, type Task } from '../task';
import { isValidDateSpec, sameDateSpec, type DateSpec, type Instant } from '../time';
import {
  ChangeEntity,
  ChangeOp,
  MAX_MINUTES,
  NotApplicableReason,
  RejectedReason,
  TransitionResultTag,
  type CaptureTask,
  type CompleteTask,
  type DomainState,
  type DropTask,
  type EditTask,
  type Expectation,
  type LogProgress,
  type TransitionResult,
  type TriageTask,
} from './command';

const rejected = (reason: RejectedReason): TransitionResult => ({
  _tag: TransitionResultTag.Rejected,
  reason,
});

const isMinutes = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_MINUTES;
};

const present = <T extends object, K extends keyof T>(obj: T, key: K): boolean => {
  return key in obj && obj[key] !== undefined;
};

const sameNullableDate = (a: DateSpec | null, b: DateSpec | null): boolean => {
  return a === null || b === null ? a === b : sameDateSpec(a, b);
};

const sameTask = (a: Task, b: Task): boolean => {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.status === b.status &&
    a.title === b.title &&
    a.notes === b.notes &&
    a.captureText === b.captureText &&
    a.areaId === b.areaId &&
    sameNullableDate(a.availableFrom, b.availableFrom) &&
    sameNullableDate(a.due, b.due) &&
    a.estimateMinutes === b.estimateMinutes &&
    a.important === b.important &&
    a.voice === b.voice &&
    a.privacy === b.privacy &&
    a.dueMoveCount === b.dueMoveCount &&
    a.version === b.version &&
    a.createdAt === b.createdAt &&
    a.closedAt === b.closedAt
  );
};

const expectationFails = (task: Task, expect: Expectation | undefined): boolean => {
  if (expect === undefined) return false;
  if (expect.status !== undefined && expect.status !== task.status) return true;
  return expect.version !== undefined && expect.version !== task.version;
};

const put = (current: Task, next: Task): TransitionResult => {
  if (sameTask(current, { ...next, version: current.version })) {
    return { _tag: TransitionResultTag.Applied, changes: [] };
  }
  return {
    _tag: TransitionResultTag.Applied,
    changes: [
      {
        entity: ChangeEntity.Task,
        op: ChangeOp.Put,
        id: current.id,
        after: { ...next, version: current.version + 1 },
      },
    ],
  };
};

const unknownArea = (state: DomainState, areaId: string | null | undefined): boolean => {
  return areaId !== undefined && areaId !== null && !state.areas.some((a) => a.id === areaId);
};

/** The text and date fields that Triage and Edit both carry. */
interface TextAndDateFields {
  readonly title?: string;
  readonly notes?: string;
  readonly availableFrom?: DateSpec | null;
  readonly due?: DateSpec | null;
}

/** The stateless check of the text and date fields that are present, in the order Title, Notes, Available from, Due. */
const invalidTextOrDate = (fields: TextAndDateFields): RejectedReason | undefined => {
  if (present(fields, 'title')) {
    const title: unknown = fields.title;
    if (typeof title !== 'string' || title.trim() === '') return RejectedReason.InvalidTitle;
  }
  if (present(fields, 'notes') && typeof fields.notes !== 'string') {
    return RejectedReason.InvalidNotes;
  }
  if (present(fields, 'availableFrom')) {
    const v = fields.availableFrom;
    if (v !== null && v !== undefined && !isValidDateSpec(v)) return RejectedReason.InvalidDate;
  }
  if (present(fields, 'due')) {
    const v = fields.due;
    if (v !== null && v !== undefined && !isValidDateSpec(v)) return RejectedReason.InvalidDate;
  }
  return undefined;
};

/** Applies the text and date fields that are present, with the Due move rule; the fields are already validated. */
const applyTextAndDate = (task: Task, fields: TextAndDateFields): Task => {
  let next: Task = task;
  if (present(fields, 'title')) next = { ...next, title: (fields.title as string).trim() };
  if (present(fields, 'notes')) next = { ...next, notes: fields.notes as string };
  if (present(fields, 'availableFrom')) {
    next = { ...next, availableFrom: fields.availableFrom as DateSpec | null };
  }
  if (present(fields, 'due')) {
    const due = fields.due as DateSpec | null;
    // Only a change of the Due's date, or clearing it, is a move; a time added, changed or removed on the same date is not.
    const moved = task.due !== null && (due === null || due.date !== task.due.date);
    next = { ...next, due, dueMoveCount: task.dueMoveCount + (moved ? 1 : 0) };
  }
  return next;
};

export const captureTask = (
  state: DomainState,
  command: CaptureTask,
  now: Instant,
): TransitionResult => {
  const title = command.title.trim();
  if (title === '') return rejected(RejectedReason.InvalidTitle);
  if (state.tasks.some((t) => t.id === command.taskId)) return rejected(RejectedReason.DuplicateId);
  if (unknownArea(state, command.areaId)) return rejected(RejectedReason.UnknownArea);
  const task: Task = {
    id: command.taskId,
    kind: TaskKind.Task,
    status: TaskStatus.Open,
    title,
    notes: '',
    captureText: command.captureText,
    areaId: command.areaId ?? null,
    availableFrom: null,
    due: null,
    estimateMinutes: null,
    important: null,
    voice: null,
    privacy: null,
    dueMoveCount: 0,
    version: 1,
    createdAt: now,
    closedAt: null,
  };
  return {
    _tag: TransitionResultTag.Applied,
    changes: [{ entity: ChangeEntity.Task, op: ChangeOp.Put, id: task.id, after: task }],
  };
};

export const triageTask = (
  state: DomainState,
  command: TriageTask,
  _now: Instant,
): TransitionResult => {
  if (!isMinutes(command.estimateMinutes)) return rejected(RejectedReason.InvalidEstimate);
  const invalid = invalidTextOrDate(command);
  if (invalid !== undefined) return rejected(invalid);
  const task = state.tasks.find((t) => t.id === command.taskId);
  if (task === undefined) return rejected(RejectedReason.NotFound);
  if (expectationFails(task, command.expect)) {
    return {
      _tag: TransitionResultTag.NotApplicable,
      reason: NotApplicableReason.ExpectationFailed,
    };
  }
  if (task.status !== TaskStatus.Open)
    return { _tag: TransitionResultTag.NotApplicable, reason: NotApplicableReason.NotOpen };
  if (unknownArea(state, command.areaId)) return rejected(RejectedReason.UnknownArea);
  return put(task, {
    ...applyTextAndDate(task, command),
    important: command.important,
    estimateMinutes: command.estimateMinutes,
    areaId: command.areaId !== undefined ? command.areaId : task.areaId,
  });
};

export const editTask = (
  state: DomainState,
  command: EditTask,
  _now: Instant,
): TransitionResult => {
  const patch = command.patch;
  const invalid = invalidTextOrDate(patch);
  if (invalid !== undefined) return rejected(invalid);
  if (present(patch, 'estimateMinutes')) {
    const v = patch.estimateMinutes;
    if (v !== null && !isMinutes(v)) return rejected(RejectedReason.InvalidEstimate);
  }
  const task = state.tasks.find((t) => t.id === command.taskId);
  if (task === undefined) return rejected(RejectedReason.NotFound);
  if (expectationFails(task, command.expect)) {
    return {
      _tag: TransitionResultTag.NotApplicable,
      reason: NotApplicableReason.ExpectationFailed,
    };
  }
  if (present(patch, 'areaId') && unknownArea(state, patch.areaId))
    return rejected(RejectedReason.UnknownArea);

  let next: Task = applyTextAndDate(task, patch);
  if (present(patch, 'areaId')) next = { ...next, areaId: patch.areaId as string | null };
  if (present(patch, 'estimateMinutes')) {
    next = { ...next, estimateMinutes: patch.estimateMinutes as number | null };
  }
  if (present(patch, 'important')) {
    next = { ...next, important: patch.important as boolean | null };
  }
  return put(task, next);
};

export const logProgress = (
  state: DomainState,
  command: LogProgress,
  _now: Instant,
): TransitionResult => {
  if (!isMinutes(command.remainingMinutes)) return rejected(RejectedReason.InvalidRemaining);
  const task = state.tasks.find((t) => t.id === command.taskId);
  if (task === undefined) return rejected(RejectedReason.NotFound);
  if (expectationFails(task, command.expect)) {
    return {
      _tag: TransitionResultTag.NotApplicable,
      reason: NotApplicableReason.ExpectationFailed,
    };
  }
  if (task.status !== TaskStatus.Open)
    return { _tag: TransitionResultTag.NotApplicable, reason: NotApplicableReason.NotOpen };
  if (task.estimateMinutes === null) return rejected(RejectedReason.NoEstimate);
  if (command.remainingMinutes >= task.estimateMinutes)
    return rejected(RejectedReason.InvalidRemaining);
  return put(task, { ...task, estimateMinutes: command.remainingMinutes });
};

/** The time still needed is at least 1 minute and less than the Estimate, so the Estimate must be 2 or more. */
const MIN_LOGGABLE_ESTIMATE = 2;

/** Whether `logProgress` can apply to the Task: it is Open and its Estimate leaves room below it. */
export const canLogProgress = (task: Task | undefined): boolean => {
  return (
    task !== undefined &&
    task.status === TaskStatus.Open &&
    task.estimateMinutes !== null &&
    task.estimateMinutes >= MIN_LOGGABLE_ESTIMATE
  );
};

const close = (
  state: DomainState,
  command: CompleteTask | DropTask,
  status: TaskStatus.Done | TaskStatus.Dropped,
  now: Instant,
): TransitionResult => {
  const task = state.tasks.find((t) => t.id === command.taskId);
  if (task === undefined) return rejected(RejectedReason.NotFound);
  if (expectationFails(task, command.expect)) {
    return {
      _tag: TransitionResultTag.NotApplicable,
      reason: NotApplicableReason.ExpectationFailed,
    };
  }
  if (task.status !== TaskStatus.Open)
    return { _tag: TransitionResultTag.NotApplicable, reason: NotApplicableReason.NotOpen };
  return put(task, { ...task, status, closedAt: now });
};

export const completeTask = (
  state: DomainState,
  command: CompleteTask,
  now: Instant,
): TransitionResult => {
  return close(state, command, TaskStatus.Done, now);
};

export const dropTask = (state: DomainState, command: DropTask, now: Instant): TransitionResult => {
  return close(state, command, TaskStatus.Dropped, now);
};
