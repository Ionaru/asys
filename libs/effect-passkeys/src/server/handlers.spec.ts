// SPDX-License-Identifier: MIT

import { Effect, Layer, Redacted } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { HttpApiBuilder, HttpApiError, HttpApiSecurity } from 'effect/http-api';
import { describe, expect, it } from 'vitest';
import type { PasskeyOptions } from '../api/schemas';
import {
  SampleApi,
  SampleAuth,
  SampleGone,
  SamplePasskeys,
  SampleUser,
} from '../api/sample-api.fixture';
import { makeMemoryPasskeyStore } from '../testing/memory-store';
import { makeSoftAuthenticator, type SoftCredential } from '../testing/soft-authenticator';
import { PasskeyChallenges } from './challenges';
import { PasskeyConfig } from './config';
import type { RemovedPasskey, VerifiedRegistration } from './ceremonies';
import { makePasskeyHandlers, passkeyRouterConfig } from './handlers';
import { PasskeyUnitOfWork } from './unit-of-work';

const origin = 'http://localhost:4200';

const sessionKey = HttpApiSecurity.apiKey({ key: 'sid', in: 'cookie' });

const authLayer = Layer.succeed(SampleAuth)({
  session: (httpEffect, { credential }) => {
    const id = Redacted.value(credential);

    return id === ''
      ? Effect.fail(new HttpApiError.Unauthorized({}))
      : Effect.provideService(httpEffect, SampleUser, { id });
  },
});

interface Challenge {
  readonly challengeId: string;
  readonly options: PasskeyOptions;
}

interface Reply {
  readonly status: number;
  readonly headers: Headers;
  readonly body: unknown;
}

interface SendOptions {
  readonly body?: unknown;
  readonly cookie?: string;
}

