// SPDX-License-Identifier: EUPL-1.2
import { CommandTag, Privacy, TaskStatus, WORK_ACTIVE_HOURS, type Command } from '@asys/domain';

import { SETTINGS_SUBJECT, commandSubject } from './command-subject';

describe('SETTINGS_SUBJECT', () => {
  it('is settings', () => {
    expect(SETTINGS_SUBJECT).toBe('settings');
  });
});

describe('commandSubject', () => {
  const expect_ = { status: TaskStatus.Open };

  it.each<{ name: string; command: Command; expected: string }>([
    {
      name: 'CaptureTask acts on its taskId',
      command: { _tag: CommandTag.CaptureTask, taskId: 't1', title: 'x', captureText: 'x' },
      expected: 't1',
    },
    {
      name: 'TriageTask acts on its taskId',
      command: {
        _tag: CommandTag.TriageTask,
        taskId: 't2',
        important: true,
        estimateMinutes: 30,
      },
      expected: 't2',
    },
    {
      name: 'EditTask acts on its taskId',
      command: { _tag: CommandTag.EditTask, taskId: 't3', patch: { title: 'y' } },
      expected: 't3',
    },
    {
      name: 'LogProgress acts on its taskId',
      command: { _tag: CommandTag.LogProgress, taskId: 't4', remainingMinutes: 5 },
      expected: 't4',
    },
    {
      name: 'CompleteTask acts on its taskId',
      command: { _tag: CommandTag.CompleteTask, taskId: 't5', expect: expect_ },
      expected: 't5',
    },
    {
      name: 'DropTask acts on its taskId',
      command: { _tag: CommandTag.DropTask, taskId: 't6' },
      expected: 't6',
    },
    {
      name: 'AddBlocker acts on the blocked taskId, not the blocker',
      command: { _tag: CommandTag.AddBlocker, linkId: 'l1', taskId: 'blocked', blockerId: 'b1' },
      expected: 'blocked',
    },
    {
      name: 'RemoveBlocker acts on its linkId',
      command: { _tag: CommandTag.RemoveBlocker, linkId: 'l2' },
      expected: 'l2',
    },
    {
      name: 'CreateArea acts on its areaId',
      command: {
        _tag: CommandTag.CreateArea,
        areaId: 'a1',
        name: 'Home',
        activeHours: WORK_ACTIVE_HOURS,
        defaultPrivacy: Privacy.Visible,
      },
      expected: 'a1',
    },
    {
      name: 'UpdateArea acts on its areaId',
      command: { _tag: CommandTag.UpdateArea, areaId: 'a2', patch: { name: 'Away' } },
      expected: 'a2',
    },
    {
      name: 'ResolveReviewItem acts on its reviewItemId',
      command: { _tag: CommandTag.ResolveReviewItem, reviewItemId: 'r1' },
      expected: 'r1',
    },
    {
      name: 'SetTimeZone acts on the settings subject',
      command: { _tag: CommandTag.SetTimeZone, timeZone: 'Europe/Amsterdam' },
      expected: SETTINGS_SUBJECT,
    },
    {
      name: 'SetUrgencyWindow acts on the settings subject',
      command: { _tag: CommandTag.SetUrgencyWindow, days: 3 },
      expected: SETTINGS_SUBJECT,
    },
  ])('$name', ({ command, expected }) => {
    expect(commandSubject(command)).toBe(expected);
  });
});
