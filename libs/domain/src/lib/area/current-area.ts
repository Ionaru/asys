// SPDX-License-Identifier: MPL-2.0

import { compareCodeUnits } from '../compare';
import type { Settings } from '../settings';
import type { Instant, TimeZone } from '../time/local-date';
import { localMinuteInstant, toLocalDateTime } from '../time/zoned';
import { isWithinActiveHours } from './active-hours';
import type { Area } from './area';

const MINUTES_PER_DAY = 1440;

/** An Area picked in Now, kept until `endsAt`. */
export interface AreaPick {
  readonly areaId: string;
  readonly endsAt: Instant;
}

/** The Areas whose Tasks Now ranks, and whether they come from a pick. */
export interface CurrentArea {
  readonly areaIds: readonly string[];
  readonly picked: boolean;
}

/** The ids of the Areas within their Active hours at `now`, in code-unit order. */
export const automaticAreaIds = (
  areas: readonly Area[],
  timeZone: TimeZone,
  now: Instant,
): readonly string[] => {
  return areas
    .filter((area) => isWithinActiveHours(area, now, timeZone))
    .map((area) => area.id)
    .sort(compareCodeUnits);
};

/**
 * A pick of the Area made at `now`, or null when the Area is not known. It ends when the Area next
 * comes into its Active hours that day, or at the start of the next day, whichever is earlier. An
 * interval that starts where the one before it ends is not a new entry.
 */
export const makeAreaPick = (
  areas: readonly Area[],
  settings: Settings,
  now: Instant,
  areaId: string,
): AreaPick | null => {
  const area = areas.find((candidate) => candidate.id === areaId);
  if (area === undefined) return null;
  const timeZone = settings.timeZone;
  const { date, isoWeekday } = toLocalDateTime(now, timeZone);
  let endsAt = localMinuteInstant(date, MINUTES_PER_DAY, timeZone);
  let previousEnd = -1;
  for (const [start, end] of area.activeHours[isoWeekday]) {
    if (start !== previousEnd) {
      const entry = localMinuteInstant(date, start, timeZone);
      if (entry > now && entry < endsAt) endsAt = entry;
    }
    previousEnd = end;
  }
  return { areaId, endsAt };
};

/** The picked Area while its pick holds and the Area exists, otherwise the Areas within Active hours. */
export const currentArea = (
  areas: readonly Area[],
  settings: Settings,
  now: Instant,
  pick: AreaPick | null,
): CurrentArea => {
  if (pick !== null && now < pick.endsAt && areas.some((area) => area.id === pick.areaId)) {
    return { areaIds: [pick.areaId], picked: true };
  }
  return { areaIds: automaticAreaIds(areas, settings.timeZone, now), picked: false };
};
