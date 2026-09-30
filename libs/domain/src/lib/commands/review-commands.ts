// SPDX-License-Identifier: MPL-2.0

import type { Instant } from '../time';
import {
  ChangeEntity,
  ChangeOp,
  RejectedReason,
  TransitionResultTag,
  type DomainState,
  type ResolveReviewItem,
  type TransitionResult,
} from './command';

export const resolveReviewItem = (
  state: DomainState,
  command: ResolveReviewItem,
  now: Instant,
): TransitionResult => {
  const item = state.reviewItems.find((r) => r.id === command.reviewItemId);
  if (item === undefined)
    return { _tag: TransitionResultTag.Rejected, reason: RejectedReason.NotFound };
  // Idempotent: resolvedAt keeps its first value.
  if (item.resolvedAt !== null) return { _tag: TransitionResultTag.Applied, changes: [] };
  return {
    _tag: TransitionResultTag.Applied,
    changes: [
      {
        entity: ChangeEntity.ReviewItem,
        op: ChangeOp.Put,
        id: item.id,
        after: { ...item, resolvedAt: now },
      },
    ],
  };
};
