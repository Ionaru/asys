// SPDX-License-Identifier: EUPL-1.2

import type { test as baseTest } from '@playwright/test';

export const E2E_ZONE = 'Europe/Amsterdam';

const ZONE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: E2E_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAYS: Readonly<Record<string, number>> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const zoneParts = (now: Date): Record<string, string> => {
  const parts: Record<string, string> = {};
  for (const part of ZONE_PARTS.formatToParts(now)) parts[part.type] = part.value;
  return parts;
};

/** Today's date, ISO weekday (1 = Monday .. 7 = Sunday) and hour in E2E_ZONE. */
export const localToday = (
  now: Date = new Date(),
): { date: string; isoWeekday: number; hour: number } => {
  const parts = zoneParts(now);
  return {
    date: `${parts['year']}-${parts['month']}-${parts['day']}`,
    isoWeekday: WEEKDAYS[parts['weekday']],
    hour: Number(parts['hour']),
  };
};

/** Adds whole days to a `YYYY-MM-DD` date. */
export const addDays = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const MONTH_NAMES = [
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
] as const;

/** How the app shows a date more than one day from today: 'Sat 10 Oct', with the year when it differs from today's. */
export const dayLabel = (date: string, today: string): string => {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = DAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const text = `${weekday} ${day} ${MONTH_NAMES[month - 1]}`;
  return year === Number(today.slice(0, 4)) ? text : `${text} ${year}`;
};

/** Skips the test within 30 minutes of local midnight, when "today" can flip while it runs. */
export const skipNearMidnight = (test: typeof baseTest): void => {
  const parts = zoneParts(new Date());
  const minutes = Number(parts['hour']) * 60 + Number(parts['minute']);
  test.skip(minutes >= 23 * 60 + 30 || minutes <= 30, 'within 30 min of local midnight');
};
