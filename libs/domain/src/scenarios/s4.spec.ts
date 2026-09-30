// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { isAvailable, isBlocked, TaskStatus } from '../index';
import { AMS, aLink, aTask } from '../test/builders';

const COLLECT = 'Collect access tags, equipment and company property';

const DISABLE = 'Disable accounts';

const DELETE = 'Delete accounts';

describe('S4 Employee leaves', () => {
  it.todo("S4.1 [stage 2] Completing 'Confirm official notice' creates nothing by itself");
  it.todo(
    'S4.2 [stage 2] Moving the Occasion from 15 to 22 October moves every open anchored item',
  );
  it.todo('S4.3 [stage 3] Exit interview and Farewell lunch have Guests, so never Hidden');
  it.todo('S4.4 [stage 3] A colleague joining team@company.com after the Invite is still included');

  it('S4.5 Disable accounts and Delete accounts stay Blocked along the chain, even after 13 January 2027', () => {
    const disable = aTask({ id: DISABLE });
    const del = aTask({ id: DELETE, due: { date: '2027-01-13' } });
    const links = [aLink(DISABLE, COLLECT), aLink(DELETE, DISABLE)];
    const tasksWith = (collect: TaskStatus, disableStatus: TaskStatus) => [
      aTask({ id: COLLECT, status: collect }),
      { ...disable, status: disableStatus },
      del,
    ];

    for (const status of [TaskStatus.Open, TaskStatus.Delegated] as const) {
      expect(isBlocked(disable, tasksWith(status, TaskStatus.Open), links)).toBe(true);
      expect(isBlocked(del, tasksWith(TaskStatus.Done, status), links)).toBe(true);
    }

    const after13Jan = Date.parse('2027-01-14T09:00:00.000Z'); // 14 Jan 10:00
    for (const status of [TaskStatus.Open, TaskStatus.Delegated] as const) {
      const tasks = tasksWith(TaskStatus.Done, status);
      expect(isAvailable(del, tasks, links, after13Jan, AMS)).toBe(false);
    }
  });

  it.todo(
    'S4.6 [slice 3, stage 5] Check-ins at 30 September 09:00 and 15 October 15:30; not mirrored while Delegated',
  );
  it.todo(
    "S4.7 [stage 2] Tom Bakker's Person page lists the Series; deleting him while active raises a Review item",
  );
  it.todo(
    "S4.8 [stage 2] The Occasion stays Upcoming after 15 October while 'Delete accounts' is Open",
  );
});
