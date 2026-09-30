// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { IsoWeekday } from '../time/local-date';
import {
  isValidActiveHours,
  isWithinActiveHours,
  PERSONAL_ACTIVE_HOURS,
  WORK_ACTIVE_HOURS,
  type ActiveHours,
} from './active-hours';
import { seedAreas, type Area } from './area';
import { Privacy } from '../task/task';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

const [work, personal] = seedAreas({ workId: 'work-id', personalId: 'personal-id' });

const weekdays: readonly IsoWeekday[] = [
  IsoWeekday.Monday,
  IsoWeekday.Tuesday,
  IsoWeekday.Wednesday,
  IsoWeekday.Thursday,
  IsoWeekday.Friday,
  IsoWeekday.Saturday,
  IsoWeekday.Sunday,
];

const withDay = (day: unknown): ActiveHours =>
  ({
    [IsoWeekday.Monday]: [],
    [IsoWeekday.Tuesday]: [],
    [IsoWeekday.Wednesday]: [],
    [IsoWeekday.Thursday]: [],
    [IsoWeekday.Friday]: [],
    [IsoWeekday.Saturday]: [],
    [IsoWeekday.Sunday]: day,
  }) as unknown as ActiveHours;

const fridayOnly: ActiveHours = {
  [IsoWeekday.Monday]: [],
  [IsoWeekday.Tuesday]: [],
  [IsoWeekday.Wednesday]: [],
  [IsoWeekday.Thursday]: [],
  [IsoWeekday.Friday]: [[0, 1440]],
  [IsoWeekday.Saturday]: [],
  [IsoWeekday.Sunday]: [],
};

const fridayArea: Area = { ...work, activeHours: fridayOnly };

describe('seed Active hours', () => {
  it('gives Work 08:00 to 18:00 on Monday to Friday', () => {
    for (const day of [1, 2, 3, 4, 5] as const) {
      expect(WORK_ACTIVE_HOURS[day]).toEqual([[480, 1080]]);
    }
  });

  it('gives Work no hours on Saturday and Sunday', () => {
    expect(WORK_ACTIVE_HOURS[6]).toEqual([]);
    expect(WORK_ACTIVE_HOURS[7]).toEqual([]);
  });

  it('gives Personal the whole day on every weekday', () => {
    for (const day of weekdays) {
      expect(PERSONAL_ACTIVE_HOURS[day]).toEqual([[0, 1440]]);
    }
  });
});

describe('seedAreas', () => {
  it('returns the Work Area first and the Personal Area second', () => {
    expect(seedAreas({ workId: 'w', personalId: 'p' })).toEqual([
      {
        id: 'w',
        name: 'Work',
        activeHours: WORK_ACTIVE_HOURS,
        defaultPrivacy: null,
        version: 1,
      },
      {
        id: 'p',
        name: 'Personal',
        activeHours: PERSONAL_ACTIVE_HOURS,
        defaultPrivacy: Privacy.Hidden,
        version: 1,
      },
    ]);
  });
});

