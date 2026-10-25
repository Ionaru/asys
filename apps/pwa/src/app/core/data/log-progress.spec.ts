// SPDX-License-Identifier: EUPL-1.2
import { CommandTag, TaskStatus } from '@asys/domain';

import { estimateNowText, logProgressCommand } from './log-progress';

describe('logProgressCommand', () => {
  it('lowers the Estimate of an Open Task to the minutes still needed', () => {
    expect(logProgressCommand('dentist', 15)).toEqual({
      _tag: CommandTag.LogProgress,
      taskId: 'dentist',
      remainingMinutes: 15,
      expect: { status: TaskStatus.Open },
    });
  });

  it('carries the Task id and the minutes it is given', () => {
    const command = logProgressCommand('t7', 1);

    expect(command.taskId).toBe('t7');
    expect(command.remainingMinutes).toBe(1);
  });
});

describe('estimateNowText', () => {
  it.each([
    [1, 'Estimate is now 1 min.'],
    [10, 'Estimate is now 10 min.'],
    [15, 'Estimate is now 15 min.'],
    [90, 'Estimate is now 1 h 30.'],
  ])('reads the Estimate of %s minutes as %j', (minutes, text) => {
    expect(estimateNowText(minutes)).toBe(text);
  });
});
