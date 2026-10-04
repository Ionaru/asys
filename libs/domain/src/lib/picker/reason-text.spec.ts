// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aTask } from '../../test/builders';
import { Quadrant } from '../task/priority';
import type { Reason } from './picker';
import { reasonText } from './reason-text';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

// Local Sunday 2026-10-04 10:00 in Amsterdam.
const NOW = at('2026-10-04T08:00:00.000Z');

const reasonOf = (overrides: Partial<Reason> = {}): Reason => {
  return {
    overdue: false,
    quadrant: Quadrant.Plan,
    urgent: false,
    latestStart: null,
    ...overrides,
  };
};

describe('reasonText of an overdue Task', () => {
  it('says Due with the day and time, then important', () => {
    const task = aTask({ id: 't', important: true, due: { date: '2026-10-03', time: '17:00' } });
    expect(reasonText(task, reasonOf({ overdue: true }), NOW, AMS)).toBe(
      'Due yesterday 17:00 · important',
    );
  });

  it('says Due with the day only for a date-only due', () => {
    const task = aTask({ id: 't', important: false, due: { date: '2026-10-03' } });
    expect(reasonText(task, reasonOf({ overdue: true }), NOW, AMS)).toBe('Due yesterday');
  });

  it('says Due with the weekday and date for an older due', () => {
    const task = aTask({ id: 't', important: false, due: { date: '2026-10-01', time: '08:00' } });
    expect(reasonText(task, reasonOf({ overdue: true }), NOW, AMS)).toBe('Due Thu 1 Oct 08:00');
  });

  it('prefers Due over the latest start', () => {
    const task = aTask({ id: 't', important: false, due: { date: '2026-10-03', time: '17:00' } });
    const reason = reasonOf({ overdue: true, latestStart: at('2026-10-04T12:30:00.000Z') });
    expect(reasonText(task, reason, NOW, AMS)).toBe('Due yesterday 17:00');
  });

  it('falls back to the latest start when the Task has no due', () => {
    const task = aTask({ id: 't', important: false, due: null });
    const reason = reasonOf({ overdue: true, latestStart: at('2026-10-04T12:30:00.000Z') });
    expect(reasonText(task, reason, NOW, AMS)).toBe('Latest start 14:30');
  });
});

describe('reasonText of a Task that is not overdue', () => {
  it('says Latest start with the clock time for today', () => {
    const task = aTask({ id: 't', important: false });
    const reason = reasonOf({ latestStart: at('2026-10-04T12:30:00.000Z') });
    expect(reasonText(task, reason, NOW, AMS)).toBe('Latest start 14:30');
  });

  it('says Latest start with the weekday and date for a later day, then important', () => {
    const task = aTask({ id: 't', important: true });
    const reason = reasonOf({ latestStart: at('2026-10-10T12:30:00.000Z') });
    expect(reasonText(task, reason, NOW, AMS)).toBe('Latest start Sat 10 Oct 14:30 · important');
  });

  it('says Latest start yesterday for a latest start in the past', () => {
    const task = aTask({ id: 't', important: false });
    const reason = reasonOf({ latestStart: at('2026-10-03T12:00:00.000Z') });
    expect(reasonText(task, reason, NOW, AMS)).toBe('Latest start yesterday 14:00');
  });

  it('says No Due without a latest start, then important', () => {
    const task = aTask({ id: 't', important: true });
    expect(reasonText(task, reasonOf(), NOW, AMS)).toBe('No Due · important');
  });

  it('says only No Due for a Task that is not important', () => {
    const task = aTask({ id: 't', important: false });
    expect(reasonText(task, reasonOf(), NOW, AMS)).toBe('No Due');
  });
});

describe('reasonText ignores quadrant and urgent', () => {
  it.each([Quadrant.Do, Quadrant.Plan, Quadrant.Delegate, Quadrant.Drop])(
    'gives the same text for the %s quadrant',
    (quadrant) => {
      const task = aTask({ id: 't', important: true });
      const reason = reasonOf({
        quadrant,
        urgent: quadrant === Quadrant.Do || quadrant === Quadrant.Delegate,
        latestStart: at('2026-10-04T12:30:00.000Z'),
      });
      expect(reasonText(task, reason, NOW, AMS)).toBe('Latest start 14:30 · important');
    },
  );
});
