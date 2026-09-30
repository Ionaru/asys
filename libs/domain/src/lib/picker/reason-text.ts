// SPDX-License-Identifier: MPL-2.0

import { toLocalDateTime, type TimeZone } from '../time';
import { Quadrant } from '../task';
import type { Reason } from './picker';

const QUADRANT_LABELS: Readonly<Record<Quadrant, string>> = {
  [Quadrant.Do]: 'Do',
  [Quadrant.Plan]: 'Plan',
  [Quadrant.Delegate]: 'Delegate',
  [Quadrant.Drop]: 'Drop',
};

export const reasonText = (reason: Reason, timeZone: TimeZone): string => {
  const parts: string[] = [];
  if (reason.overdue) parts.push('Overdue');
  parts.push(QUADRANT_LABELS[reason.quadrant]);
  if (reason.latestStart !== null) {
    const { date, time } = toLocalDateTime(reason.latestStart, timeZone);
    parts.push(`start by ${date} ${time}`);
  }
  return parts.join(' · ');
};
