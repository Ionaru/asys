// SPDX-License-Identifier: MPL-2.0

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { aLink, aTask } from '../../test/builders';
import { isWithinActiveHours, seedAreas, type Area } from '../area';
import type { Settings } from '../settings';
import {
  blockedReasons,
  deadlineIndex,
  isAvailable,
  isInInbox,
  isOverdue,
  isUrgentAt,
  quadrant,
  TaskStatus,
  type BlockerLink,
  type Task,
} from '../task';
import {
  addCalendarDays,
  availableFromInstant,
  isValidTimeZone,
  toLocalDateTime,
  type DateSpec,
  type Instant,
} from '../time';
import {
  ExclusionReasonTag,
  pick,
  type ExclusionReason,
  type PickResult,
  type RankedTask,
  type Reason,
  type WaitingTask,
} from './picker';
import { reasonText } from './reason-text';
import { waitingText } from './waiting-text';

const AMS = 'Europe/Amsterdam';

const BAD_ZONE = 'Mars/Olympus';

const DAY = 86_400_000;

const at = (iso: string) => Date.parse(iso);

const NOW = at('2026-10-14T08:00:00.000Z');

const AREAS = seedAreas({ workId: 'work', personalId: 'personal' });

const settings = (timeZone: string, urgencyWindowDays = 2): Settings => ({
  timeZone,
  urgencyWindowDays,
});

const thrown = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('pick converts only for a Task that needs it', () => {
  const blocker = aTask({ id: 'blocker', createdAt: 3 });
  const quiet: readonly Task[] = [
    aTask({ id: 'open', createdAt: 1 }),
    aTask({ id: 'gone', areaId: 'gone', createdAt: 2 }),
    blocker,
    aTask({ id: 'blocked', createdAt: 4 }),
    aTask({ id: 'inbox', important: null }),
    aTask({
      id: 'done',
      status: TaskStatus.Done,
      due: { date: '2026-10-14', time: '10:00' },
      availableFrom: { date: '2026-10-14' },
    }),
    aTask({ id: 'dropped', status: TaskStatus.Dropped, due: { date: '2026-10-14' } }),
  ];
  const links: readonly BlockerLink[] = [aLink('blocked', 'blocker')];

  const lists = (result: PickResult) => ({
    ranked: result.ranked.map((entry) => [entry.task.id, entry.reasonText]),
    waiting: result.waiting.map((entry) => [entry.task.id, entry.reasonText]),
  });

  const QUIET = {
    ranked: [
      ['open', 'No Due · important'],
      ['gone', 'No Due · important'],
      ['blocker', 'No Due · important'],
    ],
    waiting: [['blocked', 'Blocked by Task blocker']],
  };

  it('accepts an invalid zone while no Task has a Due, an Available from or a known Area', () => {
    expect(lists(pick(quiet, links, AREAS, settings(BAD_ZONE), NOW))).toEqual(QUIET);
  });

  it('accepts an invalid Urgency window while no ranked Task has a Latest start', () => {
    expect(lists(pick(quiet, links, AREAS, settings(AMS, 1.5), NOW))).toEqual(QUIET);
  });

  it('accepts an invalid now while no Task needs a conversion', () => {
    expect(lists(pick(quiet, links, AREAS, settings(AMS), Number.NaN))).toEqual(QUIET);
  });

  it.each([
    ['a Due', aTask({ id: 'x', due: { date: '2026-10-15' } })],
    ['an Available from', aTask({ id: 'x', availableFrom: { date: '2026-10-15' } })],
    ['a known Area', aTask({ id: 'x', areaId: 'work' })],
  ])('rejects an invalid zone once a Task has %s', (_name, task) => {
    expect(thrown(() => pick([...quiet, task], links, AREAS, settings(BAD_ZONE), NOW))).toEqual(
      new RangeError(`Invalid time zone: ${BAD_ZONE}`),
    );
  });

  it.each([
    ['a Due', aTask({ id: 'x', due: { date: '2026-10-15' } })],
    ['a known Area', aTask({ id: 'x', areaId: 'work' })],
  ])('rejects an invalid now once a Task has %s', (_name, task) => {
    expect(thrown(() => pick([...quiet, task], links, AREAS, settings(AMS), Number.NaN))).toEqual(
      new RangeError('Invalid instant: NaN'),
    );
  });

  it('rejects an invalid Urgency window once a ranked Task has a Latest start', () => {
    const due = aTask({ id: 'x', due: { date: '2026-10-15' } });
    expect(thrown(() => pick([...quiet, due], links, AREAS, settings(AMS, 1.5), NOW))).toEqual(
      new RangeError('Invalid number of days: 1.5'),
    );
  });

  it('keeps rejecting an invalid zone after a valid zone has been used', () => {
    const due = aTask({ id: 'x', due: { date: '2026-10-15' } });
    const invalid = new RangeError(`Invalid time zone: ${BAD_ZONE}`);
    expect(thrown(() => pick([due], links, AREAS, settings(BAD_ZONE), NOW))).toEqual(invalid);
    expect(pick([due], links, AREAS, settings(AMS), NOW).ranked).toHaveLength(1);
    expect(thrown(() => pick([due], links, AREAS, settings(BAD_ZONE), NOW))).toEqual(invalid);
  });
});

