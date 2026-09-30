// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { formatLocalDate } from './local-date';
import {
  addCalendarDays,
  availableFromInstant,
  dueInstant,
  isValidTimeZone,
  startOfDay,
  toLocalDateTime,
} from './zoned';
import fc from 'fast-check';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Europe/Amsterdam'])('accepts %s', (tz) => {
    expect(isValidTimeZone(tz)).toBe(true);
  });

  it.each(['+01:00', '-05:00', 'Mars/Olympus', ''])('rejects %j', (tz) => {
    expect(isValidTimeZone(tz)).toBe(false);
  });

  it('does not throw for garbage input', () => {
    expect(() => isValidTimeZone('not a zone at all')).not.toThrow();
  });
});

describe('startOfDay', () => {
  it('returns local midnight on the spring-forward day (23 hour offset from UTC)', () => {
    expect(startOfDay('2026-03-29', AMS)).toBe(at('2026-03-28T23:00:00.000Z'));
  });

  it('returns local midnight on the fall-back day', () => {
    expect(startOfDay('2026-10-25', AMS)).toBe(at('2026-10-24T22:00:00.000Z'));
  });

  it('returns UTC midnight in UTC', () => {
    expect(startOfDay('2026-12-15', 'UTC')).toBe(at('2026-12-15T00:00:00.000Z'));
  });

  it('rejects a date that Temporal would constrain (2026-02-30)', () => {
    expect(() => startOfDay('2026-02-30', AMS)).toThrow(RangeError);
  });

  it('rejects a compact date form', () => {
    expect(() => startOfDay('20260401', AMS)).toThrow(RangeError);
  });

  it('rejects a date with a time part', () => {
    expect(() => startOfDay('2026-04-01T10:00', AMS)).toThrow(RangeError);
  });

  it('rejects an unknown time zone', () => {
    expect(() => startOfDay('2026-04-01', 'Mars/Olympus')).toThrow(RangeError);
  });

  it('rejects a UTC offset as time zone', () => {
    expect(() => startOfDay('2026-04-01', '+01:00')).toThrow(RangeError);
  });
});

