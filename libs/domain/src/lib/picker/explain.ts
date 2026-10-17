// SPDX-License-Identifier: MPL-2.0

import type { Settings } from '../settings';
import {
  deadlineIndex,
  isAvailable,
  isInInbox,
  TaskStatus,
  type BlockerLink,
  type Task,
} from '../task';
import { addCalendarDays, toLocalDateTime, type Instant } from '../time';
import type { ExclusionReason, Reason } from './picker';
import { exclusionReasons, reasonOf } from './reasons';
import { reasonTextOn } from './reason-text';
import { waitingTextOn } from './waiting-text';

export enum TaskExplanationTag {
  Available = 'Available',
  Waiting = 'Waiting',
  Inbox = 'Inbox',
  NotOpen = 'NotOpen',
}

/** An Available Task: what Now would show for it. */
export interface AvailableExplanation {
  readonly _tag: TaskExplanationTag.Available;
  readonly reason: Reason;
  readonly reasonText: string;
}

/** An Open, triaged Task that is not Available: what Now would show for it in Waiting. */
export interface WaitingExplanation {
  readonly _tag: TaskExplanationTag.Waiting;
  readonly reason: Reason;
  readonly reasons: readonly ExclusionReason[];
  readonly reasonText: string;
}

export interface InboxExplanation {
  readonly _tag: TaskExplanationTag.Inbox;
}

/** A Task that is Done, Dropped, Delegated or Skipped. */
export interface NotOpenExplanation {
  readonly _tag: TaskExplanationTag.NotOpen;
}

export type TaskExplanation =
  | AvailableExplanation
  | WaitingExplanation
  | InboxExplanation
  | NotOpenExplanation;

/**
 * Explains one Task the way Now does, ignoring Areas and the Current Area. It reads the Task's own
 * fields from `task` and never looks it up in `tasks`, so `tasks` may hold an edited copy of it.
 */
export const explainTask = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  settings: Settings,
  now: Instant,
): TaskExplanation => {
  const tz = settings.timeZone;
  if (task.status !== TaskStatus.Open) return { _tag: TaskExplanationTag.NotOpen };
  if (isInInbox(task)) return { _tag: TaskExplanationTag.Inbox };
  const today = () => toLocalDateTime(now, tz).date;
  const urgencyCutoff = () => addCalendarDays(now, settings.urgencyWindowDays, tz);
  const reason = reasonOf(
    task,
    deadlineIndex(tasks, links, tz).latestStart(task),
    now,
    tz,
    urgencyCutoff,
  );
  if (isAvailable(task, tasks, links, now, tz)) {
    return {
      _tag: TaskExplanationTag.Available,
      reason,
      reasonText: reasonTextOn(task, reason, today, tz),
    };
  }
  const reasons = exclusionReasons(task, tasks, links, now, tz);
  return {
    _tag: TaskExplanationTag.Waiting,
    reason,
    reasons,
    reasonText: waitingTextOn(task, reasons, tasks, today, tz),
  };
};
