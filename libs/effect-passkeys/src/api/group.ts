// SPDX-License-Identifier: MIT

import type { Context } from 'effect';
import { Schema } from 'effect';
import type { HttpApiMiddleware } from 'effect/http-api';
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';

import {
  PasskeyAlreadyRegistered,
  PasskeyChallengeInvalid,
  PasskeyLastCredential,
  PasskeyUnknownCredential,
  PasskeyVerificationFailed,
} from './errors';
import {
  AuthenticationResponseSchema,
  Base64UrlSchema,
  PasskeyChallengeSchema,
  PasskeyNameSchema,
  PasskeySchema,
  RegistrationResponseSchema,
} from './schemas';

type PathPrefix = `/${string}`;

type NoErrors = readonly [];

type Json<S> = [S] extends [never]
  ? never
  : S extends Schema.Constraint
    ? Schema.toCodecJson<S>
    : never;

type JsonErrors<Errors extends ReadonlyArray<Schema.Top>> = Json<Errors[number]>;

const authenticatePayloadFields = {
  challengeId: Base64UrlSchema(512),
  response: AuthenticationResponseSchema,
} as const;

const registerPayloadFields = {
  challengeId: Base64UrlSchema(512),
  response: RegistrationResponseSchema,
} as const;

type AuthenticatePayloadFields = typeof authenticatePayloadFields;

type RegisterPayloadFields = typeof registerPayloadFields;

// Explicit endpoint types. HttpApiEndpoint's `error` option guards against stream schemas with a
// deferred conditional that cannot resolve for a generic host error list (TS2769), so the
// host-parametrised endpoints are built with `error: ... as never` and cast to these types,
// which mirror what the overload would return.
type Endpoint<
  Identifier extends string,
  Method extends 'POST' | 'GET' | 'DELETE',
  Path extends string,
  Params extends Schema.Top,
  Payload extends Schema.Top,
  Success extends Schema.Top,
  Error extends Schema.Top,
> = HttpApiEndpoint.HttpApiEndpoint<
  Identifier,
  Method,
  Path,
  Params,
  never,
  Payload,
  never,
  Success,
  Error
>;

/** `POST /register/options`: starts a registration ceremony; the host adds payload fields and errors. */
export type RegisterOptionsEndpoint<
  Fields extends Schema.Struct.Fields,
  Errors extends ReadonlyArray<Schema.Top>,
> = Endpoint<
  'registerOptions',
  'POST',
  '/register/options',
  never,
  Schema.toCodecJson<Schema.Struct<Fields>>,
  Schema.toCodecJson<typeof PasskeyChallengeSchema>,
  JsonErrors<Errors>
>;

/** `POST /register`: finishes a registration ceremony; the host adds payload fields, success and errors. */
export type RegisterEndpoint<
  Fields extends Schema.Struct.Fields,
  Success extends Schema.Top,
  Errors extends ReadonlyArray<Schema.Top>,
> = Endpoint<
  'register',
  'POST',
  '/register',
  never,
  Schema.toCodecJson<Schema.Struct<Fields & RegisterPayloadFields>>,
  Schema.toCodecJson<Success>,
  Schema.toCodecJson<
    | typeof PasskeyChallengeInvalid
    | typeof PasskeyVerificationFailed
    | typeof PasskeyAlreadyRegistered
    | Errors[number]
  >
>;

/** `POST /authenticate/options`: starts an authentication ceremony. */
export type AuthenticateOptionsEndpoint = Endpoint<
  'authenticateOptions',
  'POST',
  '/authenticate/options',
  never,
  never,
  Schema.toCodecJson<typeof PasskeyChallengeSchema>,
  never
>;

/** `POST /authenticate`: finishes an authentication ceremony; the host adds success and errors. */
export type AuthenticateEndpoint<
  Success extends Schema.Top,
  Errors extends ReadonlyArray<Schema.Top>,
