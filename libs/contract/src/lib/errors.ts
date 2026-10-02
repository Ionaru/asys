// SPDX-License-Identifier: MPL-2.0

import { RejectedReason } from '@asys/domain';
import { Schema } from 'effect';

export class CommandRejected extends Schema.TaggedError<CommandRejected>()('CommandRejected', {
  reason: Schema.Enum(RejectedReason),
}) {}

export class IdempotencyKeyReused extends Schema.TaggedError<IdempotencyKeyReused>()(
  'IdempotencyKeyReused',
  {},
) {}

export class ChangesExpired extends Schema.TaggedError<ChangesExpired>()('ChangesExpired', {
  after: Schema.Int,
}) {}