const makeHarness = () => {
  const store = makeMemoryPasskeyStore();
  store.userNames.set('user-1', 'Ann');

  const registerBeginPayloads: Array<unknown> = [];
  const registered: Array<{ verified: VerifiedRegistration; payload: unknown }> = [];
  const removed: Array<{ removed: RemovedPasskey; sawUser: string }> = [];

  const handlers = makePasskeyHandlers(SampleApi, SamplePasskeys, {
    hooks: {
      onRegisterBegin: (payload) =>
        payload.token === 'gone'
          ? Effect.fail(new SampleGone({}))
          : Effect.sync(() => {
              registerBeginPayloads.push(payload);

              return { userId: 'user-1', userName: 'Ann' };
            }),
      onRegistered: (verified, payload) =>
        Effect.gen(function* () {
          registered.push({ verified, payload });
          store.passkeys.set(verified.passkey.credentialId, verified.passkey);
          yield* HttpApiBuilder.securitySetCookie(sessionKey, 'user-1');

          return { ok: true };
        }),
      onAuthenticated: () => Effect.succeed({ name: 'Ann' }),
      onRemoved: (removal) =>
        Effect.gen(function* () {
          const user = yield* SampleUser;
          removed.push({ removed: removal, sawUser: user.id });
        }),
    },
    currentUserId: SampleUser.useSync((user) => user.id),
  });

  const app = HttpApiBuilder.layer(SampleApi).pipe(
    Layer.provide(handlers),
    Layer.provide([
      authLayer,
      PasskeyConfig.layer({
        rpId: 'localhost',
        rpName: 'Test',
        origin,
        keepLastPasskey: true,
        defaultPasskeyName: 'Passkey',
      }),
      PasskeyChallenges.memory(),
      store.layer,
      PasskeyUnitOfWork.none,
    ]),
    Layer.provide(HttpServer.layerServices),
  );

  const web = HttpRouter.toWebHandler(app, {
    disableLogger: true,
    routerConfig: passkeyRouterConfig,
  });

  const send = async (method: string, path: string, options: SendOptions = {}): Promise<Reply> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.cookie !== undefined) {
      headers['cookie'] = options.cookie;
    }
    const response = await web.handler(
      new Request(`http://localhost${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    );
    const text = await response.text();

    return {
      status: response.status,
      headers: response.headers,
      body: text === '' ? undefined : (JSON.parse(text) as unknown),
    };
  };

  const authenticator = makeSoftAuthenticator({ origin, rpId: 'localhost' });

  const registerUser = async (): Promise<SoftCredential> => {
    const begin = await send('POST', '/v1/auth/register/options', { body: { token: 'ok' } });
    const challenge = begin.body as Challenge;
    const { response, credential } = authenticator.register(challenge.options);
    const finish = await send('POST', '/v1/auth/register', {
      body: { token: 'ok', challengeId: challenge.challengeId, response },
    });
    expect(finish.status).toBe(200);

    return credential;
  };

  const addPasskey = async (
    name: string,
    credentialIdLength?: number,
  ): Promise<{ readonly reply: Reply; readonly credential: SoftCredential }> => {
    const cookie = 'sid=user-1';
    const begin = await send('POST', '/v1/auth/passkeys/options', { cookie });
    expect(begin.status).toBe(200);
    const challenge = begin.body as Challenge;
    const { response, credential } = authenticator.register(
      challenge.options,
      credentialIdLength === undefined ? {} : { credentialIdLength },
    );
    const reply = await send('POST', '/v1/auth/passkeys', {
      cookie,
      body: { challengeId: challenge.challengeId, response, name },
    });

    return { reply, credential };
  };

  return {
    ...web,
    send,
    store,
    authenticator,
    registerBeginPayloads,
    registered,
    removed,
    registerUser,
    addPasskey,
  };
};

type Harness = ReturnType<typeof makeHarness>;

const withHarness = async (test: (harness: Harness) => Promise<void>): Promise<void> => {
  const harness = makeHarness();

  try {
    await test(harness);
  } finally {
    await harness.dispose();
  }
};

describe('registration', () => {
  it('registerOptions returns a challenge and hands the payload to the hook', () =>
    withHarness(async ({ send, registerBeginPayloads }) => {
      const reply = await send('POST', '/v1/auth/register/options', { body: { token: 'ok' } });
      const body = reply.body as Challenge;

      expect(reply.status).toBe(200);
      expect(typeof body.challengeId).toBe('string');
      expect(body.options.challenge).toBe(body.challengeId);
      expect(registerBeginPayloads).toEqual([{ token: 'ok' }]);
    }));

  it('registerOptions maps a hook failure to its declared status', () =>
    withHarness(async ({ send }) => {
      const gone = await send('POST', '/v1/auth/register/options', { body: { token: 'gone' } });

      expect(gone.status).toBe(410);
      expect(gone.body).toEqual({ _tag: 'SampleGone' });
    }));

  it('registerOptions rejects a payload without the host fields with 400', () =>
    withHarness(async ({ send }) => {
      const reply = await send('POST', '/v1/auth/register/options', { body: {} });

      expect(reply.status).toBe(400);
    }));

  it('register verifies the response, calls onRegistered and lets it set the session cookie', () =>
    withHarness(async ({ send, authenticator, registered }) => {
      const begin = await send('POST', '/v1/auth/register/options', { body: { token: 'ok' } });
      const challenge = begin.body as Challenge;
      const { response, credential } = authenticator.register(challenge.options);

      const reply = await send('POST', '/v1/auth/register', {
        body: { token: 'ok', challengeId: challenge.challengeId, response },
      });

      expect(reply.status).toBe(200);
      expect(reply.body).toEqual({ ok: true });
      expect(reply.headers.get('set-cookie')?.startsWith('sid=user-1')).toBe(true);
      expect(registered).toHaveLength(1);
      expect(registered[0]?.verified.userId).toBe('user-1');
      expect(registered[0]?.verified.passkey.credentialId).toBe(credential.id);
      expect(registered[0]?.payload).toMatchObject({
        token: 'ok',
        challengeId: challenge.challengeId,
      });
    }));
});

describe('registration payload', () => {
  it('register without the host token gives 400', () =>
    withHarness(async ({ send, authenticator }) => {
      const begin = await send('POST', '/v1/auth/register/options', { body: { token: 'ok' } });
      const challenge = begin.body as Challenge;
      const { response } = authenticator.register(challenge.options);

      const reply = await send('POST', '/v1/auth/register', {
        body: { challengeId: challenge.challengeId, response },
      });

      expect(reply.status).toBe(400);
    }));
});

describe('authentication', () => {
  it('authenticateOptions returns 200 with real options', () =>
    withHarness(async ({ send }) => {
      const reply = await send('POST', '/v1/auth/authenticate/options', { body: {} });
      const body = reply.body as Challenge;

      expect(reply.status).toBe(200);
      expect(body.options.challenge).toBe(body.challengeId);
    }));

  it('authenticate runs onAuthenticated and returns its result', () =>
    withHarness(async ({ send, authenticator, registerUser }) => {
      const credential = await registerUser();
      const begin = await send('POST', '/v1/auth/authenticate/options', { body: {} });
      const challenge = begin.body as Challenge;
      const response = authenticator.authenticate(challenge.options, credential);

      const reply = await send('POST', '/v1/auth/authenticate', {
        body: { challengeId: challenge.challengeId, response },
      });

      expect(reply.status).toBe(200);
      expect(reply.body).toEqual({ name: 'Ann' });
    }));

  it('authenticate with an unknown credential id gives 404', () =>
    withHarness(async ({ send, authenticator, registerUser }) => {
      const credential = await registerUser();
      const begin = await send('POST', '/v1/auth/authenticate/options', { body: {} });
      const challenge = begin.body as Challenge;
      const unknownId = Buffer.alloc(16, 7).toString('base64url');
      const response = {
        ...authenticator.authenticate(challenge.options, credential),
        id: unknownId,
        rawId: unknownId,
      };

      const reply = await send('POST', '/v1/auth/authenticate', {
        body: { challengeId: challenge.challengeId, response },
      });

      expect(reply.status).toBe(404);
      expect(reply.body).toEqual({ _tag: 'PasskeyUnknownCredential' });
    }));

  it('authenticate rejects a replayed body with 400', () =>
    withHarness(async ({ send, authenticator, registerUser }) => {
      const credential = await registerUser();
      const begin = await send('POST', '/v1/auth/authenticate/options', { body: {} });
      const challenge = begin.body as Challenge;
      const body = {
        challengeId: challenge.challengeId,
        response: authenticator.authenticate(challenge.options, credential),
      };

      const first = await send('POST', '/v1/auth/authenticate', { body });
      const second = await send('POST', '/v1/auth/authenticate', { body });

      expect(first.status).toBe(200);
      expect(second.status).toBe(400);
      expect(second.body).toEqual({ _tag: 'PasskeyChallengeInvalid' });
    }));
});

describe('protected endpoints', () => {
  it.each([
    ['POST', '/v1/auth/passkeys/options'],
    ['POST', '/v1/auth/passkeys'],
    ['GET', '/v1/auth/passkeys'],
    ['DELETE', '/v1/auth/passkeys/x'],
  ])('%s %s without the session cookie gives 401', (method, path) =>
    withHarness(async ({ send }) => {
      const reply = await send(method, path);

      expect(reply.status).toBe(401);
    }),
  );

  it('adds a passkey for the signed-in user and lists both', () =>
    withHarness(async ({ send, registerUser, addPasskey }) => {
      const first = await registerUser();

      const { reply, credential } = await addPasskey('Laptop');

      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({ credentialId: credential.id, name: 'Laptop' });

      const list = await send('GET', '/v1/auth/passkeys', { cookie: 'sid=user-1' });
      const listed = list.body as ReadonlyArray<{ readonly credentialId: string }>;

      expect(list.status).toBe(200);
      expect(listed.map((passkey) => passkey.credentialId).sort()).toEqual(
        [first.id, credential.id].sort(),
      );
    }));

  it('removes a passkey, runs onRemoved with the signed-in user, then protects the last one', () =>
    withHarness(async ({ send, registerUser, addPasskey, removed }) => {
      const first = await registerUser();
      const second = (await addPasskey('Laptop')).credential;
      const cookie = 'sid=user-1';

      const deleted = await send('DELETE', `/v1/auth/passkeys/${first.id}`, { cookie });

      expect(deleted.status).toBe(204);
      expect(removed).toEqual([
        { removed: { userId: 'user-1', credentialId: first.id }, sawUser: 'user-1' },
      ]);

      const last = await send('DELETE', `/v1/auth/passkeys/${second.id}`, { cookie });

      expect(last.status).toBe(409);
      expect(last.body).toEqual({ _tag: 'PasskeyLastCredential' });

      const unknown = await send('DELETE', '/v1/auth/passkeys/unknown-id', { cookie });

      expect(unknown.status).toBe(404);
      expect(unknown.body).toEqual({ _tag: 'PasskeyUnknownCredential' });
    }));
});

describe('a second user', () => {
  const seedBob = (store: Harness['store']) => {
    store.userNames.set('user-2', 'Bob');
    store.passkeys.set('bob-credential', {
      userId: 'user-2',
      credentialId: 'bob-credential',
      publicKey: 'cHVibGljLWtleQ',
      counter: 0,
      transports: [],
      backedUp: false,
      name: 'Bob phone',
      createdAt: 1,
      lastUsedAt: null,
    });
  };

  it('lists only the passkeys of the signed-in user', () =>
    withHarness(async ({ send, store, registerUser }) => {
      await registerUser();
      seedBob(store);

      const list = await send('GET', '/v1/auth/passkeys', { cookie: 'sid=user-2' });
      const listed = list.body as ReadonlyArray<{ readonly credentialId: string }>;

      expect(list.status).toBe(200);
      expect(listed.map((passkey) => passkey.credentialId)).toEqual(['bob-credential']);
    }));

  it('gives 404 for the DELETE of the credential of another user and keeps it', () =>
    withHarness(async ({ send, store, registerUser }) => {
      const first = await registerUser();
      seedBob(store);

      const reply = await send('DELETE', `/v1/auth/passkeys/${first.id}`, {
        cookie: 'sid=user-2',
      });

      expect(reply.status).toBe(404);
      expect(reply.body).toEqual({ _tag: 'PasskeyUnknownCredential' });
      expect(store.passkeys.has(first.id)).toBe(true);
    }));
});

describe('long credential ids', () => {
  it('adds and removes a passkey with a 128-byte credential id', () =>
    withHarness(async ({ send, registerUser, addPasskey }) => {
      await registerUser();

      const { reply, credential } = await addPasskey('Long', 128);

      expect(credential.id).toHaveLength(171);
      expect(reply.status).toBe(201);

      const deleted = await send('DELETE', `/v1/auth/passkeys/${credential.id}`, {
        cookie: 'sid=user-1',
      });

      expect(deleted.status).toBe(204);
    }));

  it('routes DELETE of an unknown 1,366-character id to the handler', () =>
    withHarness(async ({ send }) => {
      const reply = await send('DELETE', `/v1/auth/passkeys/${'A'.repeat(1366)}`, {
        cookie: 'sid=user-1',
      });

      expect(reply.status).toBe(404);
      expect(reply.body).toEqual({ _tag: 'PasskeyUnknownCredential' });
    }));
});