describe('pick Urgency window across a DST change', () => {
  const urgentById = (tasks: readonly Task[], now: Instant) => {
    const result = pick(tasks, [], [], settings(AMS), now);
    return Object.fromEntries(result.ranked.map((entry) => [entry.task.id, entry.reason.urgent]));
  };

  it('ends the window at the same wall-clock time after a fall-back', () => {
    // two calendar days after Sat 24 Oct 10:00 CEST is Mon 26 Oct 10:00 CET (09:00Z); a flat 48 h ends at 08:00Z
    const due = (id: string, time: string) =>
      aTask({ id, due: { date: '2026-10-26', time }, estimateMinutes: 0 });
    const tasks = [due('before', '09:59'), due('edge', '10:00'), due('after', '10:01')];
    expect(urgentById(tasks, at('2026-10-24T08:00:00.000Z'))).toEqual({
      before: true,
      edge: true,
      after: false,
    });
  });

  it('ends the window at the same wall-clock time after a spring-forward', () => {
    // two calendar days after Fri 27 Mar 09:00 CET is Sun 29 Mar 09:00 CEST (07:00Z); a flat 48 h ends at 08:00Z
    const due = (id: string, time: string) =>
      aTask({ id, due: { date: '2026-03-29', time }, estimateMinutes: 0 });
    const tasks = [due('before', '08:59'), due('edge', '09:00'), due('after', '09:01')];
    expect(urgentById(tasks, at('2026-03-27T08:00:00.000Z'))).toEqual({
      before: true,
      edge: true,
      after: false,
    });
  });
});

// The Picker as it was written before it shared work between Tasks: every Task asks the public
// rules on its own, so no value is derived once and reused. Not sorted; compare by id.
const pickPerTask = (
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  areas: readonly Area[],
  settings: Settings,
  now: Instant,
): PickResult => {
  const tz = settings.timeZone;
  const deadlines = deadlineIndex(tasks, links, tz);
  const areasById = new Map(areas.map((area) => [area.id, area]));
  const ranked: RankedTask[] = [];
  const waiting: WaitingTask[] = [];
  for (const task of tasks) {
    const area = task.areaId === null ? undefined : areasById.get(task.areaId);
    if (area !== undefined && !isWithinActiveHours(area, now, tz)) continue;
    if (isAvailable(task, tasks, links, now, tz)) {
      const start = deadlines.latestStart(task);
      const urgent = isUrgentAt(start, now, settings);
      const reason: Reason = {
        overdue: isOverdue(task, now, tz),
        quadrant: quadrant(task.important === true, urgent),
        urgent,
        latestStart: start,
      };
      ranked.push({ task, reason, reasonText: reasonText(task, reason, now, tz) });
    } else if (task.status === TaskStatus.Open && !isInInbox(task)) {
      const reasons: ExclusionReason[] = [];
      if (task.availableFrom !== null) {
        const from = availableFromInstant(task.availableFrom, tz);
        if (now < from) reasons.push({ _tag: ExclusionReasonTag.NotYetAvailable, from });
      }
      reasons.push(...blockedReasons(task, tasks, links));
      waiting.push({ task, reasons, reasonText: waitingText(task, reasons, tasks, now, tz) });
    }
  }
  return { ranked, waiting };
};

const outcome = (run: () => PickResult) => {
  const byId = <T extends { readonly task: Task }>(list: readonly T[]) =>
    [...list].sort((a, b) => (a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0));
  try {
    const result = run();
    return { ranked: byId(result.ranked), waiting: byId(result.waiting) };
  } catch (error) {
    return { error: String(error) };
  }
};

// Zones with their own transitions around 2026 (approximate dates; the generator spreads a few days either side).
// Havana, Cairo, Beirut and Santiago start their daylight saving at midnight, so one day starts at 01:00.
const ZONES: readonly (readonly [zone: string, transitions: readonly string[]])[] = [
  ['UTC', ['2026-10-25']],
  [AMS, ['2026-03-29', '2026-10-25']],
  ['America/New_York', ['2026-03-08', '2026-11-01']],
  ['America/St_Johns', ['2026-03-08', '2026-11-01']],
  ['America/Havana', ['2026-03-08', '2026-11-01']],
  ['Africa/Cairo', ['2026-04-24', '2026-10-29']],
  ['Asia/Beirut', ['2026-03-29', '2026-10-25']],
  ['America/Santiago', ['2026-04-05', '2026-09-06']],
  ['Australia/Lord_Howe', ['2026-04-05', '2026-10-04']],
  ['Asia/Kolkata', ['2026-10-25']],
];

