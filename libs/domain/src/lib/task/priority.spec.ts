// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, aTask } from '../../test/builders';
import type { Settings } from '../settings';
import { isUrgent, quadrant, Quadrant } from './priority';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

const settings: Settings = { timeZone: AMS, urgencyWindowDays: 2 };

describe('isUrgent', () => {
  const x = aTask({ id: 'X', due: { date: '2026-10-16', time: '10:00' }, estimateMinutes: null });

  it('is true when the latest start equals the end of the window', () => {
    expect(isUrgent(x, [x], [], at('2026-10-14T08:00:00.000Z'), settings)).toBe(true);
  });

  it('is false one millisecond before the latest start enters the window', () => {
    expect(isUrgent(x, [x], [], at('2026-10-14T07:59:59.999Z'), settings)).toBe(false);
  });

  it('measures the window in calendar days across a DST change', () => {
    const y = aTask({
      id: 'Y',
      due: { date: '2026-10-26', time: '10:00' },
      estimateMinutes: null,
    });
    // two calendar days after 10:00 CEST is 10:00 CET (09:00Z); a flat 48 h would end at 08:00Z
    expect(isUrgent(y, [y], [], at('2026-10-24T08:00:00.000Z'), settings)).toBe(true);
  });

  it('is true when the latest start is in the past', () => {
    expect(isUrgent(x, [x], [], at('2026-11-01T00:00:00.000Z'), settings)).toBe(true);
  });

  it('is false without a due and without dependents', () => {
    const y = aTask({ id: 'Y' });
    expect(isUrgent(y, [y], [], at('2026-10-14T08:00:00.000Z'), settings)).toBe(false);
  });

  it('follows the urgency window setting', () => {
    const narrow: Settings = { timeZone: AMS, urgencyWindowDays: 1 };
    expect(isUrgent(x, [x], [], at('2026-10-14T08:00:00.000Z'), narrow)).toBe(false);
  });

  it('subtracts the estimate from the due', () => {
    const y = aTask({
      id: 'Y',
      due: { date: '2026-10-16', time: '10:00' },
      estimateMinutes: 60,
    });
    expect(isUrgent(y, [y], [], at('2026-10-14T07:00:00.000Z'), settings)).toBe(true);
    expect(isUrgent(y, [y], [], at('2026-10-14T06:59:59.999Z'), settings)).toBe(false);
  });

  it('is urgent through a dependent with a near deadline', () => {
    const blocker = aTask({ id: 'B', due: null });
    const dependent = aTask({
      id: 'D',
      due: { date: '2026-10-16', time: '10:00' },
      estimateMinutes: null,
    });
    const links = [aLink('D', 'B')];
    expect(
      isUrgent(blocker, [blocker, dependent], links, at('2026-10-14T08:00:00.000Z'), settings),
    ).toBe(true);
  });
});

describe('quadrant', () => {
  it.each([
    [true, true, Quadrant.Do],
    [true, false, Quadrant.Plan],
    [false, true, Quadrant.Delegate],
    [false, false, Quadrant.Drop],
  ] as const)('maps important %s and urgent %s to %s', (important, urgent, expected) => {
    expect(quadrant(important, urgent)).toBe(expected);
  });
});
