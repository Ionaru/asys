// SPDX-License-Identifier: MIT

import type { Layer } from 'effect';
import { Effect, Schema } from 'effect';
import type { HttpRouter } from 'effect/http';
import type { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware } from 'effect/http-api';
import { HttpApiBuilder } from 'effect/http-api';
import type { PasskeyGroup } from '../api/group';
import type { PasskeyChallenges } from './challenges';
import type { PasskeyConfig } from './config';
import {
  beginAddPasskey,
  beginAuthentication,
  beginRegistration,
  finishAddPasskey,
  finishAuthentication,
  finishRegistration,
  listPasskeys,
  removePasskey,
  type RemovedPasskey,
  type VerifiedRegistration,
} from './ceremonies';
import type { PasskeyStore, StoredPasskey } from './store';
import type { PasskeyUnitOfWork } from './unit-of-work';

/**
 * The FindMyWay router skips path params over 100 characters, so `DELETE /passkeys/:credentialId`
 * would 404 for long credential ids. A host must pass this as `routerConfig` to
 * `HttpRouter.serve` and `HttpRouter.toWebHandler`.
 */
export const passkeyRouterConfig: { readonly maxParamLength: number } = { maxParamLength: 1366 };

type EndpointOf<Group, Identifier extends string> = HttpApiEndpoint.WithIdentifier<
  HttpApiGroup.Endpoints<Group>,
  Identifier
>;

type PayloadOf<Group, Identifier extends string> = HttpApiEndpoint.Payload<
  EndpointOf<Group, Identifier>
>['Type'];

type SuccessOf<Group, Identifier extends string> = HttpApiEndpoint.Success<
  EndpointOf<Group, Identifier>
>['Type'];

type ErrorOf<Group, Identifier extends string> = HttpApiEndpoint.Error<
  EndpointOf<Group, Identifier>
>['Type'];

/** Structural bound: anything `makePasskeyGroup` returned. */
export interface PasskeyGroupLike extends HttpApiGroup.Constraint {
  readonly endpoints: HttpApiGroup.Constraint['endpoints'] & {
    readonly registerOptions: HttpApiEndpoint.Constraint;
    readonly register: HttpApiEndpoint.Constraint;
    readonly authenticateOptions: HttpApiEndpoint.Constraint;
    readonly authenticate: HttpApiEndpoint.Constraint;
    readonly addOptions: HttpApiEndpoint.Constraint;
    readonly add: HttpApiEndpoint.Constraint;
    readonly list: HttpApiEndpoint.Constraint;
    readonly remove: HttpApiEndpoint.Constraint;
  };
}

/** The host's hooks. Payload, success and error types come from the group, so the host's schemas flow through. */
export interface PasskeyHooks<Group, R1, R2, R3, R4> {
  /**
   * Check the host's registerOptions payload and say who registers. The returned `userId`
   * must identify a new account, never an existing one.
   */
  readonly onRegisterBegin: (
    payload: PayloadOf<Group, 'registerOptions'>,
  ) => Effect.Effect<
    { readonly userId: string; readonly userName: string },
    ErrorOf<Group, 'registerOptions'>,
    R1
  >;
  /**
   * Create the account with its first passkey (and usually a session). The host must store
   * `registration.passkey` under a unique credential id (for example with
   * `PasskeyStore.createPasskey` inside its own transaction) and fail with
   * `PasskeyAlreadyRegistered` when it is a duplicate.
   */
  readonly onRegistered: (
    registration: VerifiedRegistration,
    payload: PayloadOf<Group, 'register'>,
  ) => Effect.Effect<SuccessOf<Group, 'register'>, ErrorOf<Group, 'register'>, R2>;
  /** Runs inside the unit of work, after the counter update; create the session. */
  readonly onAuthenticated: (
    passkey: StoredPasskey,
  ) => Effect.Effect<SuccessOf<Group, 'authenticate'>, ErrorOf<Group, 'authenticate'>, R3>;
  /** Optional; runs inside the removal's unit of work, on a protected endpoint. */
  readonly onRemoved?: (removed: RemovedPasskey) => Effect.Effect<void, never, R4>;
}

// The implementation is written against a concrete group with the host's schemas widened, because
// `HttpApiBuilder.group` cannot typecheck for a generic group. The identifier is passed as a string
// and the resulting layer is cast to the exact public type.
type ErasedGroup = PasskeyGroup<
  string,
  HttpApiMiddleware.AnyId,
  undefined,
  Record<never, never>,
  readonly [typeof Schema.Unknown],
  Record<never, never>,
  typeof Schema.Unknown,
  readonly [typeof Schema.Unknown],
  typeof Schema.Unknown,
  readonly [typeof Schema.Unknown]
>;