const FALLBACK_NOW = at('2026-10-24T08:00:00.000Z');

// A DateSpec for the minute the instant falls in, as seen in the zone (in UTC when the zone is invalid).
const specAt = (instant: Instant, zone: string, dateOnly: boolean): DateSpec => {
  const iso = new Date(instant).toISOString();
  const local = isValidTimeZone(zone)
    ? toLocalDateTime(instant, zone)
    : { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  return dateOnly ? { date: local.date } : { date: local.date, time: local.time };
};

interface Scenario {
  readonly tasks: readonly Task[];
  readonly links: readonly BlockerLink[];
  readonly settings: Settings;
  readonly now: Instant;
}

const scenarioArbitrary: fc.Arbitrary<Scenario> = fc
  .record({
    zoneAndTransitions: fc.oneof(
      { weight: 24, arbitrary: fc.constantFrom(...ZONES) },
      { weight: 1, arbitrary: fc.constant([BAD_ZONE, ['2026-10-25']] as const) },
    ),
    urgencyWindowDays: fc.oneof(
      { weight: 24, arbitrary: fc.integer({ min: 0, max: 3 }) },
      { weight: 1, arbitrary: fc.constant(1.5) },
    ),
    day: fc.integer({ min: -4, max: 2 }),
    minuteOfDay: fc.integer({ min: 0, max: 1439 }),
    transitionIndex: fc.nat(1),
    invalidNow: fc.integer({ min: 0, max: 40 }),
    taskCount: fc.integer({ min: 0, max: 8 }),
  })
  .chain((base) => {
    const [zone, transitions] = base.zoneAndTransitions;
    const transition = transitions[base.transitionIndex % transitions.length] ?? '2026-10-25';
    const generated =
      at(`${transition}T00:00:00.000Z`) + base.day * DAY + base.minuteOfDay * 60_000;
    const now = base.invalidNow === 0 ? Number.NaN : generated;
    const usable =
      Number.isFinite(now) && isValidTimeZone(zone) && Number.isInteger(base.urgencyWindowDays);
    const centre = Number.isFinite(now) ? now : FALLBACK_NOW;
    // The Urgency cutoff and now are where a Latest start or a Due decides a flag, so Tasks cluster there.
    const cutoff = usable ? addCalendarDays(now, base.urgencyWindowDays, zone) : centre;
    const spec = fc
      .record({
        near: fc.constantFrom(cutoff, centre),
        quarterHours: fc.integer({ min: -8, max: 8 }),
        dateOnly: fc.boolean(),
      })
      .map(({ near, quarterHours, dateOnly }) =>
        specAt(near + quarterHours * 900_000, zone, dateOnly),
      );
    const task = (index: number) =>
      fc
        .record({
          status: fc.constantFrom(
            TaskStatus.Open,
            TaskStatus.Open,
            TaskStatus.Open,
            TaskStatus.Open,
            TaskStatus.Done,
            TaskStatus.Delegated,
          ),
          due: fc.option(spec, { nil: null, freq: 3 }),
          availableFrom: fc.option(spec, { nil: null, freq: 4 }),
          areaId: fc.constantFrom(null, null, 'work', 'personal', 'gone'),
          estimateMinutes: fc.constantFrom(0, 15, 30, null),
          important: fc.constantFrom(true, false, null),
          createdAt: fc.integer({ min: 0, max: 3 }),
        })
        .map((fields) => aTask({ id: `t${index}`, ...fields }));
    const links =
      base.taskCount === 0
        ? fc.constant<readonly BlockerLink[]>([])
        : fc
            .array(
              fc.tuple(
                fc.integer({ min: 0, max: base.taskCount - 1 }),
                fc.integer({ min: 0, max: base.taskCount - 1 }),
              ),
              { maxLength: 4 },
            )
            .map((pairs) =>
              pairs.map(([taskIndex, blockerIndex]) => aLink(`t${taskIndex}`, `t${blockerIndex}`)),
            );
    return fc.record({
      tasks: fc.tuple(...Array.from({ length: base.taskCount }, (_, index) => task(index))),
      links,
      settings: fc.constant(settings(zone, base.urgencyWindowDays)),
      now: fc.constant(now),
    });
  });

describe('pick across zones', () => {
  it('gives the same lists and the same errors as asking the rules Task by Task', () => {
    fc.assert(
      fc.property(scenarioArbitrary, (scenario) => {
        const { tasks, links, settings: s, now } = scenario;
        expect(outcome(() => pick(tasks, links, AREAS, s, now))).toEqual(
          outcome(() => pickPerTask(tasks, links, AREAS, s, now)),
        );
      }),
      { numRuns: 400 },
    );
  });
});
