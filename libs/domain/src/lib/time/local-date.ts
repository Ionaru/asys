// SPDX-License-Identifier: MPL-2.0

/** 'YYYY-MM-DD' */
export type LocalDate = string;

/** 'HH:MM' */
export type LocalTime = string;

/** A local date with an optional local time. `time` is either absent or a valid LocalTime. */
export interface DateSpec {
  readonly date: LocalDate;
  readonly time?: LocalTime;
}

/** Epoch milliseconds. */
export type Instant = number;

/** An IANA time zone id. */
export type TimeZone = string;

/** ISO weekday: Monday = 1 ... Sunday = 7. */
export enum IsoWeekday {
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
  Sunday = 7,
}

export interface LocalDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface LocalTimeParts {
  readonly hour: number;
  readonly minute: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const TIME_PATTERN = /^\d{2}:\d{2}$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean => {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
};

const daysInMonth = (year: number, month: number): number => {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
};

const isValidDateParts = (parts: LocalDateParts): boolean => {
  const { year, month, day } = parts;
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
};

const isValidTimeParts = (parts: LocalTimeParts): boolean => {
  const { hour, minute } = parts;
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  );
};

export const parseLocalDate = (value: string): LocalDateParts | undefined => {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return undefined;
  const parts = {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
  return isValidDateParts(parts) ? parts : undefined;
};

export const formatLocalDate = (parts: LocalDateParts): LocalDate => {
  if (!isValidDateParts(parts)) {
    throw new RangeError(`Invalid local date parts: ${JSON.stringify(parts)}`);
  }
  const year = String(parts.year).padStart(4, '0');
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseLocalTime = (value: string): LocalTimeParts | undefined => {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) return undefined;
  const parts = {
    hour: Number(value.slice(0, 2)),
    minute: Number(value.slice(3, 5)),
  };
  return isValidTimeParts(parts) ? parts : undefined;
};

export const formatLocalTime = (parts: LocalTimeParts): LocalTime => {
  if (!isValidTimeParts(parts)) {
    throw new RangeError(`Invalid local time parts: ${JSON.stringify(parts)}`);
  }
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
};

export const isLocalDate = (value: string): boolean => {
  return parseLocalDate(value) !== undefined;
};

export const isLocalTime = (value: string): boolean => {
  return parseLocalTime(value) !== undefined;
};

export const isValidDateSpec = (spec: DateSpec): boolean => {
  return isLocalDate(spec.date) && (spec.time === undefined || isLocalTime(spec.time));
};

export const sameDateSpec = (a: DateSpec, b: DateSpec): boolean => {
  return a.date === b.date && (a.time ?? null) === (b.time ?? null);
};