/* oxlint-disable typescript/no-explicit-any -- the erased hooks are cast back to the exact public types */
interface ErasedHooks {
  readonly onRegisterBegin: (
    payload: any,
  ) => Effect.Effect<{ readonly userId: string; readonly userName: string }, any, any>;
  readonly onRegistered: (
    registration: VerifiedRegistration,
    payload: any,
  ) => Effect.Effect<any, any, any>;
  readonly onAuthenticated: (passkey: StoredPasskey) => Effect.Effect<any, any, any>;
  readonly onRemoved?: (removed: RemovedPasskey) => Effect.Effect<void, never, any>;
}

const implement = (
  api: unknown,
  groupIdentifier: string,
  hooks: ErasedHooks,
  currentUserId: Effect.Effect<string, never, any>,
  recheckSession: Effect.Effect<void, any, any>,
) =>
  HttpApiBuilder.group(api as HttpApi.HttpApi<string, ErasedGroup>, groupIdentifier, (handlers) =>
    handlers
      .handle('registerOptions', ({ payload }) =>
        Effect.gen(function* () {
          const who = yield* hooks.onRegisterBegin(payload);
          return yield* beginRegistration(who);
        }),
      )
      .handle('register', ({ payload }) =>
        Effect.gen(function* () {
          const verified = yield* finishRegistration({
            challengeId: payload.challengeId,
            response: payload.response,
          });
          return yield* hooks.onRegistered(verified, payload);
        }),
      )
      .handle('authenticateOptions', () => beginAuthentication())
      .handle('authenticate', ({ payload }) =>
        finishAuthentication(
          { challengeId: payload.challengeId, response: payload.response },
          hooks.onAuthenticated,
        ),
      )
      .handle('addOptions', () =>
        Effect.gen(function* () {
          const userId = yield* currentUserId;
          return yield* beginAddPasskey(userId);
        }),
      )
      .handle('add', ({ payload }) =>
        Effect.gen(function* () {
          const userId = yield* currentUserId;
          return yield* finishAddPasskey(
            userId,
            { challengeId: payload.challengeId, response: payload.response, name: payload.name },
            recheckSession,
          );
        }),
      )
      .handle('list', () =>
        Effect.gen(function* () {
          const userId = yield* currentUserId;
          return yield* listPasskeys(userId);
        }),
      )
      .handle('remove', ({ params }) =>
        Effect.gen(function* () {
          const userId = yield* currentUserId;
          return yield* removePasskey(userId, params.credentialId, hooks.onRemoved, recheckSession);
        }),
      ),
  );

/* oxlint-enable typescript/no-explicit-any */

/**
 * Builds the handler layer for the passkey group inside the host's API. Serve it with
 * `HttpApiBuilder.layer(Api)` and pass `passkeyRouterConfig` as the router config.
 * The middleware's provides are excluded only from the requirements of `onRemoved` and
 * `recheckSession`, because the other hooks run on public endpoints where the middleware does
 * not run.
 */
export const makePasskeyHandlers = <
  ApiId extends string,
  Groups extends HttpApiGroup.Constraint,
  Group extends Groups & PasskeyGroupLike,
  R1 = never,
  R2 = never,
  R3 = never,
  R4 = never,
  R5 = never,
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  group: Group,
  options: {
    readonly hooks: PasskeyHooks<Group, R1, R2, R3, R4>;
    /** The signed-in user's id, read from the services the session middleware provides. */
    readonly currentUserId: Effect.Effect<
      string,
      never,
      HttpApiEndpoint.MiddlewareProvides<HttpApiGroup.Endpoints<Group>> | HttpRouter.Provided
    >;
    /**
     * Re-checks the signed-in session as the first step inside the unit of work of `add` and
     * `remove`, before anything is written. Its failure is the session middleware's error: it
     * rolls the unit back, and the endpoint answers with it as the middleware would. A host
     * whose unit of work takes the lock its session revocations take uses it to refuse a
     * request whose session was revoked while the request waited for that lock. It is required,
     * so a host cannot leave the re-check out by accident; one with nothing to re-check passes
     * `Effect.void`.
     */
    readonly recheckSession: Effect.Effect<
      void,
      HttpApiEndpoint.MiddlewareError<HttpApiGroup.Endpoints<Group>>,
      R5
    >;
  },
): Layer.Layer<
  HttpApiGroup.Service<ApiId, Group['identifier']>,
  never,
  | PasskeyConfig
  | PasskeyStore
  | PasskeyChallenges
  | PasskeyUnitOfWork
  | HttpApiEndpoint.Middleware<HttpApiGroup.Endpoints<Group>>
  | Exclude<R1 | R2 | R3, HttpRouter.Provided>
  | Exclude<
      R4 | R5,
      HttpRouter.Provided | HttpApiEndpoint.MiddlewareProvides<HttpApiGroup.Endpoints<Group>>
    >
> =>
  implement(
    api,
    group.identifier,
    options.hooks as ErasedHooks,
    options.currentUserId,
    options.recheckSession,
  ) as never;
