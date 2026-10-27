// SPDX-License-Identifier: EUPL-1.2
import { blockerSummary } from './blocker-summary';

describe('blockerSummary', () => {
  it('says nothing waits either way', () => {
    expect(blockerSummary([], 0)).toBe('Waits for no other Task. No Task waits for this one.');
  });

  it('names one blocker', () => {
    expect(blockerSummary(['Bravo task'], 0)).toBe(
      'Waits for Bravo task. No Task waits for this one.',
    );
  });

  it('names two blockers in the order given', () => {
    expect(blockerSummary(['Alpha', 'Bravo'], 0)).toBe(
      'Waits for Alpha and Bravo. No Task waits for this one.',
    );
  });

  it('counts the rest from three blockers', () => {
    expect(blockerSummary(['Alpha', 'Bravo', 'Charlie'], 0)).toBe(
      'Waits for Alpha and 2 more. No Task waits for this one.',
    );
    expect(blockerSummary(['Alpha', 'B', 'C', 'D', 'E'], 0)).toBe(
      'Waits for Alpha and 4 more. No Task waits for this one.',
    );
  });

  it('counts the dependants', () => {
    expect(blockerSummary(['Order card'], 1)).toBe(
      'Waits for Order card. 1 Task waits for this one.',
    );
    expect(blockerSummary(['Order card'], 2)).toBe(
      'Waits for Order card. 2 Tasks wait for this one.',
    );
    expect(blockerSummary([], 5)).toBe('Waits for no other Task. 5 Tasks wait for this one.');
  });
});
