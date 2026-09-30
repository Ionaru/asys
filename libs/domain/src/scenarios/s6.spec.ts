// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { isBlocked, TaskStatus } from '../index';
import { aLink, aTask } from '../test/builders';

describe('S6 Candidate interview', () => {
  it.todo('S6.1 [slice 2] ASYS offers no change to the interview and sends no Invite or update');
  it.todo("S6.2 [stage 1] The Playbook fills 'Candidate' and 'Recruiter' by email from the Invite");
  it.todo('S6.3 [stage 1] Moving the Invite to Friday 9 October 14:00 recalculates the five Tasks');
  it.todo('S6.4 [stage 1] Cancelling the Invite raises a Review item for each open Prep Task');

  it('S6.5 Give feedback to recruitment is Blocked while Fill in scorecard is Open or Delegated', () => {
    const feedback = aTask({ id: 'Give feedback to recruitment' });
    const links = [aLink('Give feedback to recruitment', 'Fill in scorecard')];
    const blockedWith = (scorecard: TaskStatus) =>
      isBlocked(feedback, [feedback, aTask({ id: 'Fill in scorecard', status: scorecard })], links);

    expect(blockedWith(TaskStatus.Open)).toBe(true);
    expect(blockedWith(TaskStatus.Delegated)).toBe(true);
    expect(blockedWith(TaskStatus.Done)).toBe(false);
  });

  it.todo("S6.6 [stage 1] Open 'Print CV' when the interview is about to start gives the Reminder");
  it.todo('S6.7 [stage 5] Private Tasks show only their titles in Google Tasks');
  it.todo(
    "S6.8 [stage 1] No matching 'Recruiter' leaves the Role empty, raises a Review item, creates all Tasks",
  );
});
