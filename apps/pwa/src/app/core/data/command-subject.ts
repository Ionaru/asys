// SPDX-License-Identifier: EUPL-1.2
import { type Command, CommandTag } from '@asys/domain';

/** The subject of the settings commands in `awaitingSync`. */
export const SETTINGS_SUBJECT = 'settings';

/** The id a command acts on, used to disable that subject's actions until the store has synced. */
export const commandSubject = (command: Command): string => {
  switch (command._tag) {
    case CommandTag.CaptureTask:
    case CommandTag.TriageTask:
    case CommandTag.EditTask:
    case CommandTag.LogProgress:
    case CommandTag.CompleteTask:
    case CommandTag.DropTask:
    case CommandTag.AddBlocker:
      return command.taskId;
    case CommandTag.RemoveBlocker:
      return command.linkId;
    case CommandTag.CreateArea:
    case CommandTag.UpdateArea:
      return command.areaId;
    case CommandTag.ResolveReviewItem:
      return command.reviewItemId;
    case CommandTag.SetTimeZone:
    case CommandTag.SetUrgencyWindow:
      return SETTINGS_SUBJECT;
  }
};
