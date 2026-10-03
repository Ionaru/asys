// SPDX-License-Identifier: MPL-2.0

import { isValidTimeZone } from '@asys/domain';
import { Context, Schema } from 'effect';
import { HttpApiError, HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api';

import { TextSchema } from './primitives';

/** Name of the session cookie. The `__Host-` prefix pins it to the origin, path `/` and Secure. */
export const SESSION_COOKIE = '__Host-asys_session';

/** The authenticated Owner of the current request, provided by the `Authentication` middleware. */
export class CurrentOwner extends Context.Service<
  CurrentOwner,
  { readonly ownerId: string; readonly sessionId: string }
>()('asys/CurrentOwner') {}

/** Cookie-session middleware: fails with `Unauthorized` and provides the `CurrentOwner`. */
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentOwner }
>()('asys/Authentication', {
  error: HttpApiError.Unauthorized,
  security: { session: HttpApiSecurity.apiKey({ key: SESSION_COOKIE, in: 'cookie' }) },
}) {}

const SIGN_UP_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A Sign-up token: exactly 43 base64url characters. */
export const SignUpTokenSchema = Schema.String.check(
  Schema.makeFilter((value: string) => SIGN_UP_TOKEN.test(value)),
);

/** An Owner's display name: text, 1 to 100 characters, not blank. */
export const NameSchema = TextSchema.check(
  Schema.makeFilter((value: string) => value.trim().length >= 1 && value.length <= 100),
);

/** An IANA time zone identifier of at most 64 characters. */
export const TimeZoneSchema = TextSchema.check(
  Schema.makeFilter((value: string) => value.length <= 64 && isValidTimeZone(value)),
);

/** A recovery code as typed by the Owner: text of at most 64 characters. */
export const RecoveryCodeInputSchema = TextSchema.check(
  Schema.makeFilter((value: string) => value.length <= 64),
);

/** The signed-in Owner as the client sees them. */
export const MeSchema = Schema.Struct({ name: TextSchema, recoveryCodesLeft: Schema.Int }).annotate(
  { identifier: 'Me' },
);

export type Me = typeof MeSchema.Type;

/** A freshly generated set of recovery codes, shown once. */
export const RecoveryCodesSchema = Schema.Struct({
  recoveryCodes: Schema.Array(Schema.String),
}).annotate({ identifier: 'RecoveryCodes' });

export type RecoveryCodes = typeof RecoveryCodesSchema.Type;

/** The answer to a successful recovery sign-in. */
export const RecoverResultSchema = Schema.Struct({ recoveryCodesLeft: Schema.Int }).annotate({
  identifier: 'RecoverResult',
});

export type RecoverResult = typeof RecoverResultSchema.Type;

/** The health probe's answer. */
export const HealthSchema = Schema.Struct({
  status: Schema.Literal('ok'),
  oldestDueJobAgeSeconds: Schema.Finite,
  failingJobs: Schema.Int,
}).annotate({ identifier: 'Health' });

export type Health = typeof HealthSchema.Type;
