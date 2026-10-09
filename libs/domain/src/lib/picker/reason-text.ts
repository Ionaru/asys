// SPDX-License-Identifier: MPL-2.0

import type { Task } from '../task';
import { formatClock, formatDateSpec, toLocalDateTime, type Instant, type TimeZone } from '../time';
import type { Reason } from './picker';

/** The fact of a ranked Task's reason line, on its own: 'Due yesterday 17:00' when Overdue with a Due, else 'Latest start 14:30', else 'No Due'. */
export const reasonFact = (
  task: Task,
  reason: Reason,
  now: Instant,
  timeZone: TimeZone,
): string => {
  if (reason.overdue && task.due !== null) {
    return `Due ${formatDateSpec(task.due, toLocalDateTime(now, timeZone).date)}`;
  }
  if (reason.latestStart !== null) {
    return `Latest start ${formatClock(reason.latestStart, now, timeZone)}`;
  }
  return 'No Due';
};

/** The one-line reason a ranked Task is where it is: one fact, then 'important' when it is. */
export const reasonText = (
  task: Task,
  reason: Reason,
  now: Instant,
  timeZone: TimeZone,
): string => {
  const fact = reasonFact(task, reason, now, timeZone);
  return task.important === true ? `${fact} · important` : fact;
};
