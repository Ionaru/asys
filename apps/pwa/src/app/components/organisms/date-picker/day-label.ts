// SPDX-License-Identifier: EUPL-1.2
import { formatDay, type LocalDate } from '@asys/domain';

/** A day relative to today with its first letter upper-cased: 'Today', 'Tomorrow', 'Mon 19 Oct'. */
export const dayLabel = (date: LocalDate, today: LocalDate): string => {
  const text = formatDay(date, today);
  return text.charAt(0).toUpperCase() + text.slice(1);
};
