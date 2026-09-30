// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { isBlocked, isOverdue, pick, BlockedReasonTag, TaskStatus } from '../index';
import { AMS, AMS_SETTINGS, aLink, aTask } from '../test/builders';

describe('S5 Month-end hours registration', () => {
  it.todo(
    'S5.1 [slice 3, stage 2] The October Occasion falls on Friday 30 October, the last Working day',
  );
  it.todo(
    "S5.2 [stage 3] Each member of all@company.com matching a Person gets one 'Register your hours' copy",
  );
  it.todo('S5.3 [stage 3] Membership is fixed when the copies are made');
  it.todo('S5.4 [stage 3] Unreadable all@company.com falls back to the Persons kept by hand');
  it.todo(
    'S5.5 [stage 5] While Delegated a copy is not mirrored to Google Tasks; its Check-in is, title only',
  );
  it.todo(
    "S5.6 [stage 3] 'OK to billing team' is Blocked before the copies are made and while any is Open or Delegated",
  );

  it('S5.7 first half: OK to billing team is Overdue after 30 October 17:30 while still Blocked, and is listed as waiting', () => {
    const ok = aTask({
      id: 'OK to billing team',
      due: { date: '2026-10-30', time: '17:30' },
      important: false,
      estimateMinutes: 10,
    });
    const copy = aTask({ id: 'Register your hours', status: TaskStatus.Delegated });
    const tasks = [ok, copy];
    const links = [aLink('OK to billing team', 'Register your hours')];

    const onTime = Date.parse('2026-10-30T16:30:00.000Z'); // 17:30:00
    const late = Date.parse('2026-10-30T16:30:01.000Z'); // 17:30:01
    expect(isOverdue(ok, onTime, AMS)).toBe(false);
    expect(isOverdue(ok, late, AMS)).toBe(true);
    expect(isBlocked(ok, tasks, links)).toBe(true);

    const result = pick(tasks, links, [], AMS_SETTINGS, late);
    expect(result.ranked.map((entry) => entry.task.id)).toEqual([]);
    expect(result.waiting).toHaveLength(1);
    expect(result.waiting[0]?.task.id).toBe('OK to billing team');
    expect(result.waiting[0]?.reasons).toEqual([
      { _tag: BlockedReasonTag.BlockedBy, taskIds: ['Register your hours'] },
    ]);
  });

  it.todo(
    'S5.7 second half [slice 3] Not yet on 30 October defaults the next Check-in to Monday 2 November',
  );
  it.todo(
    'S5.8 [stage 2] Moving the October Occasion from 30 to 29 October moves the anchored Tasks',
  );
  it.todo(
    'S5.9 [slice 2, slice 3] Not yet asks message or phone; phone makes Monday need Out loud',
  );
});
