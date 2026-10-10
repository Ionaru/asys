// SPDX-License-Identifier: MPL-2.0

import type { Task } from '../task';
import {
  formatClockOn,
  formatDateSpec,
  toLocalDateTime,
  type Instant,
  type LocalDate,
  type TimeZone,
} from '../time';
import type { Reason } from './picker';

const factOn = (task: Task, reason: Reason, today: () => LocalDate, timeZone: TimeZone): string => {
  if (reason.overdue && task.due !== null) {
    return `Due ${formatDateSpec(task.due, today())}`;
  }
  if (reason.latestStart !== null) {
    return `Latest start ${formatClockOn(reason.latestStart, today, timeZone)}`;
  }
  return 'No Due';
};

/** The fact of a ranked Task's reason line, on its own: 'Due yesterday 17:00' when Overdue with a Due, else 'Latest start 14:30', else 'No Due'. */
export const reasonFact = (
  task: Task,
  reason: Reason,
  now: Instant,
  timeZone: TimeZone,
): string => {
  return factOn(task, reason, () => toLocalDateTime(now, timeZone).date, timeZone);
};

/** The one-line reason a ranked Task is where it is: one fact, then 'important' when it is. */
export const reasonText = (
  task: Task,
  reason: Reason,
  now: Instant,
  timeZone: TimeZone,
): string => {
  return reasonTextOn(task, reason, () => toLocalDateTime(now, timeZone).date, timeZone);
};

/** reasonText for a caller that explains many Tasks at one now. `today` returns now's local date, so the caller can derive it once; it is called only when the text needs it. */
export const reasonTextOn = (
  task: Task,
  reason: Reason,
  today: () => LocalDate,
  timeZone: TimeZone,
): string => {
  const fact = factOn(task, reason, today, timeZone);
  return task.important === true ? `${fact} · important` : fact;
};
