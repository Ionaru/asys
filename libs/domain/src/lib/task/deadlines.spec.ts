// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, aTask } from '../../test/builders';
import type { DateSpec } from '../time';
import { pick } from '../picker';
import { effectiveDue, isOverdue, latestStart } from './deadlines';
import { type Task, TaskStatus } from './task';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

describe('isOverdue', () => {
  const due: DateSpec = { date: '2026-10-16', time: '10:00' };

  it('is false at the due instant', () => {
    expect(isOverdue(aTask({ id: 'X', due }), at('2026-10-16T08:00:00.000Z'), AMS)).toBe(false);
  });

  it('is true one millisecond after the due instant', () => {
    expect(isOverdue(aTask({ id: 'X', due }), at('2026-10-16T08:00:00.001Z'), AMS)).toBe(true);
  });

  it('is true for a delegated Task past its due', () => {
    const x = aTask({ id: 'X', status: TaskStatus.Delegated, due });
    expect(isOverdue(x, at('2026-10-16T08:00:00.001Z'), AMS)).toBe(true);
  });

  describe('date-only due', () => {
    const x = aTask({ id: 'X', status: TaskStatus.Delegated, due: { date: '2026-12-15' } });

    it('is false until the end of the local day', () => {
      expect(isOverdue(x, at('2026-12-15T22:59:59.999Z'), AMS)).toBe(false);
    });

    it('is true at the start of the next local day', () => {
      expect(isOverdue(x, at('2026-12-15T23:00:00.000Z'), AMS)).toBe(true);
    });
  });

  it.each([TaskStatus.Done, TaskStatus.Dropped, TaskStatus.Skipped] as const)(
    'is false for a %s Task with a past due',
    (status) => {
      expect(isOverdue(aTask({ id: 'X', status, due }), at('2027-01-01T00:00:00.000Z'), AMS)).toBe(
        false,
      );
    },
  );

  it('is false without a due', () => {
    expect(isOverdue(aTask({ id: 'X' }), at('2027-01-01T00:00:00.000Z'), AMS)).toBe(false);
  });
});

describe('effectiveDue and latestStart', () => {
  const chain = (
    overrides: Partial<Record<'design' | 'order' | 'sig' | 'send', Partial<Task>>> = {},
  ): { tasks: Task[]; links: ReturnType<typeof aLink>[] } => ({
    tasks: [
      aTask({
        id: 'design',
        status: TaskStatus.Delegated,
        due: { date: '2026-10-19', time: '17:00' },
        estimateMinutes: 20,
        ...overrides.design,
      }),
      aTask({
        id: 'order',
        due: { date: '2026-10-22', time: '17:00' },
        estimateMinutes: 15,
        ...overrides.order,
      }),
      aTask({
        id: 'sig',
        due: { date: '2026-10-27', time: '17:00' },
        estimateMinutes: 5,
        ...overrides.sig,
      }),
      aTask({
        id: 'send',
        due: { date: '2026-10-29', time: '17:00' },
        estimateMinutes: 10,
        ...overrides.send,
      }),
    ],
    links: [aLink('order', 'design'), aLink('sig', 'order'), aLink('send', 'sig')],
  });
  const get = (tasks: Task[], id: string): Task => {
    const found = tasks.find((t) => t.id === id);
    if (found === undefined) {
      throw new Error(`no Task ${id} in the chain`);
    }
    return found;
  };
  const due = (overrides: Parameters<typeof chain>[0], id: string) => {
    const { tasks, links } = chain(overrides);
    return effectiveDue(get(tasks, id), tasks, links, AMS);
  };

  it('uses the own due when every dependent is later', () => {
    expect(due({}, 'design')).toBe(at('2026-10-19T15:00:00.000Z'));
  });

  it('computes the latest start from the effective due and the estimate', () => {
    const { tasks, links } = chain();
    expect(latestStart(get(tasks, 'design'), tasks, links, AMS)).toBe(
      at('2026-10-19T14:40:00.000Z'),
    );
  });

  it('is pulled earlier by a dependent with an earlier latest start', () => {
    expect(due({ order: { due: { date: '2026-10-19', time: '12:00' } } }, 'design')).toBe(
      at('2026-10-19T09:45:00.000Z'),
    );
  });

  it('propagates a deadline down the whole chain', () => {
    const overrides = { send: { due: { date: '2026-10-19', time: '12:00' } } };
    expect(due(overrides, 'sig')).toBe(at('2026-10-19T09:50:00.000Z'));
    expect(due(overrides, 'order')).toBe(at('2026-10-19T09:45:00.000Z'));
    expect(due(overrides, 'design')).toBe(at('2026-10-19T09:30:00.000Z'));
  });

  it.each([
    TaskStatus.Done,
    TaskStatus.Dropped,
    TaskStatus.Skipped,
  ] as const satisfies readonly TaskStatus[])('ignores a %s dependent', (status) => {
    const order = { status, due: { date: '2026-10-19', time: '12:00' } };
    expect(due({ order }, 'design')).toBe(at('2026-10-19T15:00:00.000Z'));
  });

  it('ignores a dependent that is missing from the list', () => {
    const { tasks, links } = chain();
    const without = tasks.filter((t) => t.id !== 'order');
    expect(effectiveDue(get(tasks, 'design'), without, links, AMS)).toBe(
      at('2026-10-19T15:00:00.000Z'),
    );
  });

  it('counts a delegated dependent', () => {
    const order = { status: TaskStatus.Delegated, due: { date: '2026-10-19', time: '12:00' } };
    expect(due({ order }, 'design')).toBe(at('2026-10-19T09:45:00.000Z'));
  });

  it('takes the deadline from a dependent when the Task has no due of its own', () => {
    const x = aTask({ id: 'X', due: null });
    const y = aTask({
      id: 'Y',
      due: { date: '2026-10-19', time: '12:00' },
      estimateMinutes: 15,
    });
    expect(effectiveDue(x, [x, y], [aLink('Y', 'X')], AMS)).toBe(at('2026-10-19T09:45:00.000Z'));
  });

  describe('several dependents', () => {
    const X = aTask({ id: 'X', due: null });
    const late = aTask({
      id: 'late',
      due: { date: '2026-10-22', time: '17:00' },
      estimateMinutes: 15,
    });

    it('takes the earliest Latest start among direct dependents, listed later-first', () => {
      const soon = aTask({
        id: 'soon',
        due: { date: '2026-10-19', time: '12:00' },
        estimateMinutes: 15,
      });
      const links = [aLink('late', 'X'), aLink('soon', 'X')];
      expect(effectiveDue(X, [X, late, soon], links, AMS)).toBe(at('2026-10-19T09:45:00.000Z'));
    });

    it('takes the earliest Latest start when it comes through a second level', () => {
      const mid = aTask({ id: 'mid', due: null, estimateMinutes: 5 });
      const deep = aTask({
        id: 'deep',
        due: { date: '2026-10-19', time: '12:00' },
        estimateMinutes: 15,
      });
      const links = [aLink('late', 'X'), aLink('mid', 'X'), aLink('deep', 'mid')];
      expect(effectiveDue(X, [X, late, mid, deep], links, AMS)).toBe(
        at('2026-10-19T09:40:00.000Z'),
      );
    });
  });

  it('is null without a due and without dependents', () => {
    const x = aTask({ id: 'X', due: null });
    expect(effectiveDue(x, [x], [], AMS)).toBeNull();
    expect(latestStart(x, [x], [], AMS)).toBeNull();
  });

  it('counts a missing estimate as zero minutes', () => {
    const x = aTask({ id: 'X', due: { date: '2026-10-19', time: '12:00' }, estimateMinutes: null });
    expect(latestStart(x, [x], [], AMS)).toBe(at('2026-10-19T10:00:00.000Z'));
  });

  it('ignores the status of the subject Task itself', () => {
    const x = aTask({
      id: 'X',
      status: TaskStatus.Done,
      due: { date: '2026-10-19', time: '12:00' },
    });
    expect(effectiveDue(x, [], [], AMS)).toBe(at('2026-10-19T10:00:00.000Z'));
  });

  describe('a cycle', () => {
    const A = aTask({ id: 'A', due: { date: '2026-10-20', time: '17:00' }, estimateMinutes: null });
    const B = aTask({ id: 'B', due: { date: '2026-10-19', time: '17:00' }, estimateMinutes: 30 });
    const links = [aLink('B', 'A'), aLink('A', 'B')];

    it('terminates and uses the other Task once for A', () => {
      expect(effectiveDue(A, [A, B], links, AMS)).toBe(at('2026-10-19T14:30:00.000Z'));
    });

    it('terminates and keeps the own due for B', () => {
      expect(effectiveDue(B, [A, B], links, AMS)).toBe(at('2026-10-19T15:00:00.000Z'));
    });
  });
});

