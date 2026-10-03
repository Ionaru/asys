// SPDX-License-Identifier: MIT

import { Schema } from 'effect';

/** The challenge is unknown, expired or used, or belongs to another purpose or user (HTTP 400). */
export class PasskeyChallengeInvalid extends Schema.TaggedError<PasskeyChallengeInvalid>()(
  'PasskeyChallengeInvalid',
  {},
  { httpApiStatus: 400 },
) {}

/** The WebAuthn response did not verify (HTTP 401). */
export class PasskeyVerificationFailed extends Schema.TaggedError<PasskeyVerificationFailed>()(
  'PasskeyVerificationFailed',
  {},
  { httpApiStatus: 401 },
) {}

/** No stored passkey has that credential id (HTTP 404). */
export class PasskeyUnknownCredential extends Schema.TaggedError<PasskeyUnknownCredential>()(
  'PasskeyUnknownCredential',
  {},
  { httpApiStatus: 404 },
) {}

/** The credential id is already stored (HTTP 409). */
export class PasskeyAlreadyRegistered extends Schema.TaggedError<PasskeyAlreadyRegistered>()(
  'PasskeyAlreadyRegistered',
  {},
  { httpApiStatus: 409 },
) {}

/** Removing the user's only passkey is not allowed (HTTP 409). */
export class PasskeyLastCredential extends Schema.TaggedError<PasskeyLastCredential>()(
  'PasskeyLastCredential',
  {},
  { httpApiStatus: 409 },
) {}
