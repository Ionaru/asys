// SPDX-License-Identifier: MPL-2.0

import { availableFromInstant, type Instant, type TimeZone } from '../time';
import { isBlocked } from './blocked';
import { isInInbox } from './inbox';
import { TaskStatus, type BlockerLink, type Task } from './task';

export const isAvailable = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  now: Instant,
  timeZone: TimeZone,
): boolean => {
  return (
    task.status === TaskStatus.Open &&
    !isInInbox(task) &&
    (task.availableFrom === null || now >= availableFromInstant(task.availableFrom, timeZone)) &&
    !isBlocked(task, tasks, links)
  );
};
