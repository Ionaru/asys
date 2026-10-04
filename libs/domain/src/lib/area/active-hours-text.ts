// SPDX-License-Identifier: MPL-2.0

import { IsoWeekday, parseLocalTime } from '../time/local-date';
import type { ActiveHours, MinuteInterval } from './active-hours';

const MINUTES_PER_DAY = 1440;

const DAYS = [
  { weekday: IsoWeekday.Monday, name: 'Mon' },
  { weekday: IsoWeekday.Tuesday, name: 'Tue' },
  { weekday: IsoWeekday.Wednesday, name: 'Wed' },
  { weekday: IsoWeekday.Thursday, name: 'Thu' },
  { weekday: IsoWeekday.Friday, name: 'Fri' },
  { weekday: IsoWeekday.Saturday, name: 'Sat' },
  { weekday: IsoWeekday.Sunday, name: 'Sun' },
] as const;

const pad = (value: number): string => String(value).padStart(2, '0');

const assertMinute = (minute: number): void => {
  if (!Number.isInteger(minute) || minute < 0 || minute > MINUTES_PER_DAY) {
    throw new RangeError(`Invalid minute of the day: ${minute}`);
  }
};

/** A minute of the day as 'HH:MM' for summaries; 1440 is '24:00'. */
export const minuteToTime = (minute: number): string => {
  assertMinute(minute);

  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
};

/** A minute of the day as the value of a time input; 1440 is '00:00'. */
export const timeInputValue = (minute: number): string => {
  assertMinute(minute);

  return minuteToTime(minute === MINUTES_PER_DAY ? 0 : minute);
};

/** The interval between two 'HH:MM' times, where an end of '00:00' means the end of the day; undefined when invalid. */
export const intervalFromTimes = (start: string, end: string): MinuteInterval | undefined => {
  const startParts = parseLocalTime(start);
  const endParts = parseLocalTime(end);
  if (!startParts || !endParts) return undefined;
  const startMinute = startParts.hour * 60 + startParts.minute;
  const endMinute = endParts.hour * 60 + endParts.minute || MINUTES_PER_DAY;

  return startMinute < endMinute ? [startMinute, endMinute] : undefined;
};

const dayText = (intervals: readonly MinuteInterval[]): string => {
  if (intervals.length === 1 && intervals[0][0] === 0 && intervals[0][1] === MINUTES_PER_DAY) {
    return 'all day';
  }

  return intervals.map(([s, e]) => `${minuteToTime(s)}–${minuteToTime(e)}`).join(', ');
};

const sameIntervals = (a: readonly MinuteInterval[], b: readonly MinuteInterval[]): boolean =>
  a.length === b.length && a.every(([s, e], i) => s === b[i][0] && e === b[i][1]);

const groupLabel = (indexes: readonly number[]): string => {
  if (indexes.length === DAYS.length) return 'Every day';
  const runs: string[] = [];
  let i = 0;
  while (i < indexes.length) {
    let j = i;
    while (j + 1 < indexes.length && indexes[j + 1] === indexes[j] + 1) j++;
    runs.push(j > i ? `${DAYS[indexes[i]].name}–${DAYS[indexes[j]].name}` : DAYS[indexes[i]].name);
    i = j + 1;
  }

  return runs.join(', ');
};

/** A short text of an Area's Active hours, Monday first. */
export const activeHoursSummary = (hours: ActiveHours): string => {
  const groups: { intervals: readonly MinuteInterval[]; indexes: number[] }[] = [];
  DAYS.forEach(({ weekday }, index) => {
    const intervals = hours[weekday];
    if (intervals.length === 0) return;
    const group = groups.find((g) => sameIntervals(g.intervals, intervals));
    if (group) group.indexes.push(index);
    else groups.push({ intervals, indexes: [index] });
  });
  if (groups.length === 0) return 'No Active hours';

  return groups
    .map(({ intervals, indexes }) => {
      const text = dayText(intervals);
      const label = groupLabel(indexes);

      return text === 'all day' ? `${label}, all day` : `${label} ${text}`;
    })
    .join(' · ');
};
