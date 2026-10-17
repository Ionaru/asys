// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { aLink, aTask, anArea, AMS, AMS_SETTINGS } from '../../test/builders';
import { seedAreas } from '../area';
import {
  deadlineIndex,
  isOverdue,
  Quadrant,
  quadrant,
  TaskStatus,
  type BlockerLink,
  type Task,
} from '../task';
import { BlockedReasonTag } from '../task/blocked';
import { isUrgentBy } from '../task/priority';
import { addCalendarDays } from '../time';
import { explainTask, TaskExplanationTag } from './explain';
import { ExclusionReasonTag, pick, type Reason } from './picker';

const at = (iso: string) => Date.parse(iso);

// Wednesday 2026-10-14, 10:00 in Amsterdam.
const NOW = at('2026-10-14T08:00:00.000Z');

const explain = (task: Task, tasks: readonly Task[] = [task], links: BlockerLink[] = []) =>
  explainTask(task, tasks, links, AMS_SETTINGS, NOW);

describe('explainTask for a Task that is not Open', () => {
  it.each([TaskStatus.Done, TaskStatus.Dropped, TaskStatus.Delegated, TaskStatus.Skipped] as const)(
    'explains a %s Task as NotOpen',
    (status) => {
      expect(explain(aTask({ id: 'x', status }))).toEqual({ _tag: TaskExplanationTag.NotOpen });
    },
  );
});

describe('explainTask for an Inbox Task', () => {
  it.each([
    ['no importance', { important: null }],
    ['no Estimate', { estimateMinutes: null }],
  ])('explains an Open Task with %s as Inbox', (_name, overrides) => {
    expect(explain(aTask({ id: 'x', ...overrides }))).toEqual({ _tag: TaskExplanationTag.Inbox });
  });
});

describe('explainTask for an Available Task', () => {
  it('gives an important Task with a Due its reason and Latest start text', () => {
    const big = aTask({
      id: 'big',
      important: true,
      due: { date: '2026-10-15', time: '12:00' },
      estimateMinutes: 30,
    });
    expect(explain(big)).toEqual({
      _tag: TaskExplanationTag.Available,
      reason: {
        overdue: false,
        quadrant: Quadrant.Do,
        urgent: true,
        latestStart: at('2026-10-15T09:30:00.000Z'),
      },
      reasonText: 'Latest start tomorrow 11:30 · important',
    });
  });

  it('gives an Overdue Task the Due text', () => {
    const late = aTask({
      id: 'late',
      important: false,
      due: { date: '2026-10-13', time: '17:00' },
      estimateMinutes: 10,
    });
    const explanation = explain(late);
    expect(explanation).toMatchObject({
      _tag: TaskExplanationTag.Available,
      reasonText: 'Due yesterday 17:00',
    });
    expect(explanation).toMatchObject({
      reason: { overdue: true, quadrant: Quadrant.Delegate },
    });
  });

  it('gives a Task without a Due the No Due text', () => {
    expect(explain(aTask({ id: 'open', important: false, due: null }))).toEqual({
      _tag: TaskExplanationTag.Available,
      reason: { overdue: false, quadrant: Quadrant.Drop, urgent: false, latestStart: null },
      reasonText: 'No Due',
    });
  });

  it('uses the Latest start a Task inherits from the Task it blocks', () => {
    const design = aTask({
      id: 'Design card image',
      important: true,
      due: { date: '2026-10-19', time: '17:00' },
      estimateMinutes: 20,
    });
    const order = aTask({
      id: 'Order card',
      due: { date: '2026-10-19', time: '12:00' },
      estimateMinutes: 15,
    });
    const explanation = explain(design, [order, design], [aLink(order.id, design.id)]);
    expect(explanation).toMatchObject({
      _tag: TaskExplanationTag.Available,
      reason: { latestStart: at('2026-10-19T09:25:00.000Z'), quadrant: Quadrant.Plan },
    });
  });
});