describe('converging graphs', () => {
  const pad = (n: number) => String(n).padStart(2, '0');

  it('computes the Latest start on a triangular graph of 40 Tasks in under two seconds', () => {
    const tasks = Array.from({ length: 40 }, (_unused, i) =>
      aTask({
        id: `t${pad(i)}`,
        estimateMinutes: 10,
        due: i === 39 ? { date: '2026-10-30', time: '17:00' } : null,
      }),
    );
    const links = tasks.flatMap((later, j) =>
      tasks.slice(0, j).map((earlier) => aLink(later.id, earlier.id)),
    );
    const first = tasks[0];
    if (first === undefined) {
      throw new Error('no first Task');
    }

    const started = performance.now();
    const result = latestStart(first, tasks, links, AMS);
    const elapsed = performance.now() - started;

    // the longest chain t00 to t39 subtracts all 40 estimates
    expect(result).toBe(at('2026-10-30T16:00:00.000Z') - 40 * 10 * 60_000);
    expect(elapsed).toBeLessThan(2000);
  });

  it('picks over 12 stacked diamonds in under two seconds and ranks only the first layer', () => {
    const layers = Array.from({ length: 12 }, (_unused, k) =>
      ['a', 'b'].map((side) =>
        aTask({
          id: `l${pad(k)}${side}`,
          estimateMinutes: 10,
          important: true,
          due: k === 11 ? { date: '2026-10-30', time: '17:00' } : null,
        }),
      ),
    );
    const tasks = layers.flat();
    const links = layers.flatMap((layer, k) =>
      (layers[k + 1] ?? []).flatMap((next) => layer.map((blocker) => aLink(next.id, blocker.id))),
    );

    const started = performance.now();
    const result = pick(
      tasks,
      links,
      [],
      { timeZone: AMS, urgencyWindowDays: 2 },
      at('2026-10-14T08:00:00.000Z'),
    );
    const elapsed = performance.now() - started;

    expect(result.ranked.map((entry) => entry.task.id)).toEqual(['l00a', 'l00b']);
    expect(result.waiting).toHaveLength(22);
    expect(elapsed).toBeLessThan(2000);
  });
});
