// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { IsoWeekday } from '../time/local-date';
import {
  activeHoursSummary,
  intervalFromTimes,
  minuteToTime,
  timeInputValue,
} from './active-hours-text';
import { PERSONAL_ACTIVE_HOURS, WORK_ACTIVE_HOURS, type ActiveHours } from './active-hours';

type Intervals = ActiveHours[IsoWeekday];

const NONE: ActiveHours = {
  [IsoWeekday.Monday]: [],
  [IsoWeekday.Tuesday]: [],
  [IsoWeekday.Wednesday]: [],
  [IsoWeekday.Thursday]: [],
  [IsoWeekday.Friday]: [],
  [IsoWeekday.Saturday]: [],
  [IsoWeekday.Sunday]: [],
};

const hours = (days: Partial<Record<IsoWeekday, Intervals>>): ActiveHours => ({
  ...NONE,
  ...days,
});

const {
  Monday: MON,
  Tuesday: TUE,
  Wednesday: WED,
  Thursday: THU,
  Friday: FRI,
  Saturday: SAT,
  Sunday: SUN,
} = IsoWeekday;

describe('minuteToTime', () => {
  it.each([
    [0, '00:00'],
    [480, '08:00'],
    [1439, '23:59'],
    [1440, '24:00'],
  ])('writes %i as %s', (minute, expected) => {
    expect(minuteToTime(minute)).toBe(expected);
  });

  it.each([-1, 1441, 1.5, Number.NaN])('throws a RangeError for %s', (minute) => {
    expect(() => minuteToTime(minute)).toThrow(RangeError);
  });
});

describe('timeInputValue', () => {
  it.each([
    [0, '00:00'],
    [1020, '17:00'],
    [1439, '23:59'],
    [1440, '00:00'],
  ])('writes %i as %s', (minute, expected) => {
    expect(timeInputValue(minute)).toBe(expected);
  });

  it.each([-1, 1441, 0.5])('throws a RangeError for %s', (minute) => {
    expect(() => timeInputValue(minute)).toThrow(RangeError);
  });
});

describe('intervalFromTimes', () => {
  it.each([
    ['09:00', '17:00', [540, 1020]],
    ['22:00', '00:00', [1320, 1440]],
    ['00:00', '00:00', [0, 1440]],
  ])('reads %s to %s as %j', (start, end, expected) => {
    expect(intervalFromTimes(start, end)).toStrictEqual(expected);
  });

  it.each([
    ['17:00', '09:00'],
    ['09:00', '09:00'],
    ['', '17:00'],
    ['9:00', '17:00'],
    ['09:00', '24:00'],
  ])('rejects %j to %j', (start, end) => {
    expect(intervalFromTimes(start, end)).toBeUndefined();
  });
});

describe('activeHoursSummary', () => {
  it('summarises the work hours', () => {
    expect(activeHoursSummary(WORK_ACTIVE_HOURS)).toBe('Mon–Fri 08:00–18:00');
  });

  it('summarises all-day, every-day hours', () => {
    expect(activeHoursSummary(PERSONAL_ACTIVE_HOURS)).toBe('Every day, all day');
  });

  it('says so when there are no Active hours', () => {
    expect(activeHoursSummary(NONE)).toBe('No Active hours');
  });

  it('lists several intervals of a day in stored order and groups differing days', () => {
    const summary = activeHoursSummary(
      hours({
        [MON]: [
          [540, 720],
          [780, 1020],
        ],
        [SAT]: [[600, 720]],
      }),
    );
    expect(summary).toBe('Mon 09:00–12:00, 13:00–17:00 · Sat 10:00–12:00');
  });

  it('attaches all day to a weekend group with a comma', () => {
    expect(
      activeHoursSummary(
        hours({
          [SAT]: [[0, 1440]],
          [SUN]: [[0, 1440]],
        }),
      ),
    ).toBe('Sat–Sun, all day');
  });

  it('joins non-consecutive days with commas and orders groups by first day', () => {
    expect(
      activeHoursSummary(
        hours({
          [MON]: [[540, 1020]],
          [TUE]: [[600, 720]],
          [WED]: [[540, 1020]],
          [FRI]: [[540, 1020]],
        }),
      ),
    ).toBe('Mon, Wed, Fri 09:00–17:00 · Tue 10:00–12:00');
  });

  it('mixes a run and a single day in one label', () => {
    expect(
      activeHoursSummary(
        hours({
          [MON]: [[540, 1020]],
          [TUE]: [[540, 1020]],
          [THU]: [[540, 1020]],
        }),
      ),
    ).toBe('Mon–Tue, Thu 09:00–17:00');
  });

  it('labels seven equal days Every day', () => {
    const day: Intervals = [[540, 1020]];
    expect(
      activeHoursSummary({
        [MON]: day,
        [TUE]: day,
        [WED]: day,
        [THU]: day,
        [FRI]: day,
        [SAT]: day,
        [SUN]: day,
      }),
    ).toBe('Every day 09:00–17:00');
  });

  it('writes the end of the day as 24:00 in a partial day', () => {
    expect(
      activeHoursSummary(
        hours({
          [MON]: [[480, 1080]],
          [TUE]: [[480, 1080]],
          [WED]: [[480, 1080]],
          [THU]: [[480, 1080]],
          [FRI]: [[480, 1080]],
          [SAT]: [[600, 1440]],
          [SUN]: [[600, 1440]],
        }),
      ),
    ).toBe('Mon–Fri 08:00–18:00 · Sat–Sun 10:00–24:00');
  });

  it('does not wrap Sunday to Monday', () => {
    expect(
      activeHoursSummary(
        hours({
          [MON]: [[540, 1020]],
          [SUN]: [[540, 1020]],
        }),
      ),
    ).toBe('Mon, Sun 09:00–17:00');
  });

  it('does not group days whose interval lists differ', () => {
    expect(
      activeHoursSummary(
        hours({
          [MON]: [[540, 1020]],
          [TUE]: [
            [540, 720],
            [780, 1020],
          ],
        }),
      ),
    ).toBe('Mon 09:00–17:00 · Tue 09:00–12:00, 13:00–17:00');
  });
});
