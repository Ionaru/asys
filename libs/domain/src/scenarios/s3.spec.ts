// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { isBlocked, TaskStatus } from '../index';
import { aLink, aTask } from '../test/builders';

const IT_ACCOUNTS = 'Set up IT accounts for Fatima';

const LAPTOP = 'Order laptop and equipment';

const BADGE = 'Request office access badge';

describe('S3 New employee onboarding', () => {
  it.todo(
    'S3.1 [stage 2] Moving the Occasion from 1 to 8 September moves every open anchored item',
  );
  it.todo(
    'S3.2 [stage 2] Moving only the walkthrough moves the IT accounts Task from 27 August to 28 August',
  );

  it('S3.3 Set up IT accounts is Blocked while the laptop or the badge Task is Open or Delegated', () => {
    const itAccounts = aTask({ id: IT_ACCOUNTS });
    const links = [aLink(IT_ACCOUNTS, LAPTOP), aLink(IT_ACCOUNTS, BADGE)];
    const blockedWith = (laptop: TaskStatus, badge: TaskStatus) =>
      isBlocked(
        itAccounts,
        [itAccounts, aTask({ id: LAPTOP, status: laptop }), aTask({ id: BADGE, status: badge })],
        links,
      );

    for (const status of [TaskStatus.Open, TaskStatus.Delegated] as const) {
      expect(blockedWith(status, TaskStatus.Done)).toBe(true); // the laptop alone blocks
      expect(blockedWith(TaskStatus.Done, status)).toBe(true); // the badge alone blocks
    }
    expect(blockedWith(TaskStatus.Delegated, TaskStatus.Open)).toBe(true);
    expect(blockedWith(TaskStatus.Done, TaskStatus.Done)).toBe(false);
    expect(blockedWith(TaskStatus.Done, TaskStatus.Dropped)).toBe(false);
    expect(blockedWith(TaskStatus.Dropped, TaskStatus.Done)).toBe(false);
  });

  it.todo("S3.4 [stage 3] The Welcome lunch invites 'All employees' through all@company.com");
  it.todo(
    'S3.5 [slice 3, stage 5] Check-in on 17 August; not mirrored to Google Tasks while Delegated',
  );
  it.todo(
    'S3.6 [slice 3] Not yet on Monday 17 August defaults the next Check-in to Tuesday 18 August',
  );
  it.todo(
    'S3.7 [stage 2] Open IT accounts Task when the walkthrough is about to start gives the Reminder',
  );
  it.todo('S3.8 [stage 2] After 1 September with no Open Task the Occasion is Past');
  it.todo('S3.9 [stage 4] A call overlapping a Silent Workable Activity raises one Review item');
});
