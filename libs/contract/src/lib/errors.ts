// SPDX-License-Identifier: MPL-2.0

import { RejectedReason } from '@asys/domain';
import { Schema } from 'effect';

export class CommandRejected extends Schema.TaggedError<CommandRejected>()(
  'CommandRejected',
  {
    reason: Schema.Enum(RejectedReason),
  },
  { httpApiStatus: 422 },
) {}

export class IdempotencyKeyReused extends Schema.TaggedError<IdempotencyKeyReused>()(
  'IdempotencyKeyReused',
  {},
  { httpApiStatus: 409 },
) {}

export class ChangesExpired extends Schema.TaggedError<ChangesExpired>()(
  'ChangesExpired',
  {
    after: Schema.Int,
  },
  { httpApiStatus: 410 },
) {}

/** The Sign-up link is unknown, expired or already used. */
export class SignUpLinkInvalid extends Schema.TaggedError<SignUpLinkInvalid>()(
  'SignUpLinkInvalid',
  {},
  { httpApiStatus: 410 },
) {}

/** The recovery code is unknown, already used or malformed. */
export class SignInFailed extends Schema.TaggedError<SignInFailed>()(
  'SignInFailed',
  {},
  { httpApiStatus: 401 },
) {}
