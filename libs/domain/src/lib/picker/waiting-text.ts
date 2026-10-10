// SPDX-License-Identifier: MPL-2.0

import { BlockedReasonTag, type Task } from '../task';
import {
  formatClock,
  formatClockOn,
  formatDateSpec,
  toLocalDateTime,
  type Instant,
  type LocalDate,
  type TimeZone,
} from '../time';
import { ExclusionReasonTag, type ExclusionReason, type WaitingTask } from './picker';

// Code-unit order on purpose: localeCompare would differ per runtime locale.
const compareStrings = (a: string, b: string): number => {
  return a < b ? -1 : a > b ? 1 : 0;
};

const blockedText = (taskIds: readonly string[], tasks: readonly Task[]): string | null => {
  const ids = new Set(taskIds);
  const titles = tasks
    .filter((candidate) => ids.has(candidate.id))
    .sort((a, b) => compareStrings(a.title, b.title) || compareStrings(a.id, b.id))
    .map((blocker) => blocker.title);
  const [first, second] = titles;
  if (first === undefined) return null;
  if (second === undefined) return `Blocked by ${first}`;
  if (titles.length === 2) return `Blocked by ${first} and ${second}`;
  return `Blocked by ${first} and ${titles.length - 1} more`;
};

/** The one-line reason a Waiting Task is not ranked, from its exclusion reasons. */
export const waitingText = (
  task: Task,
  reasons: readonly ExclusionReason[],
  tasks: readonly Task[],
  now: Instant,
  timeZone: TimeZone,
): string => {
  return waitingTextOn(task, reasons, tasks, () => toLocalDateTime(now, timeZone).date, timeZone);
};

/** waitingText for a caller that explains many Tasks at one now. `today` returns now's local date, so the caller can derive it once; it is called only when the text needs it. */
export const waitingTextOn = (
  task: Task,
  reasons: readonly ExclusionReason[],
  tasks: readonly Task[],
  today: () => LocalDate,
  timeZone: TimeZone,
): string => {
  const parts: string[] = [];
  for (const reason of reasons) {
    switch (reason._tag) {
      case ExclusionReasonTag.NotYetAvailable:
        parts.push(
          task.availableFrom !== null
            ? `Available from ${formatDateSpec(task.availableFrom, today())}`
            : `Available from ${formatClockOn(reason.from, today, timeZone)}`,
        );
        break;
      case BlockedReasonTag.BlockedBy: {
        const text = blockedText(reason.taskIds, tasks);
        if (text !== null) parts.push(text);
        break;
      }
      default:
        break;
    }
  }
  return parts.length === 0 ? 'Waiting' : parts.join(' · ');
};

/** The one fact that matters while the Waiting section is closed: when the next Waiting Task becomes Available, or null when none is waiting for a moment. */
export const waitingSummary = (
  waiting: readonly WaitingTask[],
  now: Instant,
  timeZone: TimeZone,
): string | null => {
  let next: { readonly task: Task; readonly from: Instant } | null = null;
  for (const entry of waiting) {
    for (const reason of entry.reasons) {
      if (reason._tag !== ExclusionReasonTag.NotYetAvailable) continue;
      if (next === null || reason.from < next.from) next = { task: entry.task, from: reason.from };
    }
  }
  if (next === null) return null;
  const when =
    next.task.availableFrom !== null
      ? formatDateSpec(next.task.availableFrom, toLocalDateTime(now, timeZone).date)
      : formatClock(next.from, now, timeZone);
  return `Next Available ${when}`;
};
