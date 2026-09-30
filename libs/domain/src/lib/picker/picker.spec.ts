// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { seedAreas } from '../area';
import type { Settings } from '../settings';
import type { Task } from '../task';
import { aLink, aTask } from '../../test/builders';
import { pick, ExclusionReasonTag } from './picker';
import { BlockedReasonTag } from '../task/blocked';
import { Quadrant } from '../task/priority';
import { TaskStatus } from '../task/task';
import fc from 'fast-check';

const AMS = 'Europe/Amsterdam';

const SETTINGS: Settings = { timeZone: AMS, urgencyWindowDays: 2 };

const at = (iso: string) => Date.parse(iso);

const NOW = at('2026-10-14T08:00:00.000Z');

const ids = (list: readonly { readonly task: Task }[]) => list.map((entry) => entry.task.id);

const run = (tasks: readonly Task[], links = [] as ReturnType<typeof aLink>[], now = NOW) =>
  pick(tasks, links, [], SETTINGS, now);

describe('pick ranking', () => {
  it('ranks an overdue Task above a non-overdue do Task', () => {
    const late = aTask({
      id: 'late',
      important: false,
      due: { date: '2026-10-13', time: '17:00' },
      estimateMinutes: 10,
    });
    const big = aTask({
      id: 'big',
      important: true,
      due: { date: '2026-10-15', time: '12:00' },
      estimateMinutes: 30,
    });
    const result = run([big, late]);
    expect(ids(result.ranked)).toEqual(['late', 'big']);
    expect(result.ranked[0]?.reason.overdue).toBe(true);
    expect(result.ranked[0]?.reason.quadrant).toBe(Quadrant.Delegate);
  });

  it('orders quadrants do, plan, delegate, drop', () => {
    const x = aTask({ id: 'x', important: false, createdAt: 1 });
    const g = aTask({
      id: 'g',
      important: false,
      due: { date: '2026-10-15', time: '12:00' },
      createdAt: 2,
    });
    const p = aTask({
      id: 'p',
      important: true,
      due: { date: '2026-11-30', time: '12:00' },
      createdAt: 3,
    });
    const d = aTask({
      id: 'd',
      important: true,
      due: { date: '2026-10-15', time: '12:00' },
      createdAt: 4,
    });
    expect(ids(run([x, g, p, d]).ranked)).toEqual(['d', 'p', 'g', 'x']);
  });

  it('ranks the quadrant before the latest start', () => {
    const g = aTask({
      id: 'g',
      important: false,
      due: { date: '2026-10-15', time: '12:00' },
      estimateMinutes: 600,
    });
    const d = aTask({
      id: 'd',
      important: true,
      due: { date: '2026-10-15', time: '12:00' },
      estimateMinutes: 30,
    });
    const result = run([g, d]);
    expect(ids(result.ranked)).toEqual(['d', 'g']);
    expect(result.ranked[1]?.reason.latestStart).toBeLessThan(
      result.ranked[0]?.reason.latestStart ?? 0,
    );
  });

  it('ranks the earlier latest start first, and a Task without one last', () => {
    const none = aTask({ id: 'none', important: true, due: null, createdAt: 0 });
    const later = aTask({
      id: 'later',
      important: true,
      due: { date: '2026-11-30', time: '12:00' },
      createdAt: 1,
    });
    const sooner = aTask({
      id: 'sooner',
      important: true,
      due: { date: '2026-11-20', time: '12:00' },
      createdAt: 5,
    });
    const result = run([none, later, sooner]);
    expect(ids(result.ranked)).toEqual(['sooner', 'later', 'none']);
    expect(result.ranked[2]?.reason.latestStart).toBeNull();
    expect(result.ranked[2]?.reason.quadrant).toBe(Quadrant.Plan);
  });

  it('breaks a full tie by createdAt ascending', () => {
    const t1 = aTask({ id: 't1', important: false, createdAt: 2 });
    const t2 = aTask({ id: 't2', important: false, createdAt: 1 });
    expect(ids(run([t1, t2]).ranked)).toEqual(['t2', 't1']);
  });

  it('breaks an equal createdAt by id ascending', () => {
    const b = aTask({ id: 'b', important: false, createdAt: 1 });
    const a = aTask({ id: 'a', important: false, createdAt: 1 });
    expect(ids(run([b, a]).ranked)).toEqual(['a', 'b']);
  });

  it('compares ids by code unit, so an upper-case id precedes its lower-case twin', () => {
    const lower = aTask({ id: 'b', important: false, createdAt: 1 });
    const upper = aTask({ id: 'B', important: false, createdAt: 1 });
    expect(ids(run([lower, upper]).ranked)).toEqual(['B', 'b']);
  });

  it('does not depend on the input order', () => {
    const task = (i: number, due: number | null, createdAt: number, from: number | null) =>
      aTask({
        id: `t${i}`,
        important: i % 2 === 0,
        createdAt,
        due: due === null ? null : { date: `2026-11-${String(due).padStart(2, '0')}` },
        availableFrom: from === null ? null : { date: `2026-10-${String(from).padStart(2, '0')}` },
      });
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            due: fc.option(fc.integer({ min: 1, max: 28 }), { nil: null }),
            createdAt: fc.integer({ min: 0, max: 3 }),
            from: fc.option(fc.integer({ min: 15, max: 20 }), { nil: null }),
          }),
          { maxLength: 8 },
        ),
        (specs) => {
          const tasks = specs.map((s, i) => task(i, s.due, s.createdAt, s.from));
          const forward = run(tasks);
          const backward = run([...tasks].reverse());
          expect(ids(forward.ranked)).toEqual(ids(backward.ranked));
          expect(ids(forward.waiting)).toEqual(ids(backward.waiting));
        },
      ),
    );
  });
});