describe('isValidActiveHours', () => {
  it('accepts the Work seed hours', () => {
    expect(isValidActiveHours(WORK_ACTIVE_HOURS)).toBe(true);
  });

  it('accepts the Personal seed hours', () => {
    expect(isValidActiveHours(PERSONAL_ACTIVE_HOURS)).toBe(true);
  });

  it('accepts seven empty days', () => {
    expect(
      isValidActiveHours({
        [IsoWeekday.Monday]: [],
        [IsoWeekday.Tuesday]: [],
        [IsoWeekday.Wednesday]: [],
        [IsoWeekday.Thursday]: [],
        [IsoWeekday.Friday]: [],
        [IsoWeekday.Saturday]: [],
        [IsoWeekday.Sunday]: [],
      }),
    ).toBe(true);
  });

  it('accepts touching intervals', () => {
    expect(
      isValidActiveHours(
        withDay([
          [0, 480],
          [480, 600],
        ]),
      ),
    ).toBe(true);
  });

  it('accepts separated sorted intervals', () => {
    expect(
      isValidActiveHours(
        withDay([
          [0, 60],
          [120, 180],
        ]),
      ),
    ).toBe(true);
  });

  it('ignores extra keys', () => {
    expect(isValidActiveHours({ ...WORK_ACTIVE_HOURS, 8: 'junk', extra: null } as never)).toBe(
      true,
    );
  });

  it('rejects a negative start', () => {
    expect(isValidActiveHours(withDay([[-1, 60]]))).toBe(false);
  });

  it('rejects an end after 1440', () => {
    expect(isValidActiveHours(withDay([[0, 1441]]))).toBe(false);
  });

  it('rejects an empty interval', () => {
    expect(isValidActiveHours(withDay([[600, 600]]))).toBe(false);
  });

  it.each(weekdays)('rejects an interval that ends before it starts on weekday %i', (weekday) => {
    const hours = { ...PERSONAL_ACTIVE_HOURS, [weekday]: [[600, 480]] } as unknown as ActiveHours;
    expect(isValidActiveHours(hours)).toBe(false);
  });

  it('rejects overlapping intervals', () => {
    expect(
      isValidActiveHours(
        withDay([
          [0, 480],
          [470, 600],
        ]),
      ),
    ).toBe(false);
  });

  it('rejects unsorted intervals', () => {
    expect(
      isValidActiveHours(
        withDay([
          [480, 600],
          [0, 60],
        ]),
      ),
    ).toBe(false);
  });

  it('rejects a non-integer bound', () => {
    expect(isValidActiveHours(withDay([[0, 60.5]]))).toBe(false);
  });

  it('rejects a missing day without throwing', () => {
    const { [IsoWeekday.Sunday]: _sunday, ...missing } = WORK_ACTIVE_HOURS;
    expect(isValidActiveHours(missing as unknown as ActiveHours)).toBe(false);
  });

  it('rejects a day that is not an array without throwing', () => {
    expect(isValidActiveHours(withDay('08:00-18:00'))).toBe(false);
  });

  it('rejects null without throwing', () => {
    expect(isValidActiveHours(null as unknown as ActiveHours)).toBe(false);
  });
});

describe('isWithinActiveHours', () => {
  it('is true at the start of the Work day (Monday 08:00)', () => {
    expect(isWithinActiveHours(work, at('2026-10-05T06:00:00.000Z'), AMS)).toBe(true);
  });

  it('is true one minute before the Work day ends (Monday 17:59)', () => {
    expect(isWithinActiveHours(work, at('2026-10-05T15:59:00.000Z'), AMS)).toBe(true);
  });

  it('is true in the last millisecond before the end (Monday 17:59:59.999)', () => {
    expect(isWithinActiveHours(work, at('2026-10-05T15:59:59.999Z'), AMS)).toBe(true);
  });

  it('is false one minute before the Work day starts (Monday 07:59)', () => {
    expect(isWithinActiveHours(work, at('2026-10-05T05:59:00.000Z'), AMS)).toBe(false);
  });

  it('is false exactly at the end, which is exclusive (Monday 18:00)', () => {
    expect(isWithinActiveHours(work, at('2026-10-05T16:00:00.000Z'), AMS)).toBe(false);
  });

  it('is false for Work on a Saturday', () => {
    expect(isWithinActiveHours(work, at('2026-10-10T08:00:00.000Z'), AMS)).toBe(false);
  });

  describe('an Area with two intervals on Monday', () => {
    const split: Area = {
      ...work,
      activeHours: {
        ...fridayOnly,
        [IsoWeekday.Monday]: [
          [0, 60],
          [120, 180],
        ],
        [IsoWeekday.Friday]: [],
      },
    };

    it('is true inside the second interval (Monday 02:30)', () => {
      expect(isWithinActiveHours(split, at('2026-10-05T00:30:00.000Z'), AMS)).toBe(true);
    });

    it('is false in the gap between the intervals (Monday 01:30)', () => {
      expect(isWithinActiveHours(split, at('2026-10-04T23:30:00.000Z'), AMS)).toBe(false);
    });
  });

  it('is true for Personal at Sunday 23:59', () => {
    expect(isWithinActiveHours(personal, at('2026-10-11T21:59:00.000Z'), AMS)).toBe(true);
  });

  it('is true for Personal at Sunday 00:00', () => {
    expect(isWithinActiveHours(personal, at('2026-10-10T22:00:00.000Z'), AMS)).toBe(true);
  });

  it('uses the local weekday in the zone, not UTC (Saturday 00:30 in Amsterdam)', () => {
    expect(isWithinActiveHours(fridayArea, at('2026-10-09T22:30:00.000Z'), AMS)).toBe(false);
  });

  it('uses the zone given (Friday 22:30 in UTC)', () => {
    expect(isWithinActiveHours(fridayArea, at('2026-10-09T22:30:00.000Z'), 'UTC')).toBe(true);
  });
});
