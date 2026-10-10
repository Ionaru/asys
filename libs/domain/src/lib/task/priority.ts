// SPDX-License-Identifier: MPL-2.0

import { addCalendarDays, type Instant } from '../time';
import type { Settings } from '../settings';
import { latestStart } from './deadlines';
import type { BlockerLink, Task } from './task';

export enum Quadrant {
  Do = 'do',
  Plan = 'plan',
  Delegate = 'delegate',
  Drop = 'drop',
}

export const isUrgent = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  now: Instant,
  settings: Settings,
): boolean => {
  return isUrgentAt(latestStart(task, tasks, links, settings.timeZone), now, settings);
};

export const isUrgentAt = (start: Instant | null, now: Instant, settings: Settings): boolean => {
  return isUrgentBy(start, () =>
    addCalendarDays(now, settings.urgencyWindowDays, settings.timeZone),
  );
};

/**
 * isUrgentAt for a caller that asks about many Tasks. `cutoff` returns the end of the Urgency
 * window, so the caller can derive it once; it is called only for a Task with a Latest start.
 */
export const isUrgentBy = (start: Instant | null, cutoff: () => Instant): boolean => {
  return start !== null && start <= cutoff();
};

export const quadrant = (important: boolean, urgent: boolean): Quadrant => {
  if (important) return urgent ? Quadrant.Do : Quadrant.Plan;
  return urgent ? Quadrant.Delegate : Quadrant.Drop;
};