describe('pick along a blocker chain', () => {
  const chain = () => {
    const design = aTask({
      id: 'Design card image',
      important: true,
      due: { date: '2026-10-19', time: '17:00' },
      estimateMinutes: 20,
      createdAt: 1,
    });
    const order = aTask({
      id: 'Order card',
      due: { date: '2026-10-19', time: '12:00' },
      estimateMinutes: 15,
      createdAt: 2,
    });
    const signature = aTask({
      id: 'Get signature',
      due: { date: '2026-10-27', time: '17:00' },
      estimateMinutes: 5,
      createdAt: 3,
    });
    const send = aTask({
      id: 'Send card',
      due: { date: '2026-10-29', time: '17:00' },
      estimateMinutes: 10,
      createdAt: 4,
    });
    const other = aTask({
      id: 'other',
      important: true,
      due: { date: '2026-11-30', time: '12:00' },
      createdAt: 5,
    });
    const links = [
      aLink(order.id, design.id),
      aLink(signature.id, order.id),
      aLink(send.id, signature.id),
    ];
    return { tasks: [order, signature, send, other, design], links, design };
  };

  it('plans Design card image by the Latest start it inherits while the window is short', () => {
    const { tasks, links } = chain();
    const result = run(tasks, links, NOW);
    expect(ids(result.ranked)).toEqual(['Design card image', 'other']);
    expect(ids(result.waiting)).toEqual(['Order card', 'Get signature', 'Send card']);
    const entry = result.ranked[0];
    // 09:45Z from Order card, minus its own 20 minutes
    expect(entry?.reason.latestStart).toBe(at('2026-10-19T09:25:00.000Z'));
    expect(entry?.reason.urgent).toBe(false);
    expect(entry?.reason.quadrant).toBe(Quadrant.Plan);
    expect(result.ranked[1]?.reason.quadrant).toBe(Quadrant.Plan);
  });

  it('makes Design card image urgent once the window reaches the inherited Latest start', () => {
    const { tasks, links } = chain();
    const result = run(tasks, links, at('2026-10-17T10:00:00.000Z'));
    expect(ids(result.ranked)).toEqual(['Design card image', 'other']);
    expect(result.ranked[0]?.reason.urgent).toBe(true);
    expect(result.ranked[0]?.reason.quadrant).toBe(Quadrant.Do);
  });
});

