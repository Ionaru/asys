// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  isBlocked,
  TaskStatus,
  ChangeEntity,
  ChangeOp,
  CommandTag,
  TransitionResultTag,
} from '../index';
import { aLink, aState, aTask } from '../test/builders';

const STOCK = 'Check snacks and drinks stock';

const HEADCOUNT = 'Gauge headcount for food';

describe('S10 Evening session at the office', () => {
  it.todo("S10.1 [stage 3] The session invites 'All employees' through all@company.com");
  it.todo('S10.2 [stage 3] A session with a Guest can be Visible or Private but never Hidden');
  it.todo(
    'S10.3 [stage 2, stage 3] Moving the Occasion from 12 to 13 November moves the session and its Tasks',
  );

  it('S10.4 Check snacks and drinks stock is Blocked while Gauge headcount for food is Open or Delegated', () => {
    const stock = aTask({ id: STOCK });
    const links = [aLink(STOCK, HEADCOUNT)];
    const blockedWith = (headcount: TaskStatus) =>
      isBlocked(stock, [stock, aTask({ id: HEADCOUNT, status: headcount })], links);

    expect(blockedWith(TaskStatus.Open)).toBe(true);
    expect(blockedWith(TaskStatus.Delegated)).toBe(true);
    expect(blockedWith(TaskStatus.Done)).toBe(false);
  });

  it.todo('S10.5 [stage 4] A Place Office Task is left out elsewhere and listed under Not here');

  it('S10.6 completing Check snacks and drinks stock changes only that Task and creates no Task', () => {
    const stock = aTask({ id: STOCK });
    const headcount = aTask({ id: HEADCOUNT, status: TaskStatus.Done });
    const state = aState({ tasks: [headcount, stock], links: [aLink(STOCK, HEADCOUNT)] });

    const result = applyCommand(
      state,
      { _tag: CommandTag.CompleteTask, taskId: STOCK },
      Date.parse('2026-11-12T16:00:00.000Z'),
    );

    expect(result._tag).toBe(TransitionResultTag.Applied);
    if (result._tag !== TransitionResultTag.Applied) return;
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      entity: ChangeEntity.Task,
      op: ChangeOp.Put,
      id: STOCK,
    });
  });
});
