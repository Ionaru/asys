// SPDX-License-Identifier: EUPL-1.2
import {
  COMMAND_NOT_APPLICABLE,
  CommandNotApplicablePayloadSchema,
  type CommandRequest,
} from '@asys/contract';
import { CommandTag, type Instant, type NotApplicableReason, type ReviewItem } from '@asys/domain';
import { Schema } from 'effect';

/**
 * The Review item recording that `request` no longer applied. Its subject is the request's
 * Task, or its Area for UpdateArea. Throws for a command the domain never reports as
 * NotApplicable.
 */
export const notApplicableReviewItem = (
  request: CommandRequest,
  reason: NotApplicableReason,
  id: string,
  now: Instant,
): ReviewItem => {
  const subject = ((): ReviewItem['subjects'][number] => {
    switch (request._tag) {
      case CommandTag.TriageTask:
      case CommandTag.EditTask:
      case CommandTag.LogProgress:
      case CommandTag.CompleteTask:
      case CommandTag.DropTask:
        return { type: 'task', id: request.taskId };
      case CommandTag.UpdateArea:
        return { type: 'area', id: request.areaId };
      default:
        throw new Error(`Command ${request._tag} is never not applicable`);
    }
  })();

  return {
    id,
    kind: COMMAND_NOT_APPLICABLE,
    subjects: [subject],
    payload: Schema.encodeSync(CommandNotApplicablePayloadSchema)({ command: request, reason }),
    dedupeKey: null,
    createdAt: now,
    resolvedAt: null,
  };
};