> = Endpoint<
  'authenticate',
  'POST',
  '/authenticate',
  never,
  Schema.toCodecJson<Schema.Struct<AuthenticatePayloadFields>>,
  Schema.toCodecJson<Success>,
  Schema.toCodecJson<
    | typeof PasskeyChallengeInvalid
    | typeof PasskeyVerificationFailed
    | typeof PasskeyUnknownCredential
    | Errors[number]
  >
>;

/** The protected endpoints, concretely typed (nothing generic except the middleware id). */
const protectedEndpoints = <I extends HttpApiMiddleware.AnyId, S>(session: Context.Key<I, S>) => {
  const addOptions = HttpApiEndpoint.post('addOptions', '/passkeys/options', {
    success: PasskeyChallengeSchema,
  }).middleware(session);

  const add = HttpApiEndpoint.post('add', '/passkeys', {
    payload: Schema.Struct({
      ...registerPayloadFields,
      name: Schema.optionalKey(PasskeyNameSchema),
    }),
    success: PasskeySchema.pipe(HttpApiSchema.status(201)),
    error: [PasskeyChallengeInvalid, PasskeyVerificationFailed, PasskeyAlreadyRegistered],
  }).middleware(session);

  const list = HttpApiEndpoint.get('list', '/passkeys', {
    success: Schema.Array(PasskeySchema),
  }).middleware(session);

  const remove = HttpApiEndpoint.delete('remove', '/passkeys/:credentialId', {
    params: { credentialId: Base64UrlSchema(1366) },
    error: [PasskeyUnknownCredential, PasskeyLastCredential],
  }).middleware(session);

  return [addOptions, add, list, remove] as const;
};

type ProtectedEndpoints<I extends HttpApiMiddleware.AnyId> = ReturnType<
  typeof protectedEndpoints<I, unknown>
>[number];

type PrefixedEndpoints<Endpoints, Prefix extends PathPrefix | undefined> = Prefix extends PathPrefix
  ? HttpApiEndpoint.AddPrefix<Endpoints, Prefix>
  : Endpoints;

/** What the host customises: an optional path prefix and the host-owned parts of the four ceremony endpoints. */
export interface PasskeyGroupOptions<
  Prefix extends PathPrefix | undefined,
  RegisterBeginFields extends Schema.Struct.Fields,
  RegisterBeginErrors extends ReadonlyArray<Schema.Top>,
  RegisterFinishFields extends Schema.Struct.Fields,
  RegisterFinishSuccess extends Schema.Top,
  RegisterFinishErrors extends ReadonlyArray<Schema.Top>,
  AuthFinishSuccess extends Schema.Top,
  AuthFinishErrors extends ReadonlyArray<Schema.Top>,
> {
  /** Optional path prefix, for example `/v1/auth`. */
  readonly prefix?: Prefix;
  /** Host fields added to the `registerOptions` payload (sign-up token, display name...). */
  readonly registerBegin?: RegisterBeginFields;
  /** Host errors `registerOptions` may fail with. */
  readonly registerBeginErrors?: RegisterBeginErrors;
  /** Host fields added to the `register` payload. */
  readonly registerFinish?: RegisterFinishFields;
  /** What `register` answers with on success. */
  readonly registerFinishSuccess: RegisterFinishSuccess;
  /** Host errors `register` may fail with, after the library's own. */
  readonly registerFinishErrors?: RegisterFinishErrors;
  /** What `authenticate` answers with on success. */
  readonly authFinishSuccess: AuthFinishSuccess;
  /** Host errors `authenticate` may fail with, after the library's own. */
  readonly authFinishErrors?: AuthFinishErrors;
}

/** The group type the factory returns. Endpoint identifiers are fixed, the group identifier is the host's. */
export type PasskeyGroup<
  Id extends string,
  I extends HttpApiMiddleware.AnyId,
  Prefix extends PathPrefix | undefined,
  RegisterBeginFields extends Schema.Struct.Fields,
  RegisterBeginErrors extends ReadonlyArray<Schema.Top>,
  RegisterFinishFields extends Schema.Struct.Fields,
  RegisterFinishSuccess extends Schema.Top,
  RegisterFinishErrors extends ReadonlyArray<Schema.Top>,
  AuthFinishSuccess extends Schema.Top,
  AuthFinishErrors extends ReadonlyArray<Schema.Top>,
