// SPDX-License-Identifier: MPL-2.0

import { isWithinActiveHours, type Area } from '../area';
import { compareCodeUnits } from '../compare';
import type { Settings } from '../settings';
import {
  isAvailable,
  isInInbox,
  isOverdue,
  deadlineIndex,
  Quadrant,
  TaskStatus,
  type BlockerLink,
  type Task,
} from '../task';
import { addCalendarDays, toLocalDateTime, type Instant } from '../time';
import { exclusionReasons, reasonOf } from './reasons';
import { reasonTextOn } from './reason-text';
import type { ExclusionReason, Reason } from './reason-types';
import { waitingTextOn } from './waiting-text';

export {
  ExclusionReasonTag,
  type ExclusionReason,
  type NotYetAvailable,
  type Reason,
} from './reason-types';

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

/** The Areas whose Available Tasks were left out only because of their Area. */
export interface OtherArea {
  readonly areaId: string;
  readonly count: number;
  readonly overdue: number;
}

export interface PickResult {
  readonly ranked: readonly RankedTask[];
  readonly waiting: readonly WaitingTask[];
  /**
   * Each entry counts the Tasks that are Available and left out only because of their Area, and
   * how many of them are Overdue. Only Areas with a count above zero appear, ordered by name then
   * id in code units. Slice 2's Gap and Place filters have to revisit what "only because of their
   * Area" means.
   */
  readonly otherAreas: readonly OtherArea[];
}

const QUADRANT_ORDER: Readonly<Record<Quadrant, number>> = {
  [Quadrant.Do]: 0,
  [Quadrant.Plan]: 1,
  [Quadrant.Delegate]: 2,
  [Quadrant.Drop]: 3,
};

const compareCreated = (a: Task, b: Task): number => {
  return a.createdAt - b.createdAt || compareCodeUnits(a.id, b.id);
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
  currentAreaIds?: readonly string[],
): PickResult => {
  const tz = settings.timeZone;
  // Derived at the first Task that needs them, because a Task that needs no conversion must not
  // reject an invalid zone, now or Urgency window.
  const today = lazily(() => toLocalDateTime(now, tz).date);
  const urgencyCutoff = lazily(() => addCalendarDays(now, settings.urgencyWindowDays, tz));
  const deadlines = deadlineIndex(tasks, links, tz);
  const areasById = new Map(areas.map((area) => [area.id, area]));
  const inHoursByArea = new Map<string, boolean>();
  const isCurrent = (area: Area): boolean => {
    if (currentAreaIds !== undefined) return currentAreaIds.includes(area.id);
    let within = inHoursByArea.get(area.id);
    if (within === undefined) {
      within = isWithinActiveHours(area, now, tz);
      inHoursByArea.set(area.id, within);
    }
    return within;
  };
  // The Task's Area when it is outside the Current Area; a Task without an Area, or with an
  // Area that is not known, is never outside it.
  const outsideArea = (task: Task): Area | undefined => {
    const area = task.areaId === null ? undefined : areasById.get(task.areaId);
    return area === undefined || isCurrent(area) ? undefined : area;
  };

  const ranked: RankedTask[] = [];
  const waiting: WaitingTask[] = [];
  const counts = new Map<string, { area: Area; count: number; overdue: number }>();
  for (const task of tasks) {
    if (isAvailable(task, tasks, links, now, tz)) {
      const outside = outsideArea(task);
      if (outside !== undefined) {
        const entry = counts.get(outside.id) ?? { area: outside, count: 0, overdue: 0 };
        entry.count += 1;
        if (isOverdue(task, now, tz)) entry.overdue += 1;
        counts.set(outside.id, entry);
        continue;
      }
      const reason = reasonOf(task, deadlines.latestStart(task), now, tz, urgencyCutoff);
      ranked.push({ task, reason, reasonText: reasonTextOn(task, reason, today, tz) });
    } else if (task.status === TaskStatus.Open && !isInInbox(task)) {
      if (outsideArea(task) !== undefined) continue;
      const reasons = exclusionReasons(task, tasks, links, now, tz);
      waiting.push({ task, reasons, reasonText: waitingTextOn(task, reasons, tasks, today, tz) });
    }
  }
  ranked.sort(compareRanked);
  waiting.sort((a, b) => compareCreated(a.task, b.task));
  const otherAreas: OtherArea[] = [...counts.values()]
    .sort(
      (a, b) =>
        compareCodeUnits(a.area.name, b.area.name) || compareCodeUnits(a.area.id, b.area.id),
    )
    .map(({ area, count, overdue }) => ({ areaId: area.id, count, overdue }));
  return { ranked, waiting, otherAreas };
};