describe('availableFromInstant', () => {
  it('with a time, resolves a DST gap wall time to the later wall time', () => {
    expect(availableFromInstant({ date: '2026-03-29', time: '02:30' }, AMS)).toBe(
      at('2026-03-29T01:30:00.000Z'),
    );
  });

  it('with a time, resolves a DST overlap wall time to the earlier offset', () => {
    expect(availableFromInstant({ date: '2026-10-25', time: '02:30' }, AMS)).toBe(
      at('2026-10-25T00:30:00.000Z'),
    );
  });

  it('without a time, is the start of the day', () => {
    expect(availableFromInstant({ date: '2026-03-29' }, AMS)).toBe(at('2026-03-28T23:00:00.000Z'));
  });

  it('with a time, is that wall time on an ordinary day', () => {
    expect(availableFromInstant({ date: '2026-10-16', time: '10:00' }, AMS)).toBe(
      at('2026-10-16T08:00:00.000Z'),
    );
  });

  it('rejects an invalid time', () => {
    expect(() => availableFromInstant({ date: '2026-04-01', time: '24:00' }, AMS)).toThrow(
      RangeError,
    );
  });

  it('rejects an invalid time zone', () => {
    expect(() => availableFromInstant({ date: '2026-04-01' }, 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('dueInstant', () => {
  it('with a time, resolves a DST gap wall time to the later wall time', () => {
    expect(dueInstant({ date: '2026-03-29', time: '02:30' }, AMS)).toBe(
      at('2026-03-29T01:30:00.000Z'),
    );
  });

  it('without a time, is the last millisecond of the 23 hour spring-forward day', () => {
    expect(dueInstant({ date: '2026-03-29' }, AMS)).toBe(at('2026-03-29T21:59:59.999Z'));
  });

  it('without a time, is the last millisecond of the 25 hour fall-back day', () => {
    expect(dueInstant({ date: '2026-10-25' }, AMS)).toBe(at('2026-10-25T22:59:59.999Z'));
  });

  it('with a time, is that wall time on an ordinary day', () => {
    expect(dueInstant({ date: '2026-10-16', time: '10:00' }, AMS)).toBe(
      at('2026-10-16T08:00:00.000Z'),
    );
    expect(dueInstant({ date: '2026-10-30', time: '17:30' }, AMS)).toBe(
      at('2026-10-30T16:30:00.000Z'),
    );
  });

  it('without a time, is the last millisecond of a winter day', () => {
    expect(dueInstant({ date: '2026-12-15' }, AMS)).toBe(at('2026-12-15T22:59:59.999Z'));
  });

  it('without a time, in UTC, is 23:59:59.999 of that day', () => {
    expect(dueInstant({ date: '2026-12-15' }, 'UTC')).toBe(at('2026-12-15T23:59:59.999Z'));
  });

  it('without a time, rolls over a month end', () => {
    expect(dueInstant({ date: '2026-12-31' }, 'UTC')).toBe(at('2026-12-31T23:59:59.999Z'));
  });

  it('rejects a time of 24:00', () => {
    expect(() => dueInstant({ date: '2026-04-01', time: '24:00' }, AMS)).toThrow(RangeError);
  });

  it('rejects a time with seconds', () => {
    expect(() => dueInstant({ date: '2026-04-01', time: '09:30:00' }, AMS)).toThrow(RangeError);
  });

  it('rejects a null time', () => {
    expect(() =>
      dueInstant({ date: '2026-04-01', time: null } as unknown as { date: string }, AMS),
    ).toThrow(RangeError);
  });

  it('rejects an invalid date', () => {
    expect(() => dueInstant({ date: '2026-02-30' }, AMS)).toThrow(RangeError);
  });

  it('rejects an offset time zone', () => {
    expect(() => dueInstant({ date: '2026-04-01' }, '-05:00')).toThrow(RangeError);
  });
});

describe('addCalendarDays', () => {
  it('keeps the wall time across the spring-forward change', () => {
    expect(addCalendarDays(at('2026-03-28T09:00:00.000Z'), 1, AMS)).toBe(
      at('2026-03-29T08:00:00.000Z'),
    );
  });

  it('keeps the wall time across the fall-back change', () => {
    expect(addCalendarDays(at('2026-10-24T08:00:00.000Z'), 2, AMS)).toBe(
      at('2026-10-26T09:00:00.000Z'),
    );
  });

  it('moves backwards for negative days', () => {
    expect(addCalendarDays(at('2026-10-16T08:00:00.000Z'), -2, AMS)).toBe(
      at('2026-10-14T08:00:00.000Z'),
    );
  });

  it('returns the same instant for zero days', () => {
    expect(addCalendarDays(at('2026-10-16T08:00:00.000Z'), 0, AMS)).toBe(
      at('2026-10-16T08:00:00.000Z'),
    );
  });

  it('rejects a fractional number of days', () => {
    expect(() => addCalendarDays(0, 1.5, AMS)).toThrow(RangeError);
  });

  it('rejects a non-finite instant', () => {
    expect(() => addCalendarDays(Number.NaN, 1, AMS)).toThrow(RangeError);
    expect(() => addCalendarDays(Number.POSITIVE_INFINITY, 1, AMS)).toThrow(RangeError);
  });

  it('rejects an invalid time zone', () => {
    expect(() => addCalendarDays(0, 1, 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('toLocalDateTime', () => {
  it('returns the local date, time, weekday and minute of day, truncating milliseconds', () => {
    expect(toLocalDateTime(at('2026-10-09T22:30:59.999Z'), AMS)).toEqual({
      date: '2026-10-10',
      time: '00:30',
      isoWeekday: 6,
      minuteOfDay: 30,
    });
  });

  it('returns the same wall values in UTC', () => {
    expect(toLocalDateTime(at('2026-10-09T22:30:00.000Z'), 'UTC')).toEqual({
      date: '2026-10-09',
      time: '22:30',
      isoWeekday: 5,
      minuteOfDay: 1350,
    });
  });

  it('numbers Monday as weekday 1', () => {
    expect(toLocalDateTime(at('2026-10-05T06:00:00.000Z'), AMS)).toEqual({
      date: '2026-10-05',
      time: '08:00',
      isoWeekday: 1,
      minuteOfDay: 480,
    });
  });

  it('numbers Sunday as weekday 7', () => {
    expect(toLocalDateTime(at('2026-10-11T12:00:00.000Z'), 'UTC').isoWeekday).toBe(7);
  });

  it('rejects a NaN instant', () => {
    expect(() => toLocalDateTime(Number.NaN, AMS)).toThrow(RangeError);
  });

  it('rejects an infinite instant', () => {
    expect(() => toLocalDateTime(Number.POSITIVE_INFINITY, AMS)).toThrow(RangeError);
  });

  it('rejects an invalid time zone', () => {
    expect(() => toLocalDateTime(0, '+01:00')).toThrow(RangeError);
  });
});

describe('day boundaries across zones', () => {
  const zones = [
    'Europe/Amsterdam',
    'America/New_York',
    'America/Sao_Paulo',
    'America/St_Johns',
    'Asia/Kolkata',
    'Asia/Kathmandu',
    'Australia/Lord_Howe',
    'Pacific/Chatham',
    'UTC',
  ];

  const dateIn1971To2099 = fc
    .date({
      min: new Date('1971-01-01T00:00:00.000Z'),
      max: new Date('2099-12-31T00:00:00.000Z'),
      noInvalidDate: true,
    })
    .map((d) =>
      formatLocalDate({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
      }),
    );

  it('makes availableFromInstant strictly earlier than dueInstant for a date-only spec', () => {
    fc.assert(
      fc.property(dateIn1971To2099, fc.constantFrom(...zones), (date, tz) => {
        expect(availableFromInstant({ date }, tz)).toBeLessThan(dueInstant({ date }, tz));
      }),
      { numRuns: 200 },
    );
  });
});
