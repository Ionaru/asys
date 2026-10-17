// SPDX-License-Identifier: MPL-2.0

import { blockedReasons, isOverdue, quadrant, type BlockerLink, type Task } from '../task';
import { isUrgentBy } from '../task/priority';
import { availableFromInstant, type Instant, type TimeZone } from '../time';
import { ExclusionReasonTag, type ExclusionReason, type Reason } from './reason-types';

/** The Reason of an Available Task: the one computation pick and explainTask share. `urgencyCutoff` returns the end of the Urgency window and is called only when `start` is set. */
export const reasonOf = (
  task: Task,
  start: Instant | null,
  now: Instant,
  timeZone: TimeZone,
  urgencyCutoff: () => Instant,
): Reason => {
  const urgent = isUrgentBy(start, urgencyCutoff);
  return {
    overdue: isOverdue(task, now, timeZone),
    quadrant: quadrant(task.important === true, urgent),
    urgent,
    latestStart: start,
  };
};

/** Why an Open, triaged Task is not Available: a NotYetAvailable first, then its blockers. */
export const exclusionReasons = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  now: Instant,
  timeZone: TimeZone,
): ExclusionReason[] => {
  const reasons: ExclusionReason[] = [];
  if (task.availableFrom !== null) {
    const from = availableFromInstant(task.availableFrom, timeZone);
    if (now < from) reasons.push({ _tag: ExclusionReasonTag.NotYetAvailable, from });
  }
  reasons.push(...blockedReasons(task, tasks, links));
  return reasons;
};