> = HttpApiGroup.HttpApiGroup<
  Id,
  PrefixedEndpoints<
    | RegisterOptionsEndpoint<RegisterBeginFields, RegisterBeginErrors>
    | RegisterEndpoint<RegisterFinishFields, RegisterFinishSuccess, RegisterFinishErrors>
    | AuthenticateOptionsEndpoint
    | AuthenticateEndpoint<AuthFinishSuccess, AuthFinishErrors>
    | ProtectedEndpoints<I>,
    Prefix
  >
>;

/**
 * Builds the passkey `HttpApiGroup`: four public ceremony endpoints and four endpoints
 * (`addOptions`, `add`, `list`, `remove`) protected by the host's `session` middleware tag.
 * Host payload fields are spread before the library's, so `challengeId` and `response` cannot be shadowed.
 * The prefix is applied last, after every endpoint is added.
 */
export const makePasskeyGroup = <
  const Id extends string,
  I extends HttpApiMiddleware.AnyId,
  S,
  const Prefix extends PathPrefix | undefined = undefined,
  RegisterBeginFields extends Schema.Struct.Fields = Record<never, never>,
  const RegisterBeginErrors extends ReadonlyArray<Schema.Top> = NoErrors,
  RegisterFinishFields extends Schema.Struct.Fields = Record<never, never>,
  RegisterFinishSuccess extends Schema.Top = typeof Schema.Void,
  const RegisterFinishErrors extends ReadonlyArray<Schema.Top> = NoErrors,
  AuthFinishSuccess extends Schema.Top = typeof Schema.Void,
  const AuthFinishErrors extends ReadonlyArray<Schema.Top> = NoErrors,
>(
  identifier: Id,
  session: Context.Key<I, S>,
  options: PasskeyGroupOptions<
    Prefix,
    RegisterBeginFields,
    RegisterBeginErrors,
    RegisterFinishFields,
    RegisterFinishSuccess,
    RegisterFinishErrors,
    AuthFinishSuccess,
    AuthFinishErrors
  >,
): PasskeyGroup<
  Id,
  I,
  Prefix,
  RegisterBeginFields,
  RegisterBeginErrors,
  RegisterFinishFields,
  RegisterFinishSuccess,
  RegisterFinishErrors,
  AuthFinishSuccess,
  AuthFinishErrors
> => {
  const registerOptions = HttpApiEndpoint.post('registerOptions', '/register/options', {
    payload: Schema.Struct(options.registerBegin ?? {}),
    success: PasskeyChallengeSchema,
    error: (options.registerBeginErrors ?? []) as never,
  });

  const register = HttpApiEndpoint.post('register', '/register', {
    payload: Schema.Struct({ ...options.registerFinish, ...registerPayloadFields }),
    success: options.registerFinishSuccess,
    error: [
      PasskeyChallengeInvalid,
      PasskeyVerificationFailed,
      PasskeyAlreadyRegistered,
      ...(options.registerFinishErrors ?? []),
    ] as never,
  });

  const authenticateOptions = HttpApiEndpoint.post('authenticateOptions', '/authenticate/options', {
    success: PasskeyChallengeSchema,
  });

  const authenticate = HttpApiEndpoint.post('authenticate', '/authenticate', {
    payload: Schema.Struct(authenticatePayloadFields),
    success: options.authFinishSuccess,
    error: [
      PasskeyChallengeInvalid,
      PasskeyVerificationFailed,
      PasskeyUnknownCredential,
      ...(options.authFinishErrors ?? []),
    ] as never,
  });

  const group = HttpApiGroup.make(identifier).add(
    registerOptions,
    register,
    authenticateOptions,
    authenticate,
    ...protectedEndpoints(session),
  );

  return (options.prefix === undefined ? group : group.prefix(options.prefix)) as never;
};
