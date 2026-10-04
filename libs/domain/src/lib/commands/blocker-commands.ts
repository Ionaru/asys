// SPDX-License-Identifier: MPL-2.0

import { waitsFor } from '../task';
import type { Instant } from '../time';
import {
  ChangeEntity,
  ChangeOp,
  RejectedReason,
  TransitionResultTag,
  type AddBlocker,
  type DomainState,
  type RemoveBlocker,
  type TransitionResult,
} from './command';

const rejected = (
  reason:
    | RejectedReason.SelfLink
    | RejectedReason.NotFound
    | RejectedReason.DuplicateId
    | RejectedReason.DuplicateLink
    | RejectedReason.Cycle,
) => ({ _tag: TransitionResultTag.Rejected, reason }) as const satisfies TransitionResult;

export const addBlocker = (
  state: DomainState,
  command: AddBlocker,
  _now: Instant,
): TransitionResult => {
  const { linkId, taskId, blockerId } = command;
  if (taskId === blockerId) return rejected(RejectedReason.SelfLink);
  if (!state.tasks.some((t) => t.id === taskId)) return rejected(RejectedReason.NotFound);
  if (!state.tasks.some((t) => t.id === blockerId)) return rejected(RejectedReason.NotFound);
  if (state.links.some((l) => l.id === linkId)) return rejected(RejectedReason.DuplicateId);
  if (state.links.some((l) => l.taskId === taskId && l.blockerId === blockerId)) {
    return rejected(RejectedReason.DuplicateLink);
  }
  if (waitsFor(state.links, blockerId, taskId)) return rejected(RejectedReason.Cycle);
  return {
    _tag: TransitionResultTag.Applied,
    changes: [
      {
        entity: ChangeEntity.Blocker,
        op: ChangeOp.Put,
        id: linkId,
        after: { id: linkId, taskId, blockerId },
      },
    ],
  };
};

export const removeBlocker = (
  state: DomainState,
  command: RemoveBlocker,
  _now: Instant,
): TransitionResult => {
  if (!state.links.some((l) => l.id === command.linkId)) return rejected(RejectedReason.NotFound);
  return {
    _tag: TransitionResultTag.Applied,
    changes: [{ entity: ChangeEntity.Blocker, op: ChangeOp.Remove, id: command.linkId }],
  };
};
