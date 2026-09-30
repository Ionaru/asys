// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aTask } from '../../test/builders';
import { isInInbox } from './inbox';
import { TaskStatus } from './task';

describe('isInInbox', () => {
  it('is true for an open Task without importance', () => {
    expect(isInInbox(aTask({ id: 'X', important: null, estimateMinutes: 30 }))).toBe(true);
  });

  it('is true for an open Task without an estimate', () => {
    expect(isInInbox(aTask({ id: 'X', important: true, estimateMinutes: null }))).toBe(true);
  });

  it('is true for an open Task with neither importance nor estimate', () => {
    expect(isInInbox(aTask({ id: 'X', important: null, estimateMinutes: null }))).toBe(true);
  });

  it('is false for an open Task with importance false and an estimate', () => {
    expect(isInInbox(aTask({ id: 'X', important: false, estimateMinutes: 30 }))).toBe(false);
  });

  it('is false for an open Task with both set', () => {
    expect(isInInbox(aTask({ id: 'X', important: true, estimateMinutes: 30 }))).toBe(false);
  });

  it.each([TaskStatus.Done, TaskStatus.Delegated, TaskStatus.Dropped, TaskStatus.Skipped] as const)(
    'is false for a %s Task with both null',
    (status) => {
      expect(isInInbox(aTask({ id: 'X', status, important: null, estimateMinutes: null }))).toBe(
        false,
      );
    },
  );
});
