// SPDX-License-Identifier: MPL-2.0

import type { Instant } from '../time';
import { createArea, updateArea } from './area-commands';
import { addBlocker, removeBlocker } from './blocker-commands';
import { CommandTag, type Command, type DomainState, type TransitionResult } from './command';
import { resolveReviewItem } from './review-commands';
import { setTimeZone, setUrgencyWindow } from './settings-commands';
import {
  captureTask,
  completeTask,
  dropTask,
  editTask,
  logProgress,
  triageTask,
} from './task-commands';

export const applyCommand = (
  state: DomainState,
  command: Command,
  now: Instant,
): TransitionResult => {
  switch (command._tag) {
    case CommandTag.CaptureTask:
      return captureTask(state, command, now);
    case CommandTag.TriageTask:
      return triageTask(state, command, now);
    case CommandTag.EditTask:
      return editTask(state, command, now);
    case CommandTag.LogProgress:
      return logProgress(state, command, now);
    case CommandTag.CompleteTask:
      return completeTask(state, command, now);
    case CommandTag.DropTask:
      return dropTask(state, command, now);
    case CommandTag.AddBlocker:
      return addBlocker(state, command, now);
    case CommandTag.RemoveBlocker:
      return removeBlocker(state, command, now);
    case CommandTag.CreateArea:
      return createArea(state, command, now);
    case CommandTag.UpdateArea:
      return updateArea(state, command, now);
    case CommandTag.SetTimeZone:
      return setTimeZone(state, command, now);
    case CommandTag.SetUrgencyWindow:
      return setUrgencyWindow(state, command, now);
    case CommandTag.ResolveReviewItem:
      return resolveReviewItem(state, command, now);
    default:
      throw new Error(`Unknown command tag: ${String((command as { _tag?: unknown })._tag)}`);
  }
};