describe('pick reasons', () => {
  const big = aTask({
    id: 'big',
    important: true,
    due: { date: '2026-10-15', time: '12:00' },
    estimateMinutes: 30,
  });

  it('gives a ranked Task its overdue, quadrant, urgent and latestStart', () => {
    expect(run([big]).ranked[0]?.reason).toEqual({
      overdue: false,
      quadrant: Quadrant.Do,
      urgent: true,
      latestStart: at('2026-10-15T09:30:00.000Z'),
    });
  });

  it('gives a ranked Task its reason text', () => {
    expect(run([big]).ranked[0]?.reasonText).toBe('Do · start by 2026-10-15 11:30');
  });

  it('returns the original Task object in the ranked entry', () => {
    expect(run([big]).ranked[0]?.task).toBe(big);
  });

  it('prefixes Overdue in the reason text of an overdue Task', () => {
    const late = aTask({
      id: 'late',
      important: false,
      due: { date: '2026-10-13', time: '17:00' },
      estimateMinutes: 10,
    });
    const entry = run([late]).ranked[0];
    expect(entry?.reason.overdue).toBe(true);
    expect(entry?.reasonText.startsWith('Overdue · Delegate')).toBe(true);
  });
});

describe('pick waiting', () => {
  const soon = aTask({ id: 'soon', availableFrom: { date: '2026-10-15', time: '09:00' } });
  const before = aTask({ id: 'before' });

  it('lists a not yet available Task with its NotYetAvailable reason', () => {
    const result = run([soon]);
    expect(ids(result.ranked)).toEqual([]);
    expect(result.waiting).toEqual([
      {
        task: soon,
        reasons: [
          { _tag: ExclusionReasonTag.NotYetAvailable, from: at('2026-10-15T07:00:00.000Z') },
        ],
      },
    ]);
  });

  it('lists a Task blocked by an open Task, and ranks the blocker', () => {
    const after = aTask({ id: 'after' });
    const result = run([after, before], [aLink('after', 'before')]);
    expect(ids(result.ranked)).toEqual(['before']);
    expect(result.waiting).toEqual([
      { task: after, reasons: [{ _tag: BlockedReasonTag.BlockedBy, taskIds: ['before'] }] },
    ]);
  });

  it('lists NotYetAvailable before BlockedBy when both apply', () => {
    const both = aTask({ id: 'both', availableFrom: { date: '2026-10-15', time: '09:00' } });
    const result = run([both, before], [aLink('both', 'before')]);
    expect(result.waiting).toEqual([
      {
        task: both,
        reasons: [
          { _tag: ExclusionReasonTag.NotYetAvailable, from: at('2026-10-15T07:00:00.000Z') },
          { _tag: BlockedReasonTag.BlockedBy, taskIds: ['before'] },
        ],
      },
    ]);
  });

  it.each([
    ['has passed', { date: '2026-10-14', time: '09:00' }],
    ['equals now', { date: '2026-10-14', time: '10:00' }],
  ])(
    'gives no NotYetAvailable reason when the blocker availableFrom %s',
    (_name, availableFrom) => {
      const blocker = aTask({ id: 'blocker', availableFrom });
      const blocked = aTask({ id: 'blocked' });
      const result = run([blocked, blocker], [aLink('blocked', 'blocker')]);
      expect(result.waiting).toEqual([
        { task: blocked, reasons: [{ _tag: BlockedReasonTag.BlockedBy, taskIds: ['blocker'] }] },
      ]);
    },
  );

  it('ranks a Task whose availableFrom has passed and whose blocker is Done', () => {
    const passed = aTask({ id: 'passed', availableFrom: { date: '2026-10-14', time: '09:00' } });
    const done = aTask({ id: 'done', status: TaskStatus.Done });
    const result = run([passed, done], [aLink('passed', 'done')]);
    expect(ids(result.ranked)).toEqual(['passed']);
    expect(result.waiting).toEqual([]);
  });

  it('orders waiting by createdAt, then by id', () => {
    const w = (id: string, createdAt: number) =>
      aTask({ id, createdAt, availableFrom: { date: '2026-10-15', time: '09:00' } });
    const result = run([w('c', 2), w('b', 1), w('a', 2), w('B', 1)]);
    expect(ids(result.waiting)).toEqual(['B', 'b', 'a', 'c']);
  });

  it('does not list the same Task as ranked and waiting', () => {
    const result = run([soon, before]);
    expect(ids(result.ranked)).toEqual(['before']);
    expect(ids(result.waiting)).toEqual(['soon']);
  });
});

