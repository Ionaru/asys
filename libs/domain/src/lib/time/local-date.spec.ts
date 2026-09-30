// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import {
  formatLocalDate,
  formatLocalTime,
  isLocalDate,
  isLocalTime,
  isValidDateSpec,
  parseLocalDate,
  parseLocalTime,
  sameDateSpec,
  type DateSpec,
} from './local-date';
import fc from 'fast-check';

const validDates = ['2026-03-29', '2028-02-29', '2000-02-29', '0001-01-01', '9999-12-31'];

const invalidDates = [
  '2026-02-29',
  '1900-02-29',
  '2026-04-31',
  '2026-13-01',
  '2026-00-10',
  '2026-01-00',
  '2026-4-1',
  '26-04-01',
  '2026-04-01T00:00',
  '0000-01-01',
  '',
  ' 2026-04-01',
];

const validTimes = ['00:00', '09:30', '23:59'];

const invalidTimes = ['24:00', '12:60', '9:30', '09:30:00', '', '0930'];

// Dates are generated through Date so every generated day exists in its month.
const dateParts = fc
  .date({
    min: new Date('0001-01-01T00:00:00.000Z'),
    max: new Date('9999-12-31T00:00:00.000Z'),
    noInvalidDate: true,
  })
  .map((d) => ({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }));

const timeParts = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([hour, minute]) => ({ hour, minute }));

