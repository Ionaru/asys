// SPDX-License-Identifier: MPL-2.0

import type { Task } from '../task';
import { formatClock, formatDateSpec, toLocalDateTime, type Instant, type TimeZone } from '../time';
import type { Reason } from './picker';

/** The one-line reason a ranked Task is where it is: one fact, then 'important' when it is. */
export const reasonText = (
  task: Task,
  reason: Reason,
  now: Instant,
  timeZone: TimeZone,
): string => {
  let fact: string;
  if (reason.overdue && task.due !== null) {
    fact = `Due ${formatDateSpec(task.due, toLocalDateTime(now, timeZone).date)}`;
  } else if (reason.latestStart !== null) {
    fact = `Latest start ${formatClock(reason.latestStart, now, timeZone)}`;
  } else {
    fact = 'No Due';
  }
  return task.important === true ? `${fact} · important` : fact;
};
