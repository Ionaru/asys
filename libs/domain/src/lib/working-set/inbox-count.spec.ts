// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aReviewItem, aState, aTask } from '../../test/builders';
import { TaskStatus } from '../task';
import { inboxCount } from './inbox-count';

describe('inboxCount', () => {
  it('is 0 for an empty state', () => {
    expect(inboxCount(aState())).toBe(0);
  });

  it('counts inbox Tasks and unresolved Review items', () => {
    const state = aState({
      tasks: [
        aTask({ id: 'A', important: null }),
        aTask({ id: 'B', estimateMinutes: null }),
        aTask({ id: 'C', important: true, estimateMinutes: 30 }),
        aTask({ id: 'D', status: TaskStatus.Delegated, important: null }),
      ],
      reviewItems: [aReviewItem({ id: 'R1' }), aReviewItem({ id: 'R2' })],
    });

    expect(inboxCount(state)).toBe(4);
  });

  it('does not count a resolved Review item', () => {
    const state = aState({
      reviewItems: [aReviewItem({ id: 'R1', resolvedAt: 5 }), aReviewItem({ id: 'R2' })],
    });

    expect(inboxCount(state)).toBe(1);
  });

  it('does not count Tasks that are fully triaged', () => {
    const state = aState({
      tasks: [aTask({ id: 'A', important: false, estimateMinutes: 15 })],
    });

    expect(inboxCount(state)).toBe(0);
  });
});
