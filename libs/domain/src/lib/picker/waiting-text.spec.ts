// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { aTask } from '../../test/builders';
import { BlockedReasonTag } from '../task/blocked';
import type { Task } from '../task';
import { formatClock } from '../time';
import { ExclusionReasonTag, type ExclusionReason, type WaitingTask } from './picker';
import { waitingSummary, waitingText } from './waiting-text';

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

const waiting = (task: Task, reasons: readonly ExclusionReason[]): WaitingTask => {
  return { task, reasons, reasonText: '' };
};

const summary = (entries: readonly WaitingTask[]): string | null => {
  return waitingSummary(entries, NOW, AMS);
};

describe('waitingSummary', () => {
  it('says Next Available with the weekday and date for a date-only availableFrom', () => {
    const task = aTask({ id: 't', availableFrom: { date: '2026-10-06' } });
    expect(summary([waiting(task, [notYetAvailable('2026-10-05T22:00:00.000Z')])])).toBe(
      'Next Available Tue 6 Oct',
    );
  });

  it('says Next Available with the day and time for an availableFrom with a time', () => {
    const task = aTask({ id: 't', availableFrom: { date: '2026-10-05', time: '09:00' } });
    expect(summary([waiting(task, [notYetAvailable('2026-10-05T07:00:00.000Z')])])).toBe(
      'Next Available tomorrow 09:00',
    );
  });

  it('formats the reason instant when the Task has no availableFrom', () => {
    const task = aTask({ id: 't', availableFrom: null });
    expect(summary([waiting(task, [notYetAvailable('2026-10-04T13:30:00.000Z')])])).toBe(
      'Next Available 15:30',
    );
  });

  it('uses the time zone it is given', () => {
    const task = aTask({ id: 't', availableFrom: null });
    const entries = [waiting(task, [notYetAvailable('2026-10-04T13:30:00.000Z')])];
    expect(waitingSummary(entries, NOW, 'UTC')).toBe('Next Available 13:30');
  });

  describe('which Task comes first', () => {
    const later = aTask({ id: 'later', availableFrom: { date: '2026-10-06' } });
    const sooner = aTask({ id: 'sooner', availableFrom: { date: '2026-10-05', time: '09:00' } });
    const laterEntry = waiting(later, [notYetAvailable('2026-10-05T22:00:00.000Z')]);
    const soonerEntry = waiting(sooner, [notYetAvailable('2026-10-05T07:00:00.000Z')]);

    it('takes the earlier from when it is listed second', () => {
      expect(summary([laterEntry, soonerEntry])).toBe('Next Available tomorrow 09:00');
    });

    it('takes the earlier from when it is listed first', () => {
      expect(summary([soonerEntry, laterEntry])).toBe('Next Available tomorrow 09:00');
    });

    it('takes the first in list order on a tie', () => {
      const dateOnly = aTask({ id: 'date-only', availableFrom: { date: '2026-10-06' } });
      const withTime = aTask({
        id: 'with-time',
        availableFrom: { date: '2026-10-05', time: '09:00' },
      });
      const dateOnlyEntry = waiting(dateOnly, [notYetAvailable('2026-10-05T07:00:00.000Z')]);
      const withTimeEntry = waiting(withTime, [notYetAvailable('2026-10-05T07:00:00.000Z')]);

      expect(summary([dateOnlyEntry, withTimeEntry])).toBe('Next Available Tue 6 Oct');
      expect(summary([withTimeEntry, dateOnlyEntry])).toBe('Next Available tomorrow 09:00');
    });

    it('takes the smallest from among several NotYetAvailable reasons of one Task', () => {
      const task = aTask({ id: 't', availableFrom: null });
      const early = notYetAvailable('2026-10-04T13:30:00.000Z');
      const late = notYetAvailable('2026-10-05T07:00:00.000Z');

      expect(summary([waiting(task, [late, early])])).toBe('Next Available 15:30');
      expect(summary([waiting(task, [early, late])])).toBe('Next Available 15:30');
    });
  });

  describe('without a NotYetAvailable reason', () => {
    it('is null for an empty list', () => {
      expect(summary([])).toBeNull();
    });

    it('is null when the only reason is BlockedBy', () => {
      const task = aTask({ id: 't' });
      expect(summary([waiting(task, [blockedBy('b1')])])).toBeNull();
    });

    it('is null for a Task without reasons', () => {
      expect(summary([waiting(aTask({ id: 't' }), [])])).toBeNull();
    });

    it('is null when only unknown reason tags are present', () => {
      const unknown = {
        _tag: 'Voice',
        from: at('2026-10-04T09:00:00.000Z'),
      } as unknown as ExclusionReason;
      expect(summary([waiting(aTask({ id: 't' }), [unknown])])).toBeNull();
    });
  });

  describe('with BlockedBy and unknown reasons present', () => {
    it('counts a Task with both reasons by its NotYetAvailable from', () => {
      const task = aTask({ id: 't', availableFrom: { date: '2026-10-05', time: '09:00' } });
      const reasons = [blockedBy('b1'), notYetAvailable('2026-10-05T07:00:00.000Z')];

      expect(summary([waiting(task, reasons)])).toBe('Next Available tomorrow 09:00');
      expect(summary([waiting(task, [...reasons].reverse())])).toBe(
        'Next Available tomorrow 09:00',
      );
    });

    it('lets a Task with only BlockedBy not hide a later NotYetAvailable', () => {
      const blocked = aTask({ id: 'blocked' });
      const waits = aTask({ id: 'waits', availableFrom: { date: '2026-10-06' } });

      expect(
        summary([
          waiting(blocked, [blockedBy('b1')]),
          waiting(waits, [notYetAvailable('2026-10-05T22:00:00.000Z')]),
        ]),
      ).toBe('Next Available Tue 6 Oct');
    });

    it('ignores an unknown reason tag, even one with an earlier from', () => {
      const task = aTask({ id: 't', availableFrom: { date: '2026-10-06' } });
      const unknown = {
        _tag: 'Voice',
        from: at('2026-10-04T09:00:00.000Z'),
      } as unknown as ExclusionReason;
      const reasons = [unknown, notYetAvailable('2026-10-05T22:00:00.000Z')];

      expect(summary([waiting(task, reasons)])).toBe('Next Available Tue 6 Oct');
    });
  });

  it('says the same date words as waitingText for the same Task', () => {
    const cases: readonly [Task, ExclusionReason][] = [
      [
        aTask({ id: 'a', availableFrom: { date: '2026-10-06' } }),
        notYetAvailable('2026-10-05T22:00:00.000Z'),
      ],
      [
        aTask({ id: 'b', availableFrom: { date: '2026-10-05', time: '09:00' } }),
        notYetAvailable('2026-10-05T07:00:00.000Z'),
      ],
      [aTask({ id: 'c', availableFrom: null }), notYetAvailable('2026-10-04T13:30:00.000Z')],
      [aTask({ id: 'd', availableFrom: null }), notYetAvailable('2026-10-10T12:30:00.000Z')],
    ];

    for (const [task, reason] of cases) {
      const words = waitingText(task, [reason], [], NOW, AMS).replace(/^Available from /, '');

      expect(summary([waiting(task, [reason])])).toBe(`Next Available ${words}`);
    }
  });

  it('takes the smallest from whatever the list order', () => {
    const start = at('2026-10-04T08:00:00.000Z');
    const end = at('2026-10-30T08:00:00.000Z');

    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: start, max: end }), { minLength: 1, maxLength: 8 }),
        (froms) => {
          const entries = froms.map((from, index) =>
            waiting(aTask({ id: `t${index}`, availableFrom: null }), [
              { _tag: ExclusionReasonTag.NotYetAvailable, from },
            ]),
          );

          expect(summary(entries)).toBe(
            `Next Available ${formatClock(Math.min(...froms), NOW, AMS)}`,
          );
          expect(summary([...entries].reverse())).toBe(summary(entries));
        },
      ),
      { numRuns: 200 },
    );
  });
});
