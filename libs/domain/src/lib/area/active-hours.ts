// SPDX-License-Identifier: MPL-2.0

import { IsoWeekday, type Instant, type TimeZone } from '../time/local-date';
import { toLocalDateTime } from '../time/zoned';
import type { Area } from './area';

/** A half-open interval [startMinute, endMinute) of local minutes since midnight. */
export type MinuteInterval = readonly [startMinute: number, endMinute: number];

/** Per ISO weekday (1 = Monday ... 7 = Sunday), the intervals an Area is in use. */
export type ActiveHours = { readonly [D in IsoWeekday]: readonly MinuteInterval[] };

const MINUTES_PER_DAY = 1440;

const WEEKDAYS = [
  IsoWeekday.Monday,
  IsoWeekday.Tuesday,
  IsoWeekday.Wednesday,
  IsoWeekday.Thursday,
  IsoWeekday.Friday,
  IsoWeekday.Saturday,
  IsoWeekday.Sunday,
] as const;

const isValidDay = (day: unknown): boolean => {
  if (!Array.isArray(day)) return false;
  let previousEnd = 0;
  for (const interval of day as unknown[]) {
    if (!Array.isArray(interval) || interval.length !== 2) return false;
    const [start, end] = interval as unknown[];
    if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
    const s = start as number;
    const e = end as number;
    if (s < 0 || s >= e || e > MINUTES_PER_DAY) return false;
    if (s < previousEnd) return false;
    previousEnd = e;
  }
  return true;
};

export const isValidActiveHours = (hours: ActiveHours): boolean => {
  if (typeof hours !== 'object' || hours === null) return false;
  return WEEKDAYS.every((weekday) => isValidDay(hours[weekday]));
};

export const isWithinActiveHours = (area: Area, instant: Instant, timeZone: TimeZone): boolean => {
  const { isoWeekday, minuteOfDay } = toLocalDateTime(instant, timeZone);
  return area.activeHours[isoWeekday].some(
    ([start, end]) => start <= minuteOfDay && minuteOfDay < end,
  );
};

export const WORK_ACTIVE_HOURS: ActiveHours = {
  [IsoWeekday.Monday]: [[480, 1080]],
  [IsoWeekday.Tuesday]: [[480, 1080]],
  [IsoWeekday.Wednesday]: [[480, 1080]],
  [IsoWeekday.Thursday]: [[480, 1080]],
  [IsoWeekday.Friday]: [[480, 1080]],
  [IsoWeekday.Saturday]: [],
  [IsoWeekday.Sunday]: [],
};

export const PERSONAL_ACTIVE_HOURS: ActiveHours = {
  [IsoWeekday.Monday]: [[0, 1440]],
  [IsoWeekday.Tuesday]: [[0, 1440]],
  [IsoWeekday.Wednesday]: [[0, 1440]],
  [IsoWeekday.Thursday]: [[0, 1440]],
  [IsoWeekday.Friday]: [[0, 1440]],
  [IsoWeekday.Saturday]: [[0, 1440]],
  [IsoWeekday.Sunday]: [[0, 1440]],
};
