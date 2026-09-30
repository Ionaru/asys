// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  completeTask,
  isOverdue,
  ChangeEntity,
  ChangeOp,
  CommandTag,
  TaskStatus,
  TransitionResultTag,
} from '../index';
import { AMS, aState, aTask } from '../test/builders';

const REVIEW = 'Review leave balances for year-end';

describe('S8 Year-end leave balance', () => {
  it.todo(
    'S8.1 [slice 3] The Series produces the 2027 Occurrence without the User setting it up again',
  );

  it('S8.2 first half: completing Review leave balances changes only that Task, to done', () => {
    const review = aTask({
      id: REVIEW,
      due: { date: '2026-11-08' },
      estimateMinutes: 30,
      important: true,
    });
    const now = Date.parse('2026-11-05T09:00:00.000Z');

    const alone = completeTask(
      aState({ tasks: [review] }),
      { _tag: CommandTag.CompleteTask, taskId: REVIEW },
      now,
    );
    expect(alone._tag).toBe(TransitionResultTag.Applied);
    if (alone._tag !== TransitionResultTag.Applied) return;
    expect(alone.changes).toHaveLength(1);
    const [change] = alone.changes;
    expect(change).toMatchObject({ entity: ChangeEntity.Task, op: ChangeOp.Put });
    if (change?.entity !== ChangeEntity.Task || change.op !== ChangeOp.Put) return;
    expect(change.after.id).toBe(REVIEW);
    expect(change.after.status).toBe(TaskStatus.Done);

    const other = aTask({ id: 'Something else', due: { date: '2026-11-09' } });
    const crowded = applyCommand(
      aState({ tasks: [other, review] }),
      { _tag: CommandTag.CompleteTask, taskId: REVIEW },
      now,
    );
    expect(crowded._tag).toBe(TransitionResultTag.Applied);
    if (crowded._tag !== TransitionResultTag.Applied) return;
    expect(crowded.changes).toHaveLength(1);
    expect(crowded.changes[0]).toMatchObject({
      entity: ChangeEntity.Task,
      op: ChangeOp.Put,
      id: REVIEW,
    });
  });

  it.todo(
    "S8.2 second half [slice 3] Each 'book remaining leave days' Task is created and Delegated by hand",
  );
  it.todo(
    "S8.3 [slice 3] Delegating Anna's Task opens a Check-in on 17 December and removes it from working lists",
  );
  it.todo(
    'S8.4 [stage 5] Hidden Delegated Tasks and their Check-ins are not mirrored to Google Tasks',
  );
  it.todo(
    'S8.5 [slice 3] Not yet opens the next Check-in on Friday 18 December, or the next Working day for Bram',
  );
  it.todo(
    'S8.6 [slice 3] Check-in Done marks the Task Done; Take back returns it to the User as Open',
  );
  it('S8.7 first half: a Delegated Task due on 15 December is Overdue from 16 December 00:00', () => {
    const bram = aTask({
      id: 'Bram Jansen: book remaining leave days before year end',
      status: TaskStatus.Delegated,
      due: { date: '2026-12-15' },
    });

    expect(isOverdue(bram, Date.parse('2026-12-15T22:59:59.999Z'), AMS)).toBe(false); // 23:59:59.999
    expect(isOverdue(bram, Date.parse('2026-12-15T23:00:00.000Z'), AMS)).toBe(true); // 16 Dec 00:00
  });

  it.todo(
    "S8.7 second half [slice 3] Bram's Task returns to the working lists only once a Check-in closes with Take back",
  );
  it.todo("S8.8 [slice 3] Dropping Bram's Delegated Task drops its open Check-in with it");
  it.todo(
    'S8.9 [slice 2, slice 3, stage 4] A Closed door Check-in is listed under Not here at an Out loud Place',
  );
});
