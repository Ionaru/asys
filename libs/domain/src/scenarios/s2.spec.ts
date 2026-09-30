// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { blockedReasons, isAvailable, isOverdue, TaskStatus, BlockedReasonTag } from '../index';
import { AMS, aLink, aTask, blockerIdsOf } from '../test/builders';

const SLACK = 'Send Slack message to gauge attendees';

describe('S2 Team lunch session', () => {
  it.todo(
    "S2.1 [stage 3] Guest Group 'All employees' is invited through all@company.com as a whole",
  );
  it.todo('S2.2 [stage 3] A lunch with a Guest can be Visible or Private but never Hidden');
  it.todo(
    'S2.3 [stage 2, stage 3] Moving the Occasion to 23 October recalculates the lunch and its Tasks',
  );

  it('S2.4 Order lunch is Blocked while the Slack Task is Open or Delegated, even after 15 October 08:00', () => {
    const lunch = aTask({
      id: 'Order lunch',
      availableFrom: { date: '2026-10-15', time: '08:00' },
      due: { date: '2026-10-16', time: '10:00' },
      estimateMinutes: 15,
      important: true,
    });
    const links = [aLink('Order lunch', SLACK)];
    const slackIn = (status: TaskStatus) => aTask({ id: SLACK, status });

    for (const status of [TaskStatus.Open, TaskStatus.Delegated] as const) {
      const tasks = [lunch, slackIn(status)];
      expect(blockedReasons(lunch, tasks, links)).toEqual([
        { _tag: BlockedReasonTag.BlockedBy, taskIds: [SLACK] },
      ]);
      expect(isAvailable(lunch, tasks, links, Date.parse('2026-10-15T06:00:00.000Z'), AMS)).toBe(
        false,
      ); // 15 Oct 08:00
      expect(isAvailable(lunch, tasks, links, Date.parse('2026-10-15T10:00:00.000Z'), AMS)).toBe(
        false,
      ); // 15 Oct 12:00
    }

    const done = [lunch, slackIn(TaskStatus.Done)];
    expect(blockerIdsOf(lunch, done, links)).toEqual([]);
    expect(isAvailable(lunch, done, links, Date.parse('2026-10-15T06:00:00.000Z'), AMS)).toBe(true); // 15 Oct 08:00
  });

  it.todo('S2.5 [slice 3, stage 1] Check-in at 09:30 on 16 October, not one day before the Due');
  it.todo(
    'S2.6 [stage 5] While Delegated Order lunch is not mirrored to Google Tasks; its Check-in is, title only',
  );

  it('S2.7 first half: a Delegated Order lunch is Overdue only after its Due of 16 October 10:00', () => {
    const lunch = aTask({
      id: 'Order lunch',
      status: TaskStatus.Delegated,
      due: { date: '2026-10-16', time: '10:00' },
    });

    expect(isOverdue(lunch, Date.parse('2026-10-16T08:00:00.000Z'), AMS)).toBe(false); // 10:00:00
    expect(isOverdue(lunch, Date.parse('2026-10-16T08:00:01.000Z'), AMS)).toBe(true); // 10:00:01
  });

  it.todo(
    'S2.7 second half [slice 3] Check-in closing with Not yet defaults the next one to Monday 19 October',
  );
  it.todo('S2.8 [slice 3] Check-in Done marks Order lunch Done; Take back returns it to the User');
});
