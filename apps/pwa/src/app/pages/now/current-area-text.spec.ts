// SPDX-License-Identifier: EUPL-1.2
import type { Instant } from '@asys/domain';

import {
  areaNamesText,
  BACK_TO_AUTOMATIC,
  NO_AREA_IN_USE,
  otherAreaText,
  pickedStatusText,
} from './current-area-text';

const ZONE = 'Europe/Amsterdam';

const WORK = { id: 'w', name: 'Work' };

const PERSONAL = { id: 'p', name: 'Personal' };

const AREAS = [WORK, PERSONAL];

describe('current area text', () => {
  it('names the two fixed texts', () => {
    expect(NO_AREA_IN_USE).toBe('No Area in use');
    expect(BACK_TO_AUTOMATIC).toBe('Back to Automatic');
  });

  describe('areaNamesText', () => {
    it('orders the names and joins them with a plus', () => {
      expect(areaNamesText(['w', 'p'], AREAS)).toBe('Personal + Work');
    });

    it('reads one name alone', () => {
      expect(areaNamesText(['w'], AREAS)).toBe('Work');
    });

    it('reads No Area in use for no ids', () => {
      expect(areaNamesText([], AREAS)).toBe('No Area in use');
    });

    it('reads No Area in use when every id is unknown', () => {
      expect(areaNamesText(['gone'], AREAS)).toBe('No Area in use');
    });

    it('skips an unknown id beside a known one', () => {
      expect(areaNamesText(['gone', 'p'], AREAS)).toBe('Personal');
    });

    it('orders equal names by id', () => {
      const twins = [
        { id: 'b', name: 'Home' },
        { id: 'a', name: 'Home' },
      ];

      expect(areaNamesText(['b', 'a'], twins)).toBe('Home + Home');
    });

    it('orders by UTF-16 code unit, so a capital comes before a lower-case name', () => {
      const mixed = [
        { id: 'x', name: 'errands' },
        { id: 'y', name: 'Work' },
      ];

      expect(areaNamesText(['x', 'y'], mixed)).toBe('Work + errands');
    });
  });

  describe('otherAreaText', () => {
    it('adds the Overdue count when some are Overdue', () => {
      expect(otherAreaText('Work', 4, 1)).toBe('Work 4 (1 Overdue)');
    });

    it('reads only the count when none is Overdue', () => {
      expect(otherAreaText('Work', 1, 0)).toBe('Work 1');
    });

    it('adds the Overdue count when all are Overdue', () => {
      expect(otherAreaText('Work', 2, 2)).toBe('Work 2 (2 Overdue)');
    });
  });

  describe('pickedStatusText', () => {
    it('reads midnight when the pick ends at the start of the next local day', () => {
      // Saturday 10 October 2026, 09:00 in Amsterdam; the pick ends at Sunday 00:00.
      const now = Date.parse('2026-10-10T07:00:00.000Z') as Instant;
      const endsAt = Date.parse('2026-10-10T22:00:00.000Z') as Instant;

      expect(pickedStatusText('Work', endsAt, now, ZONE)).toBe('Work picked until midnight');
    });

    it('reads the clock time when the pick ends later the same day', () => {
      // Monday 12 October 2026, 07:30 in Amsterdam; the pick ends at 18:00.
      const now = Date.parse('2026-10-12T05:30:00.000Z') as Instant;
      const endsAt = Date.parse('2026-10-12T16:00:00.000Z') as Instant;

      expect(pickedStatusText('Personal', endsAt, now, ZONE)).toBe('Personal picked until 18:00');
    });

    it('reads midnight by the local day of the zone, not the UTC day', () => {
      // Saturday 23:30 in Amsterdam is 21:30 UTC; the next local midnight is 22:00 UTC.
      const now = Date.parse('2026-10-10T21:30:00.000Z') as Instant;
      const endsAt = Date.parse('2026-10-10T22:00:00.000Z') as Instant;

      expect(pickedStatusText('Work', endsAt, now, ZONE)).toBe('Work picked until midnight');
    });
  });
});