describe('explainTask for a Waiting Task', () => {
  const before = aTask({ id: 'before', title: 'Order card' });

  it('explains a Task with a future Available from', () => {
    const soon = aTask({ id: 'soon', availableFrom: { date: '2026-10-20', time: '09:00' } });
    expect(explain(soon)).toMatchObject({
      _tag: TaskExplanationTag.Waiting,
      reasons: [{ _tag: ExclusionReasonTag.NotYetAvailable, from: at('2026-10-20T07:00:00.000Z') }],
      reasonText: 'Available from Tue 20 Oct 09:00',
    });
  });

  it('explains a Task with a blocker', () => {
    const after = aTask({ id: 'after' });
    expect(explain(after, [after, before], [aLink('after', 'before')])).toMatchObject({
      _tag: TaskExplanationTag.Waiting,
      reasons: [{ _tag: BlockedReasonTag.BlockedBy, taskIds: ['before'] }],
      reasonText: 'Blocked by Order card',
    });
  });

  it('lists NotYetAvailable before BlockedBy when both apply', () => {
    const both = aTask({ id: 'both', availableFrom: { date: '2026-10-20', time: '09:00' } });
    expect(explain(both, [both, before], [aLink('both', 'before')])).toEqual({
      _tag: TaskExplanationTag.Waiting,
      reason: {
        overdue: false,
        quadrant: Quadrant.Plan,
        urgent: false,
        latestStart: null,
      },
      reasons: [
        { _tag: ExclusionReasonTag.NotYetAvailable, from: at('2026-10-20T07:00:00.000Z') },
        { _tag: BlockedReasonTag.BlockedBy, taskIds: ['before'] },
      ],
      reasonText: 'Available from Tue 20 Oct 09:00 · Blocked by Order card',
    });
  });

  it('gives an important Task with a near Due that waits for a blocker the Do Quadrant', () => {
    const urgent = aTask({
      id: 'urgent',
      important: true,
      due: { date: '2026-10-15', time: '12:00' },
      estimateMinutes: 30,
    });
    const explanation = explain(urgent, [urgent, before], [aLink('urgent', 'before')]);
    expect(explanation._tag).toBe(TaskExplanationTag.Waiting);
    expect(explanation).toMatchObject({ reason: { quadrant: Quadrant.Do, urgent: true } });
  });
});

describe('explainTask inputs', () => {
  it('ignores the Areas, so a Task outside the Current Area is still Available', () => {
    const areas = seedAreas({ workId: 'work', personalId: 'personal' });
    const work = aTask({ id: 'w', areaId: 'work' });
    const result = pick([work], [], areas, AMS_SETTINGS, NOW, ['personal']);

    // The Picker leaves the Task out of both lists while its Area is not current.
    expect(result.ranked.map((r) => r.task.id)).toEqual([]);
    expect(result.waiting.map((w) => w.task.id)).toEqual([]);
    expect(explainTask(work, [work], [], AMS_SETTINGS, NOW)._tag).toBe(
      TaskExplanationTag.Available,
    );
  });

  it('reads the Task from `task`, not from the stored copy in `tasks`', () => {
    const stored = aTask({ id: 't1', due: { date: '2026-12-01', time: '12:00' } });
    const edited = { ...stored, due: { date: '2026-10-15', time: '12:00' } };
    const explanation = explain(edited, [stored]);
    expect(explanation).toMatchObject({
      _tag: TaskExplanationTag.Available,
      reason: { urgent: true, quadrant: Quadrant.Do, latestStart: at('2026-10-15T09:30:00.000Z') },
    });
  });

  it('gives the same answer when `tasks` holds the very same object', () => {
    const t = aTask({ id: 't1', due: { date: '2026-10-15', time: '12:00' } });
    expect(explain(t, [t])).toEqual(explain(t, [{ ...t }]));
  });
});

