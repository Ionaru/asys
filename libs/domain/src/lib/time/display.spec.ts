// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatClock, formatDateSpec, formatDay, formatMinutes, formatMoment } from './display';
import { toLocalDateTime } from './zoned';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

const pad = (n: number, width: number) => String(n).padStart(width, '0');

const daysInMonth = (year: number, month: number) => {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

    return leap ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

describe('formatDay', () => {
  const today = '2026-10-04';

  it.each([
    ['2026-10-04', 'today'],
    ['2026-10-05', 'tomorrow'],
    ['2026-10-03', 'yesterday'],
    ['2026-10-10', 'Sat 10 Oct'],
    ['2026-09-01', 'Tue 1 Sep'],
    ['2026-10-06', 'Tue 6 Oct'],
    ['2026-10-02', 'Fri 2 Oct'],
    ['2027-01-04', 'Mon 4 Jan 2027'],
    ['2025-12-31', 'Wed 31 Dec 2025'],
  ])('formats %s as %j with today 2026-10-04', (date, expected) => {
    expect(formatDay(date, today)).toBe(expected);
  });

  it('says tomorrow across a year boundary', () => {
    expect(formatDay('2027-01-01', '2026-12-31')).toBe('tomorrow');
  });

  it('appends the year for the day after tomorrow in the next year', () => {
    expect(formatDay('2027-01-02', '2026-12-31')).toBe('Sat 2 Jan 2027');
  });

  it('says yesterday across a year boundary', () => {
    expect(formatDay('2026-12-31', '2027-01-01')).toBe('yesterday');
  });

  it('says yesterday on 29 February of a leap year', () => {
    expect(formatDay('2028-02-29', '2028-03-01')).toBe('yesterday');
  });

  it.each([
    ['2026-02-30', '2026-10-04'],
    ['x', '2026-10-04'],
    ['2026-10-04', '2026-02-30'],
    ['2026-10-04', 'x'],
  ])('rejects date %j with today %j', (date, todayArg) => {
    expect(() => formatDay(date, todayArg)).toThrow(RangeError);
  });

  it('says today for every valid date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        fc.integer({ min: 1, max: 12 }),
        fc.nat({ max: 30 }),
        (year, month, dayOffset) => {
          const day = 1 + (dayOffset % daysInMonth(year, month));
          const d = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;

          expect(formatDay(d, d)).toBe('today');
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('formatDateSpec', () => {
  const today = '2026-10-04';

  it('appends the time to a relative day', () => {
    expect(formatDateSpec({ date: '2026-10-04', time: '17:00' }, today)).toBe('today 17:00');
  });

  it('gives the day alone when there is no time', () => {
    expect(formatDateSpec({ date: '2026-10-06' }, today)).toBe('Tue 6 Oct');
  });

  it('keeps the leading zero of the time', () => {
    expect(formatDateSpec({ date: '2026-10-03', time: '09:05' }, today)).toBe('yesterday 09:05');
  });

  it.each([
    ['a bad date', { date: '2026-02-30' }],
    ['a bad date with a time', { date: 'x', time: '10:00' }],
    ['a time of 24:00', { date: '2026-10-04', time: '24:00' }],
    ['a malformed time', { date: '2026-10-04', time: '9:00' }],
  ])('rejects %s', (_name, spec) => {
    expect(() => formatDateSpec(spec, today)).toThrow(RangeError);
  });
});

describe('formatClock', () => {
  const now = at('2026-10-04T08:00:00.000Z');

  it.each([
    ['2026-10-04T12:30:00.000Z', '14:30'],
    ['2026-10-05T07:00:00.000Z', 'tomorrow 09:00'],
    ['2026-10-10T12:30:00.000Z', 'Sat 10 Oct 14:30'],
    ['2026-10-03T15:00:00.000Z', 'yesterday 17:00'],
  ])('formats %s as %j in Amsterdam', (iso, expected) => {
    expect(formatClock(at(iso), now, AMS)).toBe(expected);
  });

  describe('the 1 ms rule', () => {
    it('shows the next minute for an instant 1 ms before a minute boundary', () => {
      expect(formatClock(at('2026-10-04T21:29:59.999Z'), now, AMS)).toBe('23:30');
    });

    it('shows the next minute at 23:58:59.999', () => {
      expect(formatClock(at('2026-10-04T21:58:59.999Z'), now, AMS)).toBe('23:59');
    });

    it('shows 23:59 of the ending day at 23:59:59.999 (midnight exception)', () => {
      expect(formatClock(at('2026-10-04T21:59:59.999Z'), now, AMS)).toBe('23:59');
    });

    it('shows 23:59 of the ending day when the next day starts at 01:00 (no local midnight)', () => {
      // In Africa/Cairo, 2026-04-24 starts at 01:00 (+03:00): 00:00 does not exist that day.
      expect(
        formatClock(at('2026-04-23T21:59:59.999Z'), at('2026-04-23T08:00:00.000Z'), 'Africa/Cairo'),
      ).toBe('23:59');
    });

    it('shows 00:00 of its own day exactly at midnight', () => {
      expect(formatClock(at('2026-10-04T22:00:00.000Z'), now, AMS)).toBe('tomorrow 00:00');
    });

    it('truncates an instant with seconds to its minute', () => {
      expect(formatClock(at('2026-10-04T12:30:30.000Z'), now, AMS)).toBe('14:30');
    });

    it('truncates 2 ms before a boundary', () => {
      expect(formatClock(at('2026-10-04T21:29:59.998Z'), now, AMS)).toBe('23:29');
    });
  });

  describe('daylight saving', () => {
    it('shows 02:30 for both occurrences of the repeated hour on the fall-back day', () => {
      const fallNow = at('2026-10-25T08:00:00.000Z');

      expect(formatClock(at('2026-10-25T00:30:00.000Z'), fallNow, AMS)).toBe('02:30');
      expect(formatClock(at('2026-10-25T01:30:00.000Z'), fallNow, AMS)).toBe('02:30');
    });

    it('shows 03:30 for 01:30Z on the spring-forward day', () => {
      expect(formatClock(at('2026-03-29T01:30:00.000Z'), at('2026-03-29T08:00:00.000Z'), AMS)).toBe(
        '03:30',
      );
    });
  });

  it('formats in UTC', () => {
    expect(formatClock(at('2026-10-04T12:30:00.000Z'), now, 'UTC')).toBe('12:30');
  });

  describe('invalid input', () => {
    const instant = at('2026-10-04T12:30:00.000Z');

    it('rejects an invalid time zone', () => {
      expect(() => formatClock(instant, now, 'Mars/Olympus')).toThrow(RangeError);
    });

    it.each([NaN, Infinity, -Infinity])('rejects an instant of %j', (bad) => {
      expect(() => formatClock(bad, now, AMS)).toThrow(RangeError);
    });

    it.each([NaN, Infinity, -Infinity])('rejects a now of %j', (bad) => {
      expect(() => formatClock(instant, bad, AMS)).toThrow(RangeError);
    });
  });
});

describe('formatMinutes', () => {
  it.each([
    [0, '0 min'],
    [1, '1 min'],
    [5, '5 min'],
    [59, '59 min'],
    [60, '1 h'],
    [65, '1 h 05'],
    [90, '1 h 30'],
    [120, '2 h'],
    [125, '2 h 05'],
    [100000, '1666 h 40'],
  ])('formats %d as %j', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });

  it.each([-1, 1.5, NaN, Infinity])('rejects %j', (bad) => {
    expect(() => formatMinutes(bad)).toThrow(RangeError);
  });
});

describe('formatMoment', () => {
  it.each([
    ['2026-10-09T12:05:00.000Z', 'Fri 9 Oct · 14:05'],
    ['2026-10-04T22:30:00.000Z', 'Mon 5 Oct · 00:30'],
    ['2026-12-31T23:59:00.000Z', 'Fri 1 Jan · 00:59'],
    ['2026-10-09T12:05:59.999Z', 'Fri 9 Oct · 14:05'],
  ])('formats %s as %j in Amsterdam', (iso, expected) => {
    expect(formatMoment(at(iso), AMS)).toBe(expected);
  });

  it('joins the parts with a space, a middle dot and a space', () => {
    expect(formatMoment(at('2026-10-09T12:05:00.000Z'), AMS)).toContain(' \u00B7 ');
  });

  it('writes the day without a leading zero and the time with one', () => {
    expect(formatMoment(at('2026-10-05T07:05:00.000Z'), AMS)).toBe('Mon 5 Oct · 09:05');
  });

  it('keeps the two-digit day of the tenth and later', () => {
    expect(formatMoment(at('2026-10-10T12:30:00.000Z'), AMS)).toBe('Sat 10 Oct · 14:30');
  });

  it('crosses local midnight to the next weekday and date', () => {
    expect(formatMoment(at('2026-10-04T21:59:00.000Z'), AMS)).toBe('Sun 4 Oct · 23:59');
    expect(formatMoment(at('2026-10-04T22:00:00.000Z'), AMS)).toBe('Mon 5 Oct · 00:00');
  });

  it('never says today and never adds a year, also across a year change', () => {
    const moment = formatMoment(at('2026-12-31T23:59:00.000Z'), AMS);

    expect(moment).not.toContain('today');
    expect(moment).not.toContain('2026');
    expect(moment).not.toContain('2027');
  });

  it('drops the seconds instead of rounding them up', () => {
    expect(formatMoment(at('2026-10-09T12:05:59.999Z'), AMS)).toBe(
      formatMoment(at('2026-10-09T12:05:00.000Z'), AMS),
    );
  });

  describe('daylight saving', () => {
    it('shows 02:30 for both occurrences of the repeated hour on the fall-back day', () => {
      expect(formatMoment(at('2026-10-25T00:30:00.000Z'), AMS)).toBe('Sun 25 Oct · 02:30');
      expect(formatMoment(at('2026-10-25T01:30:00.000Z'), AMS)).toBe('Sun 25 Oct · 02:30');
    });

    it('shows 03:30 for 01:30Z on the spring-forward day', () => {
      expect(formatMoment(at('2026-03-29T01:30:00.000Z'), AMS)).toBe('Sun 29 Mar · 03:30');
    });
  });

  it('uses the time zone it is given', () => {
    expect(formatMoment(at('2026-10-09T12:05:00.000Z'), 'UTC')).toBe('Fri 9 Oct · 12:05');
    expect(formatMoment(at('2026-10-09T23:30:00.000Z'), 'UTC')).toBe('Fri 9 Oct · 23:30');
    expect(formatMoment(at('2026-10-09T23:30:00.000Z'), AMS)).toBe('Sat 10 Oct · 01:30');
  });

  it('names every weekday and month from the fixed English tables', () => {
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    // 2026-01-05 is a Monday, so the next seven days run Monday to Sunday.
    for (const [index, weekday] of weekdays.entries()) {
      const moment = formatMoment(at(`2026-01-${pad(5 + index, 2)}T12:00:00.000Z`), 'UTC');

      expect(moment.startsWith(`${weekday} ${5 + index} Jan`)).toBe(true);
    }

    for (const [index, month] of months.entries()) {
      const moment = formatMoment(at(`2026-${pad(index + 1, 2)}-15T12:00:00.000Z`), 'UTC');

      expect(moment).toContain(` 15 ${month} · 12:00`);
    }
  });

  describe('invalid input', () => {
    const instant = at('2026-10-09T12:05:00.000Z');

    it('rejects an invalid time zone', () => {
      expect(() => formatMoment(instant, 'Mars/Base')).toThrow(RangeError);
    });

    it.each([Number.NaN, Infinity, -Infinity])('rejects an instant of %j', (bad) => {
      expect(() => formatMoment(bad, AMS)).toThrow(RangeError);
    });
  });

  it('matches the moment pattern and shows the local time for every instant in 2026', () => {
    const start = at('2026-01-01T00:00:00.000Z');
    const end = at('2026-12-31T23:59:59.999Z');
    const pattern =
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \u00B7 \d{2}:\d{2}$/;

    fc.assert(
      fc.property(fc.integer({ min: start, max: end }), (instant) => {
        const moment = formatMoment(instant, AMS);

        expect(moment).toMatch(pattern);
        expect(moment.slice(-5)).toBe(toLocalDateTime(instant, AMS).time);
      }),
      { numRuns: 500 },
    );
  });
});
