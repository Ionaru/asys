// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { COMMAND_NOT_APPLICABLE, type CommandRequest } from '@asys/contract';
import { CommandTag, NotApplicableReason, TaskStatus, type ReviewItem } from '@asys/domain';
import { assert, describe, it } from '@effect/vitest';
import { notApplicableReviewItem } from './not-applicable';

const NOW = 1_000_000;

describe('notApplicableReviewItem', () => {
  it('describes a failed DropTask expectation as a Review item about the task', () => {
    const id = randomUUID();
    const taskId = randomUUID();
    const request: CommandRequest = {
      _tag: CommandTag.DropTask,
      idempotencyKey: randomUUID(),
      taskId,
      expect: { status: TaskStatus.Open },
    };

    const item = notApplicableReviewItem(request, NotApplicableReason.ExpectationFailed, id, NOW);

    const expected: ReviewItem = {
      id,
      kind: COMMAND_NOT_APPLICABLE,
      subjects: [{ type: 'task', id: taskId }],
      payload: { command: request, reason: 'expectation_failed' },
      dedupeKey: null,
      createdAt: NOW,
      resolvedAt: null,
    };
    assert.deepStrictEqual(item, expected);
  });

  it('names the area as the subject for an UpdateArea', () => {
    const areaId = randomUUID();
    const request: CommandRequest = {
      _tag: CommandTag.UpdateArea,
      idempotencyKey: randomUUID(),
      areaId,
      patch: { name: 'Office' },
      expect: { version: 5 },
    };

    const item = notApplicableReviewItem(
      request,
      NotApplicableReason.ExpectationFailed,
      randomUUID(),
      NOW,
    );

    assert.deepStrictEqual(item.subjects, [{ type: 'area', id: areaId }]);
  });

  it('throws for a command the domain never reports as not applicable', () => {
    const request: CommandRequest = {
      _tag: CommandTag.SetTimeZone,
      idempotencyKey: randomUUID(),
      timeZone: 'Europe/London',
    };

    assert.throws(() =>
      notApplicableReviewItem(request, NotApplicableReason.ExpectationFailed, randomUUID(), NOW),
    );
  });
});
