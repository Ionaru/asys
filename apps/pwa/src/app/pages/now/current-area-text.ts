// SPDX-License-Identifier: EUPL-1.2
import {
  formatClock,
  type Instant,
  localMinuteInstant,
  type TimeZone,
  toLocalDateTime,
} from '@asys/domain';

import { byAreaName } from '../../core/data/area-order';

/** The text for no Area at all. */
export const NO_AREA_IN_USE = 'No Area in use';

/** The status line after Automatic is chosen. */
export const BACK_TO_AUTOMATIC = 'Back to Automatic';

/** The names of the Areas with these ids, ordered by byAreaName and joined with ' + ', or NO_AREA_IN_USE. Unknown ids are skipped. */
export const areaNamesText = (
  ids: readonly string[],
  areas: readonly { readonly id: string; readonly name: string }[],
): string => {
  const names = areas
    .filter((area) => ids.includes(area.id))
    .toSorted(byAreaName)
    .map((area) => area.name);

  return names.length === 0 ? NO_AREA_IN_USE : names.join(' + ');
};

/** One entry of the Other Areas line: `Work 4`, or `Work 4 (1 Overdue)` when some are Overdue. */
export const otherAreaText = (name: string, count: number, overdue: number): string =>
  overdue > 0 ? `${name} ${count} (${overdue} Overdue)` : `${name} ${count}`;

/** The status line after a pick: `Work picked until midnight`, or `Personal picked until 18:00`. */
export const pickedStatusText = (
  name: string,
  endsAt: Instant,
  now: Instant,
  timeZone: TimeZone,
): string => {
  const midnight = localMinuteInstant(toLocalDateTime(now, timeZone).date, 1440, timeZone);

  return `${name} picked until ${endsAt === midnight ? 'midnight' : formatClock(endsAt, now, timeZone)}`;
};
