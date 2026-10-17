// SPDX-License-Identifier: MPL-2.0

import { Temporal } from 'temporal-polyfill';
import {
  formatLocalTime,
  isValidDateSpec,
  parseLocalDate,
  parseLocalTime,
  type DateSpec,
  type Instant,
  type IsoWeekday,
  type LocalDate,
  type LocalTime,
  type TimeZone,
} from './local-date';

export interface LocalDateTime {
  readonly date: LocalDate;
  readonly time: LocalTime;
  readonly isoWeekday: IsoWeekday;
  /** hour * 60 + minute of the local wall time, 0..1439 */
  readonly minuteOfDay: number;
}

const MINUTES_PER_DAY = 1440;

// Zones that passed the check. Only valid strings are stored: the server and the contract filter
// call isValidTimeZone with user input, so remembering rejected strings would let that input grow
// the set. Valid names match case-insensitively, so the set is also capped and starts over when full.
const MAX_REMEMBERED_ZONES = 256;

const validTimeZones = new Set<string>();

export const isValidTimeZone = (timeZone: string): boolean => {
  if (typeof timeZone !== 'string' || timeZone.startsWith('+') || timeZone.startsWith('-')) {
    return false;
  }
  if (validTimeZones.has(timeZone)) return true;
  try {
    new Temporal.ZonedDateTime(0n, timeZone);
  } catch {
    return false;
  }
  if (validTimeZones.size >= MAX_REMEMBERED_ZONES) validTimeZones.clear();
  validTimeZones.add(timeZone);
  return true;
};

const assertTimeZone = (timeZone: TimeZone): void => {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Invalid time zone: ${timeZone}`);
};

const assertInstant = (instant: Instant): void => {
  if (typeof instant !== 'number' || !Number.isFinite(instant)) {
    throw new RangeError(`Invalid instant: ${instant}`);
  }
};

const plainDate = (date: LocalDate): Temporal.PlainDate => {
  const parts = parseLocalDate(date);
  if (parts === undefined) throw new RangeError(`Invalid local date: ${date}`);
  return Temporal.PlainDate.from(parts, { overflow: 'reject' });
};

const atTime = (date: LocalDate, time: LocalTime, timeZone: TimeZone): Temporal.ZonedDateTime => {
  const parts = parseLocalTime(time);
  if (parts === undefined) throw new RangeError(`Invalid local time: ${time}`);
  return plainDate(date)
    .toPlainDateTime({ hour: parts.hour, minute: parts.minute })
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' });
};

const assertSpec = (spec: DateSpec): void => {
  if (!isValidDateSpec(spec)) {
    throw new RangeError(`Invalid date spec: ${JSON.stringify(spec)}`);
  }
};

export const startOfDay = (date: LocalDate, timeZone: TimeZone): Instant => {
  assertTimeZone(timeZone);
  return plainDate(date).toZonedDateTime({ timeZone }).epochMilliseconds;
};

/**
 * The instant of a local minute of the day (0 to 1439) on a date, taking the later instant in a gap
 * and the earlier one in a fold. 1440 is the start of the next date, as an Active hours end is.
 */
export const localMinuteInstant = (
  date: LocalDate,
  minuteOfDay: number,
  timeZone: TimeZone,
): Instant => {
  if (!Number.isInteger(minuteOfDay) || minuteOfDay < 0 || minuteOfDay > MINUTES_PER_DAY) {
    throw new RangeError(`Invalid minute of the day: ${minuteOfDay}`);
  }
  assertTimeZone(timeZone);
  const day = plainDate(date);
  if (minuteOfDay === MINUTES_PER_DAY) {
    return day.add({ days: 1 }).toZonedDateTime({ timeZone }).epochMilliseconds;
  }
  return day
    .toPlainDateTime({ hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 })
    .toZonedDateTime(timeZone, { disambiguation: 'compatible' }).epochMilliseconds;
};

export const availableFromInstant = (spec: DateSpec, timeZone: TimeZone): Instant => {
  assertSpec(spec);
  assertTimeZone(timeZone);
  if (spec.time !== undefined) return atTime(spec.date, spec.time, timeZone).epochMilliseconds;
  return startOfDay(spec.date, timeZone);
};

export const dueInstant = (spec: DateSpec, timeZone: TimeZone): Instant => {
  assertSpec(spec);
  assertTimeZone(timeZone);
  if (spec.time !== undefined) return atTime(spec.date, spec.time, timeZone).epochMilliseconds;
  return plainDate(spec.date).add({ days: 1 }).toZonedDateTime({ timeZone }).epochMilliseconds - 1;
};

export const addCalendarDays = (instant: Instant, days: number, timeZone: TimeZone): Instant => {
  assertInstant(instant);
  if (!Number.isInteger(days)) throw new RangeError(`Invalid number of days: ${days}`);
  assertTimeZone(timeZone);
  return Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(timeZone).add({ days })
    .epochMilliseconds;
};

export const toLocalDateTime = (instant: Instant, timeZone: TimeZone): LocalDateTime => {
  assertInstant(instant);
  assertTimeZone(timeZone);
  const zoned = Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(timeZone);
  return {
    date: zoned.toPlainDate().toString(),
    time: formatLocalTime({ hour: zoned.hour, minute: zoned.minute }),
    isoWeekday: zoned.dayOfWeek as IsoWeekday,
    minuteOfDay: zoned.hour * 60 + zoned.minute,
  };
};

/** A calendar date some days from another, with no zone: addDays('2026-10-31', 1) is '2026-11-01'. */
export const addDays = (date: LocalDate, days: number): LocalDate => {
  if (!Number.isInteger(days)) throw new RangeError(`Invalid number of days: ${days}`);
  return plainDate(date).add({ days }).toString();
};

/** The ISO weekday of a calendar date: '2026-10-12' is IsoWeekday.Monday. */
export const isoWeekdayOf = (date: LocalDate): IsoWeekday => {
  return plainDate(date).dayOfWeek as IsoWeekday;
};