describe('parseLocalDate', () => {
  it('returns the numeric parts of a leap day', () => {
    expect(parseLocalDate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
  });

  it.each(validDates)('accepts %s', (value) => {
    expect(parseLocalDate(value)).toBeDefined();
  });

  it.each(invalidDates)('returns undefined for %j', (value) => {
    expect(parseLocalDate(value)).toBeUndefined();
  });

  it('parses the first and last supported dates', () => {
    expect(parseLocalDate('0001-01-01')).toEqual({ year: 1, month: 1, day: 1 });
    expect(parseLocalDate('9999-12-31')).toEqual({ year: 9999, month: 12, day: 31 });
  });

  it('applies the Gregorian rule: centuries are leap only when divisible by 400', () => {
    expect(parseLocalDate('2000-02-29')).toBeDefined();
    expect(parseLocalDate('1900-02-29')).toBeUndefined();
    expect(parseLocalDate('2100-02-29')).toBeUndefined();
    expect(parseLocalDate('2026-02-29')).toBeUndefined();
  });

  it('accepts the last day of each 30 and 31 day month and rejects the day after', () => {
    expect(parseLocalDate('2026-04-30')).toBeDefined();
    expect(parseLocalDate('2026-04-31')).toBeUndefined();
    expect(parseLocalDate('2026-01-31')).toBeDefined();
    expect(parseLocalDate('2026-01-32')).toBeUndefined();
  });
});

describe('formatLocalDate', () => {
  it('zero-pads year, month and day to 4-2-2 digits', () => {
    expect(formatLocalDate({ year: 7, month: 3, day: 5 })).toBe('0007-03-05');
  });

  it('formats the boundaries', () => {
    expect(formatLocalDate({ year: 1, month: 1, day: 1 })).toBe('0001-01-01');
    expect(formatLocalDate({ year: 9999, month: 12, day: 31 })).toBe('9999-12-31');
  });

  it.each([
    ['month 13', { year: 2026, month: 13, day: 1 }],
    ['month 0', { year: 2026, month: 0, day: 1 }],
    ['day 0', { year: 2026, month: 1, day: 0 }],
    ['day past the month end', { year: 2026, month: 2, day: 29 }],
    ['year 0', { year: 0, month: 1, day: 1 }],
    ['year 10000', { year: 10000, month: 1, day: 1 }],
    ['non-integer day', { year: 2026, month: 1, day: 1.5 }],
    ['non-integer month', { year: 2026, month: 1.5, day: 1 }],
    ['non-integer year', { year: 2026.5, month: 1, day: 1 }],
    ['NaN day', { year: 2026, month: 1, day: Number.NaN }],
  ])('throws RangeError for %s', (_name, parts) => {
    expect(() => formatLocalDate(parts)).toThrow(RangeError);
  });

  it('round-trips parts through parseLocalDate for years 1 to 9999', () => {
    fc.assert(
      fc.property(dateParts, (p) => {
        expect(parseLocalDate(formatLocalDate(p))).toStrictEqual(p);
      }),
    );
  });

  it('round-trips a valid date string through parse and format', () => {
    fc.assert(
      fc.property(dateParts, (p) => {
        const s = formatLocalDate(p);
        const parsed = parseLocalDate(s);
        if (parsed === undefined) {
          throw new Error(`expected ${s} to parse`);
        }
        expect(formatLocalDate(parsed)).toBe(s);
      }),
    );
  });
});

describe('parseLocalTime', () => {
  it('returns the numeric parts', () => {
    expect(parseLocalTime('09:30')).toEqual({ hour: 9, minute: 30 });
  });

  it.each(validTimes)('accepts %s', (value) => {
    expect(parseLocalTime(value)).toBeDefined();
  });

  it.each(invalidTimes)('returns undefined for %j', (value) => {
    expect(parseLocalTime(value)).toBeUndefined();
  });

  it('parses the first and last minute of the day', () => {
    expect(parseLocalTime('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(parseLocalTime('23:59')).toEqual({ hour: 23, minute: 59 });
  });
});

describe('formatLocalTime', () => {
  it('zero-pads hour and minute to 2-2 digits', () => {
    expect(formatLocalTime({ hour: 9, minute: 5 })).toBe('09:05');
  });

  it('formats the boundaries', () => {
    expect(formatLocalTime({ hour: 0, minute: 0 })).toBe('00:00');
    expect(formatLocalTime({ hour: 23, minute: 59 })).toBe('23:59');
  });

  it.each([
    ['hour 24', { hour: 24, minute: 0 }],
    ['minute 60', { hour: 12, minute: 60 }],
    ['negative hour', { hour: -1, minute: 0 }],
    ['negative minute', { hour: 0, minute: -1 }],
    ['non-integer hour', { hour: 1.5, minute: 0 }],
    ['non-integer minute', { hour: 1, minute: 0.5 }],
    ['NaN hour', { hour: Number.NaN, minute: 0 }],
  ])('throws RangeError for %s', (_name, parts) => {
    expect(() => formatLocalTime(parts)).toThrow(RangeError);
  });

  it('round-trips parts through parseLocalTime', () => {
    fc.assert(
      fc.property(timeParts, (p) => {
        expect(parseLocalTime(formatLocalTime(p))).toStrictEqual(p);
      }),
    );
  });
});

describe('isLocalDate', () => {
  it.each(validDates)('is true for %s', (value) => {
    expect(isLocalDate(value)).toBe(true);
  });

  it.each(invalidDates)('is false for %j', (value) => {
    expect(isLocalDate(value)).toBe(false);
  });
});

describe('isLocalTime', () => {
  it.each(validTimes)('is true for %s', (value) => {
    expect(isLocalTime(value)).toBe(true);
  });

  it.each(invalidTimes)('is false for %j', (value) => {
    expect(isLocalTime(value)).toBe(false);
  });
});

describe('isValidDateSpec', () => {
  it('accepts a date without a time', () => {
    expect(isValidDateSpec({ date: '2026-10-16' })).toBe(true);
  });

  it('accepts a date with an explicit undefined time', () => {
    expect(isValidDateSpec({ date: '2026-10-16', time: undefined })).toBe(true);
  });

  it('accepts a date with a valid time', () => {
    expect(isValidDateSpec({ date: '2026-10-16', time: '10:00' })).toBe(true);
  });

  it('rejects an invalid date', () => {
    expect(isValidDateSpec({ date: '2026-02-29' })).toBe(false);
  });

  it('rejects an invalid time', () => {
    expect(isValidDateSpec({ date: '2026-10-16', time: '24:00' })).toBe(false);
    expect(isValidDateSpec({ date: '2026-10-16', time: '09:30:00' })).toBe(false);
  });

  it('rejects an empty time string', () => {
    expect(isValidDateSpec({ date: '2026-10-16', time: '' })).toBe(false);
  });

  it('rejects a null time (possible at runtime from JSON)', () => {
    expect(isValidDateSpec({ date: '2026-10-16', time: null } as unknown as DateSpec)).toBe(false);
  });

  it('rejects a non-string date', () => {
    expect(isValidDateSpec({ date: 20261016 } as unknown as DateSpec)).toBe(false);
    expect(isValidDateSpec({ date: null } as unknown as DateSpec)).toBe(false);
    expect(isValidDateSpec({} as unknown as DateSpec)).toBe(false);
  });
});

describe('sameDateSpec', () => {
  it('treats an absent time and an undefined time as equal', () => {
    expect(sameDateSpec({ date: '2026-10-16' }, { date: '2026-10-16', time: undefined })).toBe(
      true,
    );
  });

  it('is true for equal date and time', () => {
    expect(
      sameDateSpec({ date: '2026-10-16', time: '10:00' }, { date: '2026-10-16', time: '10:00' }),
    ).toBe(true);
  });

  it('is false when only one side has a time', () => {
    expect(sameDateSpec({ date: '2026-10-16' }, { date: '2026-10-16', time: '10:00' })).toBe(false);
    expect(sameDateSpec({ date: '2026-10-16', time: '10:00' }, { date: '2026-10-16' })).toBe(false);
  });

  it('is false when the times differ', () => {
    expect(
      sameDateSpec({ date: '2026-10-16', time: '10:00' }, { date: '2026-10-16', time: '10:01' }),
    ).toBe(false);
  });

  it('is false when the dates differ', () => {
    expect(sameDateSpec({ date: '2026-10-16' }, { date: '2026-10-17' })).toBe(false);
  });
});