describe('pick exclusions', () => {
  it('lists an Inbox, a Delegated and a Done Task in neither list', () => {
    const inbox = aTask({ id: 'inbox', important: null });
    const delegated = aTask({ id: 'delegated', status: TaskStatus.Delegated });
    const done = aTask({ id: 'done', status: TaskStatus.Done });
    const result = run([inbox, delegated, done]);
    expect(result.ranked).toEqual([]);
    expect(result.waiting).toEqual([]);
  });

  it.each([TaskStatus.Dropped, TaskStatus.Skipped] as const)(
    'lists a %s Task in neither list',
    (status) => {
      const result = run([aTask({ id: 'x', status })]);
      expect(result).toEqual({ ranked: [], waiting: [] });
    },
  );

  it('does not mutate its inputs', () => {
    const tasks = Object.freeze([
      Object.freeze(aTask({ id: 'b', important: false })),
      Object.freeze(aTask({ id: 'a', availableFrom: { date: '2026-10-15' } })),
    ]);
    const links = Object.freeze([Object.freeze(aLink('a', 'b'))]);
    const areas = Object.freeze(seedAreas({ workId: 'work', personalId: 'personal' }));
    const snapshot = structuredClone({ tasks, links });
    pick(tasks, links, areas, SETTINGS, NOW);
    expect({ tasks, links }).toEqual(snapshot);
  });
});

describe('pick active hours', () => {
  const areas = seedAreas({ workId: 'work', personalId: 'personal' });
  const SATURDAY = at('2026-10-10T08:00:00.000Z');
  const MONDAY = at('2026-10-12T06:00:00.000Z');
  const inAreas = (tasks: readonly Task[], links: ReturnType<typeof aLink>[], now: number) =>
    pick(tasks, links, areas, SETTINGS, now);

  it('lists an Available Task of an Area outside its active hours in neither list', () => {
    const result = inAreas([aTask({ id: 'w', areaId: 'work' })], [], SATURDAY);
    expect(result).toEqual({ ranked: [], waiting: [] });
  });

  it('lists a Blocked Task of an Area outside its active hours in neither list', () => {
    const blocked = aTask({ id: 'blocked', areaId: 'work' });
    const blocker = aTask({ id: 'blocker' });
    const result = inAreas([blocked, blocker], [aLink('blocked', 'blocker')], SATURDAY);
    expect(ids(result.ranked)).toEqual(['blocker']);
    expect(result.waiting).toEqual([]);
  });

  it('lists a not yet available Task of an Area outside its active hours in neither list', () => {
    const w = aTask({
      id: 'w',
      areaId: 'work',
      availableFrom: { date: '2026-10-15', time: '09:00' },
    });
    expect(inAreas([w], [], SATURDAY)).toEqual({ ranked: [], waiting: [] });
  });

  it('ranks Tasks in personal hours, without an Area, and with an unknown Area', () => {
    const tasks = [
      aTask({ id: 'personal', areaId: 'personal', createdAt: 1 }),
      aTask({ id: 'none', areaId: null, createdAt: 2 }),
      aTask({ id: 'gone', areaId: 'gone', createdAt: 3 }),
    ];
    expect(ids(inAreas(tasks, [], SATURDAY).ranked)).toEqual(['personal', 'none', 'gone']);
  });

  it('ranks a work Task during work hours', () => {
    const result = inAreas([aTask({ id: 'w', areaId: 'work' })], [], MONDAY);
    expect(ids(result.ranked)).toEqual(['w']);
  });
});
