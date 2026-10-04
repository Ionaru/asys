// SPDX-License-Identifier: MPL-2.0

import { BlockedReasonTag, type Task } from '../task';
import { formatClock, formatDateSpec, toLocalDateTime, type Instant, type TimeZone } from '../time';
import { ExclusionReasonTag, type ExclusionReason } from './picker';

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
  const parts: string[] = [];
  for (const reason of reasons) {
    switch (reason._tag) {
      case ExclusionReasonTag.NotYetAvailable:
        parts.push(
          task.availableFrom !== null
            ? `Available from ${formatDateSpec(task.availableFrom, toLocalDateTime(now, timeZone).date)}`
            : `Available from ${formatClock(reason.from, now, timeZone)}`,
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
