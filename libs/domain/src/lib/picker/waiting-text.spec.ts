// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aTask } from '../../test/builders';
import { BlockedReasonTag } from '../task/blocked';
import type { Task } from '../task';
import { ExclusionReasonTag, type ExclusionReason } from './picker';
import { waitingText } from './waiting-text';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

// Local Sunday 2026-10-04 10:00 in Amsterdam.
const NOW = at('2026-10-04T08:00:00.000Z');

const notYetAvailable = (iso: string): ExclusionReason => {
  return { _tag: ExclusionReasonTag.NotYetAvailable, from: at(iso) };
};

const blockedBy = (...taskIds: string[]): ExclusionReason => {
  return { _tag: BlockedReasonTag.BlockedBy, taskIds };
};

const blocker = (id: string, title: string): Task => aTask({ id, title });

const text = (
  task: Task,
  reasons: readonly ExclusionReason[],
  tasks: readonly Task[] = [],
): string => waitingText(task, reasons, tasks, NOW, AMS);

describe('waitingText for NotYetAvailable', () => {
  it('says Available from with the weekday and date for a date-only availableFrom', () => {
    const task = aTask({ id: 't', availableFrom: { date: '2026-10-06' } });
    expect(text(task, [notYetAvailable('2026-10-05T22:00:00.000Z')])).toBe(
      'Available from Tue 6 Oct',
    );
  });

  it('says Available from with the day and time for an availableFrom with a time', () => {
    const task = aTask({ id: 't', availableFrom: { date: '2026-10-05', time: '09:00' } });
    expect(text(task, [notYetAvailable('2026-10-05T07:00:00.000Z')])).toBe(
      'Available from tomorrow 09:00',
    );
  });

  it('formats the reason instant when the Task has no availableFrom', () => {
    const task = aTask({ id: 't', availableFrom: null });
    expect(text(task, [notYetAvailable('2026-10-05T07:00:00.000Z')])).toBe(
      'Available from tomorrow 09:00',
    );
  });
});

describe('waitingText for BlockedBy', () => {
  const task = aTask({ id: 'blocked' });

  it('names one blocker', () => {
    const tasks = [blocker('b1', 'Order card')];
    expect(text(task, [blockedBy('b1')], tasks)).toBe('Blocked by Order card');
  });

  it('names two blockers ordered by title, not by id', () => {
    const tasks = [blocker('x2', 'A'), blocker('x1', 'B')];
    expect(text(task, [blockedBy('x1', 'x2')], tasks)).toBe('Blocked by A and B');
  });

  it('names the first by title and counts the rest for three blockers', () => {
    const tasks = [blocker('1', 'C'), blocker('2', 'A'), blocker('3', 'B')];
    expect(text(task, [blockedBy('1', '2', '3')], tasks)).toBe('Blocked by A and 2 more');
  });

  it('counts the rest for four blockers', () => {
    const tasks = [blocker('1', 'D'), blocker('2', 'C'), blocker('3', 'B'), blocker('4', 'A')];
    expect(text(task, [blockedBy('1', '2', '3', '4')], tasks)).toBe('Blocked by A and 3 more');
  });

  it('orders titles by code unit, so an upper-case title precedes its lower-case twin', () => {
    const tasks = [blocker('1', 'b'), blocker('2', 'B')];
    expect(text(task, [blockedBy('1', '2')], tasks)).toBe('Blocked by B and b');
  });

  it('names equal titles twice, ordered by id', () => {
    const tasks = [blocker('z', 'Same'), blocker('a', 'Same')];
    expect(text(task, [blockedBy('z', 'a')], tasks)).toBe('Blocked by Same and Same');
  });

  it('leaves out ids that are not in the Tasks', () => {
    const tasks = [blocker('b1', 'Order card')];
    expect(text(task, [blockedBy('b1', 'gone')], tasks)).toBe('Blocked by Order card');
  });

  it('ignores Tasks that are not listed in the reason', () => {
    const tasks = [blocker('b1', 'Order card'), blocker('other', 'Unrelated')];
    expect(text(task, [blockedBy('b1')], tasks)).toBe('Blocked by Order card');
  });

  it('says Waiting when none of the blockers is found', () => {
    expect(text(task, [blockedBy('gone', 'also-gone')], [blocker('b1', 'Order card')])).toBe(
      'Waiting',
    );
  });
});

describe('waitingText with several or unknown reasons', () => {
  it('joins the parts in the order of the reasons', () => {
    const task = aTask({ id: 't', availableFrom: { date: '2026-10-06' } });
    const tasks = [blocker('b1', 'Order card')];
    expect(text(task, [notYetAvailable('2026-10-05T22:00:00.000Z'), blockedBy('b1')], tasks)).toBe(
      'Available from Tue 6 Oct · Blocked by Order card',
    );
  });

  it('keeps the order of the reasons when BlockedBy comes first', () => {
    const task = aTask({ id: 't', availableFrom: { date: '2026-10-06' } });
    const tasks = [blocker('b1', 'Order card')];
    expect(text(task, [blockedBy('b1'), notYetAvailable('2026-10-05T22:00:00.000Z')], tasks)).toBe(
      'Blocked by Order card · Available from Tue 6 Oct',
    );
  });

  it('ignores an unknown reason tag without throwing', () => {
    const task = aTask({ id: 't' });
    const unknown = { _tag: 'Voice' } as unknown as ExclusionReason;
    expect(text(task, [unknown])).toBe('Waiting');
  });

  it('keeps the known parts next to an unknown reason tag', () => {
    const task = aTask({ id: 't' });
    const unknown = { _tag: 'Voice' } as unknown as ExclusionReason;
    expect(text(task, [unknown, blockedBy('b1')], [blocker('b1', 'Order card')])).toBe(
      'Blocked by Order card',
    );
  });

  it('says Waiting without reasons', () => {
    expect(text(aTask({ id: 't' }), [])).toBe('Waiting');
  });
});
