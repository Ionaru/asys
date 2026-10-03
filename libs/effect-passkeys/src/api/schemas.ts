// SPDX-License-Identifier: MIT

import { Schema } from 'effect';

const BASE64URL = /^[A-Za-z0-9_-]+$/;

const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** A non-empty base64url string of at most `max` characters. Its type stays `string`. */
export const Base64UrlSchema = (max: number) =>
  Schema.String.check(
    Schema.makeFilter(
      (value: string) => BASE64URL.test(value) && value.length >= 1 && value.length <= max,
    ),
  );

/** The browser's registration response. Unknown keys are stripped when decoding. */
export const RegistrationResponseSchema = Schema.Struct({
  id: Base64UrlSchema(1366),
  rawId: Base64UrlSchema(1366),
  type: Schema.Literal('public-key'),
  response: Schema.Struct({
    clientDataJSON: Base64UrlSchema(4096),
    attestationObject: Base64UrlSchema(16384),
    transports: Schema.optionalKey(
      Schema.Array(
        Schema.String.check(Schema.makeFilter((value: string) => value.length <= 32)),
      ).check(Schema.makeFilter((value: ReadonlyArray<string>) => value.length <= 8)),
    ),
  }),
  authenticatorAttachment: Schema.optionalKey(Schema.Literals(['platform', 'cross-platform'])),
});

export type RegistrationResponse = typeof RegistrationResponseSchema.Type;

/** The browser's authentication response. Unknown keys are stripped when decoding. */
export const AuthenticationResponseSchema = Schema.Struct({
  id: Base64UrlSchema(1366),
  rawId: Base64UrlSchema(1366),
  type: Schema.Literal('public-key'),
  response: Schema.Struct({
    clientDataJSON: Base64UrlSchema(4096),
    authenticatorData: Base64UrlSchema(4096),
    signature: Base64UrlSchema(1024),
    userHandle: Schema.optionalKey(Base64UrlSchema(128)),
  }),
  authenticatorAttachment: Schema.optionalKey(Schema.Literals(['platform', 'cross-platform'])),
});

export type AuthenticationResponse = typeof AuthenticationResponseSchema.Type;

/** WebAuthn options as the server produced them: an object that carries at least the challenge. */
export type PasskeyOptions = { readonly challenge: string; readonly [key: string]: unknown };

/**
 * Runtime `Schema.Any`, typed as a plain object. `Schema.Unknown`, `Schema.Json` and
 * `Schema.Record` refuse to JSON-encode undefined-valued keys (HttpApi then answers 400),
 * while `Schema.Any` drops them.
 */
export const PasskeyOptionsSchema: Schema.Codec<PasskeyOptions> = Schema.Any as never;

/** A challenge handle plus the options the browser needs to start a ceremony. */
export const PasskeyChallengeSchema = Schema.Struct({
  challengeId: Base64UrlSchema(512),
  options: PasskeyOptionsSchema,
});

export type PasskeyChallenge = typeof PasskeyChallengeSchema.Type;

/** A passkey name: at most 100 characters, not blank, no NUL and no unpaired surrogate. */
export const PasskeyNameSchema = Schema.String.check(
  Schema.makeFilter(
    (value: string) =>
      !value.includes('\u0000') &&
      !UNPAIRED_SURROGATE.test(value) &&
      value.trim().length >= 1 &&
      value.length <= 100,
  ),
);

/** A stored passkey as listed to its owner. Instants are epoch milliseconds. */
export const PasskeySchema = Schema.Struct({
  credentialId: Base64UrlSchema(1366),
  name: PasskeyNameSchema,
  createdAt: Schema.Int,
  lastUsedAt: Schema.NullOr(Schema.Int),
  backedUp: Schema.Boolean,
});

export type Passkey = typeof PasskeySchema.Type;
