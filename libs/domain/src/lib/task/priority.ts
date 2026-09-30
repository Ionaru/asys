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
  return (
    start !== null && start <= addCalendarDays(now, settings.urgencyWindowDays, settings.timeZone)
  );
};

export const quadrant = (important: boolean, urgent: boolean): Quadrant => {
  if (important) return urgent ? Quadrant.Do : Quadrant.Plan;
  return urgent ? Quadrant.Delegate : Quadrant.Drop;
};
