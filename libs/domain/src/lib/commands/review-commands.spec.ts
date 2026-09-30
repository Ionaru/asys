// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aReviewItem, aState } from '../../test/builders';
import { resolveReviewItem } from './review-commands';
import { ChangeEntity, ChangeOp, CommandTag, RejectedReason, TransitionResultTag } from './command';

const now = Date.parse('2026-10-14T08:00:00.000Z');

const command = { _tag: CommandTag.ResolveReviewItem, reviewItemId: 'r1' } as const;

describe('resolveReviewItem', () => {
  it('stamps resolvedAt with now and keeps every other field', () => {
    const item = aReviewItem({ id: 'r1', dedupeKey: 'k', createdAt: 5 });
    expect(resolveReviewItem(aState({ reviewItems: [item] }), command, now)).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.ReviewItem,
          op: ChangeOp.Put,
          id: 'r1',
          after: { ...item, resolvedAt: now },
        },
      ],
    });
  });

  it('applies nothing for an already resolved item and keeps its first resolvedAt', () => {
    const item = aReviewItem({ id: 'r1', resolvedAt: Date.parse('2026-10-01T00:00:00.000Z') });
    expect(resolveReviewItem(aState({ reviewItems: [item] }), command, now)).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });

  it('rejects a missing item with not_found', () => {
    expect(resolveReviewItem(aState(), command, now)).toEqual({
      _tag: TransitionResultTag.Rejected,
      reason: RejectedReason.NotFound,
    });
  });
});
