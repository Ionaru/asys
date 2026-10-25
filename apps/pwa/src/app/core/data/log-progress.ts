// SPDX-License-Identifier: EUPL-1.2
import { CommandTag, formatMinutes, type LogProgress, TaskStatus } from '@asys/domain';

/** The Command that lowers an Open Task's Estimate to the time still needed. */
export const logProgressCommand = (taskId: string, minutes: number): LogProgress => ({
  _tag: CommandTag.LogProgress,
  taskId,
  remainingMinutes: minutes,
  expect: { status: TaskStatus.Open },
});

/** The confirmation that follows a saved Log progress. */
export const estimateNowText = (minutes: number): string =>
  `Estimate is now ${formatMinutes(minutes)}.`;
