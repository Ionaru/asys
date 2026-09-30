// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, aTask } from '../../test/builders';
import { isAvailable } from './available';
import { TaskStatus } from './task';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

const NOW = at('2026-10-01T10:00:00.000Z');

describe('isAvailable', () => {
  it('is true for an open, triaged Task without availableFrom', () => {
    expect(isAvailable(aTask({ id: 'X' }), [], [], NOW, AMS)).toBe(true);
  });

  describe('availableFrom with a time', () => {
    const x = aTask({ id: 'X', availableFrom: { date: '2026-10-15', time: '08:00' } });

    it('is true at the exact local time', () => {
      expect(isAvailable(x, [], [], at('2026-10-15T06:00:00.000Z'), AMS)).toBe(true);
    });

    it('is false one millisecond before', () => {
      expect(isAvailable(x, [], [], at('2026-10-15T05:59:59.999Z'), AMS)).toBe(false);
    });
  });

  describe('availableFrom without a time', () => {
    const x = aTask({ id: 'X', availableFrom: { date: '2026-10-15' } });

    it('is true at local midnight', () => {
      expect(isAvailable(x, [], [], at('2026-10-14T22:00:00.000Z'), AMS)).toBe(true);
    });

    it('is false one millisecond before local midnight', () => {
      expect(isAvailable(x, [], [], at('2026-10-14T21:59:59.999Z'), AMS)).toBe(false);
    });
  });

  it('is false for a Task in the Inbox', () => {
    expect(isAvailable(aTask({ id: 'X', important: null }), [], [], NOW, AMS)).toBe(false);
  });

  it('is false for a Task without an estimate', () => {
    expect(isAvailable(aTask({ id: 'X', estimateMinutes: null }), [], [], NOW, AMS)).toBe(false);
  });

  it.each([TaskStatus.Delegated, TaskStatus.Done, TaskStatus.Dropped, TaskStatus.Skipped] as const)(
    'is false for a %s Task',
    (status) => {
      expect(isAvailable(aTask({ id: 'X', status }), [], [], NOW, AMS)).toBe(false);
    },
  );

  it('is false when blocked by an open Task', () => {
    const tasks = [aTask({ id: 'A', status: TaskStatus.Open })];
    expect(isAvailable(aTask({ id: 'X' }), tasks, [aLink('X', 'A')], NOW, AMS)).toBe(false);
  });

  it('is false when blocked by a delegated Task', () => {
    const tasks = [aTask({ id: 'A', status: TaskStatus.Delegated })];
    expect(isAvailable(aTask({ id: 'X' }), tasks, [aLink('X', 'A')], NOW, AMS)).toBe(false);
  });

  it('is true once the blocker is done', () => {
    const tasks = [aTask({ id: 'A', status: TaskStatus.Done })];
    expect(isAvailable(aTask({ id: 'X' }), tasks, [aLink('X', 'A')], NOW, AMS)).toBe(true);
  });
});
