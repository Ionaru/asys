// SPDX-License-Identifier: MPL-2.0

import type { TimeZone } from '../time';

export interface Settings {
  readonly timeZone: TimeZone;
  readonly urgencyWindowDays: number;
}

export const DEFAULT_URGENCY_WINDOW_DAYS = 2;
