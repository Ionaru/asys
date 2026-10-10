// SPDX-License-Identifier: MPL-2.0

import { isWithinActiveHours, type Area } from '../area';
import type { Settings } from '../settings';
import {
  blockedReasons,
  isAvailable,
  isInInbox,
  isOverdue,
  isUrgentBy,
  deadlineIndex,
  Quadrant,
  TaskStatus,
  quadrant,
  type BlockedBy,
  type BlockerLink,
  type Task,
} from '../task';
import { addCalendarDays, availableFromInstant, toLocalDateTime, type Instant } from '../time';
import { reasonTextOn } from './reason-text';
import { waitingTextOn } from './waiting-text';

export enum ExclusionReasonTag {
  NotYetAvailable = 'NotYetAvailable',
}

export interface NotYetAvailable {
  readonly _tag: ExclusionReasonTag.NotYetAvailable;
  readonly from: Instant;
}

/** Why an Open, triaged Task is not ranked. An open union: Slice 2 adds Voice and Gap reasons, so consumers must handle tags they do not know. */
export type ExclusionReason = NotYetAvailable | BlockedBy;

export interface Reason {
  readonly overdue: boolean;
  readonly quadrant: Quadrant;
  readonly urgent: boolean;
  readonly latestStart: Instant | null;
}

export interface RankedTask {
  readonly task: Task;
  readonly reason: Reason;
  readonly reasonText: string;
}

export interface WaitingTask {
  readonly task: Task;
  readonly reasons: readonly ExclusionReason[];
  readonly reasonText: string;
}

export interface PickResult {
  readonly ranked: readonly RankedTask[];
  readonly waiting: readonly WaitingTask[];
}

const QUADRANT_ORDER: Readonly<Record<Quadrant, number>> = {
  [Quadrant.Do]: 0,
  [Quadrant.Plan]: 1,
  [Quadrant.Delegate]: 2,
  [Quadrant.Drop]: 3,
};

// Code-unit order on purpose: localeCompare would differ per runtime locale.
const compareStrings = (a: string, b: string): number => {
  return a < b ? -1 : a > b ? 1 : 0;
};

const compareCreated = (a: Task, b: Task): number => {
  return a.createdAt - b.createdAt || compareStrings(a.id, b.id);
};

const compareRanked = (a: RankedTask, b: RankedTask): number => {
  if (a.reason.overdue !== b.reason.overdue) return a.reason.overdue ? -1 : 1;
  const byQuadrant = QUADRANT_ORDER[a.reason.quadrant] - QUADRANT_ORDER[b.reason.quadrant];
  if (byQuadrant !== 0) return byQuadrant;
  const x = a.reason.latestStart;
  const y = b.reason.latestStart;
  if (x !== y) {
    if (x === null) return 1;
    if (y === null) return -1;
    return x - y;
  }
  return compareCreated(a.task, b.task);
};

// Derives a value on first use and keeps it. A value that throws is not kept, so it throws again.
const lazily = <T>(derive: () => T): (() => T) => {
  let derived: { readonly value: T } | undefined;
  return () => {
    derived ??= { value: derive() };
    return derived.value;
  };
};

export const pick = (
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  areas: readonly Area[],
  settings: Settings,
  now: Instant,
): PickResult => {
  const tz = settings.timeZone;
  // Derived at the first Task that needs them, because a Task that needs no conversion must not
  // reject an invalid zone, now or Urgency window.
  const today = lazily(() => toLocalDateTime(now, tz).date);
  const urgencyCutoff = lazily(() => addCalendarDays(now, settings.urgencyWindowDays, tz));
  const deadlines = deadlineIndex(tasks, links, tz);
  const areasById = new Map(areas.map((area) => [area.id, area]));
  const inHoursByArea = new Map<string, boolean>();
  const inHours = (task: Task): boolean => {
    if (task.areaId === null) return true;
    const area = areasById.get(task.areaId);
    if (area === undefined) return true;
    let within = inHoursByArea.get(area.id);
    if (within === undefined) {
      within = isWithinActiveHours(area, now, tz);
      inHoursByArea.set(area.id, within);
    }
    return within;
  };

  const ranked: RankedTask[] = [];
  const waiting: WaitingTask[] = [];
  for (const task of tasks) {
    if (!inHours(task)) continue;
    if (isAvailable(task, tasks, links, now, tz)) {
      const start = deadlines.latestStart(task);
      const urgent = isUrgentBy(start, urgencyCutoff);
      const reason: Reason = {
        overdue: isOverdue(task, now, tz),
        quadrant: quadrant(task.important === true, urgent),
        urgent,
        latestStart: start,
      };
      ranked.push({ task, reason, reasonText: reasonTextOn(task, reason, today, tz) });
    } else if (task.status === TaskStatus.Open && !isInInbox(task)) {
      const reasons: ExclusionReason[] = [];
      if (task.availableFrom !== null) {
        const from = availableFromInstant(task.availableFrom, tz);
        if (now < from) reasons.push({ _tag: ExclusionReasonTag.NotYetAvailable, from });
      }
      reasons.push(...blockedReasons(task, tasks, links));
      waiting.push({ task, reasons, reasonText: waitingTextOn(task, reasons, tasks, today, tz) });
    }
  }
  ranked.sort(compareRanked);
  waiting.sort((a, b) => compareCreated(a.task, b.task));
  return { ranked, waiting };
};
