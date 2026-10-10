// SPDX-License-Identifier: MIT

import { Context, Effect, type Layer } from 'effect';
import { HttpApiError } from 'effect/http-api';
import { expectTypeOf, test } from 'vitest';
import {
  SampleApi,
  SampleAuth,
  SampleGone,
  SamplePasskeys,
  SampleUser,
} from '../api/sample-api.fixture';
import { PasskeyChallenges } from './challenges';
import { PasskeyConfig } from './config';
import { makePasskeyHandlers } from './handlers';
import { PasskeyStore } from './store';
import { PasskeyUnitOfWork } from './unit-of-work';

class Foo extends Context.Service<Foo, { readonly value: string }>()('test/Foo') {}

type Base = PasskeyConfig | PasskeyStore | PasskeyChallenges | PasskeyUnitOfWork | SampleAuth;

const currentUserId = SampleUser.useSync((user) => user.id);

const onRegisterBegin = () => Effect.succeed({ userId: 'u', userName: 'n' });

const onRegistered = () => Effect.succeed({ ok: true });

const onAuthenticated = () => Effect.succeed({ name: 'n' });

test('hooks without services leave only the library services and the middleware', () => {
  const layer = makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: { onRegisterBegin, onRegistered, onAuthenticated },
    currentUserId,
  });

  expectTypeOf<Layer.Services<typeof layer>>().toEqualTypeOf<Base>();
});

test('a hook that needs a service adds it to the requirements', () => {
  const layer = makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: {
      onRegisterBegin: () => Foo.useSync(() => ({ userId: 'u', userName: 'n' })),
      onRegistered,
      onAuthenticated,
    },
    currentUserId,
  });

  expectTypeOf<Layer.Services<typeof layer>>().toEqualTypeOf<Base | Foo>();
});

test('onAuthenticated keeps the middleware service in the requirements, onRemoved does not', () => {
  const authenticated = makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: {
      onRegisterBegin,
      onRegistered,
      onAuthenticated: () => SampleUser.useSync((user) => ({ name: user.id })),
    },
    currentUserId,
  });
  const removed = makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: {
      onRegisterBegin,
      onRegistered,
      onAuthenticated,
      onRemoved: () => SampleUser.useSync(() => undefined),
    },
    currentUserId,
  });

  expectTypeOf<Layer.Services<typeof authenticated>>().toEqualTypeOf<Base | SampleUser>();
  expectTypeOf<Layer.Services<typeof removed>>().toEqualTypeOf<Base>();
});

test('recheckSession adds its services to the requirements, less the middleware service', () => {
  const layer = makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: { onRegisterBegin, onRegistered, onAuthenticated },
    currentUserId,
    recheckSession: Effect.gen(function* () {
      yield* SampleUser;
      yield* Foo;
      return yield* Effect.fail(new HttpApiError.Unauthorized({}));
    }),
  });

  expectTypeOf<Layer.Services<typeof layer>>().toEqualTypeOf<Base | Foo>();
});

// oxlint-disable-next-line vitest/expect-expect -- the @ts-expect-error lines are the assertions
test('hooks and recheckSession must match the group success and error types', () => {
  makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: {
      onRegisterBegin,
      // @ts-expect-error the register success type is { ok: boolean }
      onRegistered: () => Effect.succeed({ ok: 'yes' }),
      onAuthenticated,
    },
    currentUserId,
  });

  makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: {
      onRegisterBegin,
      // @ts-expect-error Error is not a declared register error
      onRegistered: () => Effect.fail(new Error('undeclared')),
      onAuthenticated,
    },
    currentUserId,
  });

  makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: { onRegisterBegin, onRegistered, onAuthenticated },
    currentUserId,
    // @ts-expect-error recheckSession may fail only with the session middleware's error
    recheckSession: Effect.fail(new SampleGone({})),
  });
});