describe('explainTask parity with pick', () => {
  const AREAS = seedAreas({ workId: 'work', personalId: 'personal' }).concat(
    anArea({ id: 'extra' }),
  );

  const dateArb = fc
    .integer({ min: 8, max: 28 })
    .map((day) => `2026-10-${String(day).padStart(2, '0')}`);

  const specArb = fc.record({
    due: fc.option(
      fc.record({
        date: dateArb,
        time: fc.option(fc.constantFrom('09:00', '12:00', '17:00'), { nil: undefined }),
      }),
      { nil: null },
    ),
    availableFrom: fc.option(
      fc.record({
        date: dateArb,
        time: fc.option(fc.constantFrom('00:00', '09:00', '23:00'), { nil: undefined }),
      }),
      { nil: null },
    ),
    important: fc.constantFrom(true, false, null),
    estimateMinutes: fc.option(fc.integer({ min: 1, max: 600 }), { nil: null }),
    status: fc.constantFrom(
      TaskStatus.Open,
      TaskStatus.Open,
      TaskStatus.Open,
      TaskStatus.Done,
      TaskStatus.Dropped,
      TaskStatus.Delegated,
      TaskStatus.Skipped,
    ),
    areaId: fc.constantFrom('work', 'personal', 'gone', null),
  });

  const scenarioArb = fc.record({
    specs: fc.array(specArb, { minLength: 1, maxLength: 8 }),
    // A link points from a later Task to an earlier one, which keeps the blockers acyclic.
    edges: fc.array(fc.tuple(fc.nat(7), fc.nat(7)), { maxLength: 8 }),
    now: fc.integer({ min: at('2026-10-10T00:00:00.000Z'), max: at('2026-10-24T00:00:00.000Z') }),
  });

  it('agrees with every ranked, waiting, Inbox and NotOpen entry of pick', () => {
    fc.assert(
      fc.property(scenarioArb, ({ specs, edges, now }) => {
        const tasks = specs.map((spec, i) =>
          aTask({ id: `t${i}`, createdAt: i, ...spec, due: spec.due ?? null }),
        );
        const links = edges.flatMap(([a, b]) =>
          a < tasks.length && b < a ? [aLink(`t${a}`, `t${b}`)] : [],
        );
        const result = pick(
          tasks,
          links,
          AREAS,
          AMS_SETTINGS,
          now,
          AREAS.map((area) => area.id),
        );
        const deadlines = deadlineIndex(tasks, links, AMS);
        const reasonOf = (task: Task): Reason => {
          const start = deadlines.latestStart(task);
          const urgent = isUrgentBy(start, () =>
            addCalendarDays(now, AMS_SETTINGS.urgencyWindowDays, AMS),
          );
          return {
            overdue: isOverdue(task, now, AMS),
            quadrant: quadrant(task.important === true, urgent),
            urgent,
            latestStart: start,
          };
        };
        const listed = new Set<string>();
        for (const r of result.ranked) {
          listed.add(r.task.id);
          expect(explainTask(r.task, tasks, links, AMS_SETTINGS, now)).toEqual({
            _tag: TaskExplanationTag.Available,
            reason: r.reason,
            reasonText: r.reasonText,
          });
        }
        for (const w of result.waiting) {
          listed.add(w.task.id);
          expect(explainTask(w.task, tasks, links, AMS_SETTINGS, now)).toEqual({
            _tag: TaskExplanationTag.Waiting,
            reason: reasonOf(w.task),
            reasons: w.reasons,
            reasonText: w.reasonText,
          });
        }
        for (const task of tasks.filter((t) => !listed.has(t.id))) {
          const explanation = explainTask(task, tasks, links, AMS_SETTINGS, now);
          expect(explanation._tag).toBe(
            task.status !== TaskStatus.Open ? TaskExplanationTag.NotOpen : TaskExplanationTag.Inbox,
          );
        }
      }),
      { numRuns: 100 },
    );
  });
});
