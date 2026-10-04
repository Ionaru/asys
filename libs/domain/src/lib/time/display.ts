// SPDX-License-Identifier: MPL-2.0

import { Temporal } from 'temporal-polyfill';
import {
  isValidDateSpec,
  parseLocalDate,
  type DateSpec,
  type Instant,
  type LocalDate,
  type TimeZone,
} from './local-date';
import { isValidTimeZone, toLocalDateTime } from './zoned';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const plainDate = (date: LocalDate): Temporal.PlainDate => {
  const parts = parseLocalDate(date);
  if (parts === undefined) throw new RangeError(`Invalid local date: ${date}`);
  return Temporal.PlainDate.from(parts, { overflow: 'reject' });
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** A local date relative to today: 'today', 'tomorrow', 'yesterday', else 'Sat 3 Oct' (with the year when it differs from today's). */
export const formatDay = (date: LocalDate, today: LocalDate): string => {
  const target = plainDate(date);
  const base = plainDate(today);
  const diff = target.since(base, { largestUnit: 'days' }).days;
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  const text = `${WEEKDAYS[target.dayOfWeek - 1]} ${target.day} ${MONTHS[target.month - 1]}`;
  return target.year === base.year ? text : `${text} ${target.year}`;
};

/** A DateSpec relative to today: formatDay of its date, then ' HH:MM' when it has a time. */
export const formatDateSpec = (spec: DateSpec, today: LocalDate): string => {
  if (!isValidDateSpec(spec)) throw new RangeError(`Invalid date spec: ${JSON.stringify(spec)}`);
  const day = formatDay(spec.date, today);
  return spec.time === undefined ? day : `${day} ${spec.time}`;
};

/** An instant as a 24-hour time in the zone; the time alone on now's local day, else the day and the time. */
export const formatClock = (instant: Instant, now: Instant, timeZone: TimeZone): string => {
  if (!isValidTimeZone(timeZone)) throw new RangeError(`Invalid time zone: ${timeZone}`);
  if (typeof instant !== 'number' || !Number.isFinite(instant)) {
    throw new RangeError(`Invalid instant: ${instant}`);
  }
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new RangeError(`Invalid instant: ${now}`);
  }
  const current = Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(timeZone);
  const next = Temporal.Instant.fromEpochMilliseconds(instant + 1).toZonedDateTimeISO(timeZone);
  const onBoundary = next.second === 0 && next.millisecond === 0;
  // The day's end, not a wall-clock 00:00: some zones start a day at 01:00 when DST begins.
  const isDayEnd = !next.toPlainDate().equals(current.toPlainDate());
  const shownInstant = onBoundary && !isDayEnd ? instant + 1 : instant;
  const shown = toLocalDateTime(shownInstant, timeZone);
  const nowDate = toLocalDateTime(now, timeZone).date;
  return shown.date === nowDate ? shown.time : `${formatDay(shown.date, nowDate)} ${shown.time}`;
};

/** A number of minutes: '5 min', '1 h', '1 h 05'. */
export const formatMinutes = (minutes: number): string => {
  if (!Number.isInteger(minutes) || minutes < 0) {
    throw new RangeError(`Invalid number of minutes: ${minutes}`);
  }
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${pad2(rest)}`;
};
