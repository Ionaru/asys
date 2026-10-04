// SPDX-License-Identifier: EUPL-1.2
import { randomBytes } from 'node:crypto';
import { PasskeyChallenges, passkeyRouterConfig } from '@ionaru/effect-passkeys/server';
import type { SoftAuthenticator, SoftCredential } from '@ionaru/effect-passkeys/testing';
import { Context, Effect, Layer, Logger } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { PasskeyStoreLive } from '../auth/passkey-store';
import { createSignUpLink } from '../auth/sign-up-links';
import { PasskeyUnitOfWorkLive } from '../auth/unit-of-work';
import { passkeyConfigLayer, ServerConfig } from '../config';
import { appDatabase, type Db } from '../db/database';
import { apiLayer } from '../http/app';
import { HealthReader } from '../http/health';
import { httpMiddleware } from '../http/origin-guard';
import { makeRedactingLogger } from '../logging/logger';
import { serverLayer } from '../server';
import { newSoftAuthenticator } from './sign-up';
import { removeOwner } from './owners';

/** The public origin the test server is configured with. */
export const HTTP_ORIGIN = 'http://localhost:4200';

/** An answer read to the end. `json` is undefined for an empty or non-JSON body. */
export interface Reply {
  readonly status: number;
  /** Every Set-Cookie header, in order. */
  readonly setCookies: ReadonlyArray<string>;
  readonly text: string;
  readonly json: unknown;
}

export interface SendInit {
  readonly method?: string;
  /** A `name=value` pair, sent as the Cookie header. */
  readonly cookie?: string;
  /** Serialised as JSON. */
  readonly body?: unknown;
  /** The Origin header: the public origin by default, left out for `null`. */
  readonly origin?: string | null;
}

/** Anything that sends a request to the API: the web handler or a real socket. */
export interface Sender {
  readonly send: (path: string, init?: SendInit) => Effect.Effect<Reply>;
}

export interface Http extends Sender {
  readonly fetch: (
    path: string,
    init?: RequestInit & { readonly origin?: string | null },
  ) => Effect.Effect<Response>;
}

export const toReply = async (response: Response): Promise<Reply> => {
  const text = await response.text();
  let json: unknown;
  if (text !== '') {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  return { status: response.status, setCookies: response.headers.getSetCookie(), text, json };
};

/** The headers a `SendInit` stands for. */
export const headersOf = (init: SendInit): Record<string, string> => {
  const headers: Record<string, string> = {};
  const origin = init.origin === undefined ? HTTP_ORIGIN : init.origin;
  if (origin !== null) headers['origin'] = origin;
  if (init.cookie !== undefined) headers['cookie'] = init.cookie;
  if (init.body !== undefined) headers['content-type'] = 'application/json';

  return headers;
};

/**
 * What `apiLayer` and `serverLayer` need, over the real database (as `asys_app`): the passkey
 * services, an in-memory challenge store, the server configuration and a health reader.
 */
export const httpDependencies = (health?: Layer.Layer<HealthReader>, staticRoot?: string) => {
  const healthLayer: Layer.Layer<HealthReader, never, Db> = health ?? HealthReader.layer;

  return Layer.mergeAll(
    PasskeyStoreLive,
    PasskeyUnitOfWorkLive,
    PasskeyChallenges.memory(),
    passkeyConfigLayer,
    healthLayer,
  ).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        appDatabase(),
        ServerConfig.layerOf({
          port: 0,
          publicOrigin: HTTP_ORIGIN,
          rpId: 'localhost',
          ...(staticRoot === undefined ? {} : { staticRoot }),
        }),
      ),
    ),
  );
};

/**
 * The API as a web handler over the real database (as `asys_app`), with an in-memory challenge
 * store and the Origin guard. The handler is disposed when the scope closes.
 */
export const makeHttp = (options: { readonly health?: Layer.Layer<HealthReader> } = {}) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const dependencies = httpDependencies(options.health);
      const app = apiLayer.pipe(
        Layer.provide(dependencies),
        Layer.provide(HttpServer.layerServices),
      );

      return HttpRouter.toWebHandler(app, {
        middleware: httpMiddleware(HTTP_ORIGIN),
        routerConfig: passkeyRouterConfig,
        disableLogger: true,
      });
    }),
    (web) =>
      Effect.promise(async () => {
        await web.dispose();
      }),
  ).pipe(
    Effect.map((web): Http => {
      const fetch: Http['fetch'] = (path, init = {}) =>
        Effect.promise(() => {
          const { origin, headers, ...rest } = init;
          const merged = new Headers(headers);
          if (origin !== null) merged.set('origin', origin ?? HTTP_ORIGIN);
          if (rest.body !== undefined && rest.body !== null && !merged.has('content-type')) {
            merged.set('content-type', 'application/json');
          }

          return web.handler(
            new Request(`http://localhost${path}`, { ...rest, headers: merged }),
            Context.empty() as never,
          );
        });

      const send: Http['send'] = (path, init = {}) =>
        Effect.promise(async () => {
          const response = await web.handler(
            new Request(`http://localhost${path}`, {
              method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
              headers: headersOf(init),
              body: init.body === undefined ? undefined : JSON.stringify(init.body),
            }),
            Context.empty() as never,
          );

          return toReply(response);
        });

      return { fetch, send };
    }),
  );

/**
 * Starts the server on a free port, over the real database. The server stops when the scope
 * closes. `send` and `fetch` go over the real socket; `lines` holds the redacting logger's lines.
 */
export const startServer = <Provided = never>(
  options: {
    readonly health?: Layer.Layer<HealthReader>;
    readonly staticRoot?: string;
    /** Built after the log capture is installed and before the server, which runs in its context. */
    readonly around?: Layer.Layer<Provided, never, never>;
  } = {},
) =>
  Effect.gen(function* () {
    const lines: Array<string> = [];
    const capture = Logger.layer([makeRedactingLogger((line) => lines.push(line))]);
    const aroundContext =
      options.around === undefined
        ? Context.empty()
        : yield* Layer.build(options.around).pipe(Effect.provide(capture));
    const context = yield* Layer.build(
      serverLayer.pipe(Layer.provide(httpDependencies(options.health, options.staticRoot))),
    ).pipe(Effect.provide(aroundContext), Effect.provide(capture));
    const { address } = Context.get(context, HttpServer.HttpServer);
    if (!('port' in address)) return yield* Effect.die('The server is not on a TCP port');
    const base = `http://127.0.0.1:${address.port}`;

    const send: Http['send'] = (path, init = {}) =>
      Effect.promise(async () =>
        toReply(
          await globalThis.fetch(`${base}${path}`, {
            method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
            headers: headersOf(init),
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
          }),
        ),
      );

    const fetch: Http['fetch'] = (path, init = {}) =>
      Effect.promise(() => {
        const { origin, headers, ...rest } = init;
        const merged = new Headers(headers);
        if (origin !== null) merged.set('origin', origin ?? HTTP_ORIGIN);
        if (rest.body !== undefined && rest.body !== null && !merged.has('content-type')) {
          merged.set('content-type', 'application/json');
        }

        return globalThis.fetch(`${base}${path}`, { ...rest, headers: merged });
      });

    return { send, fetch, lines, base };
  });

/** `name=value` of a Set-Cookie header. */
export const cookiePairOf = (setCookie: string): string => setCookie.split(';')[0];

/** The value of a `name=value` pair. */
export const cookieValueOf = (pair: string): string => pair.slice(pair.indexOf('=') + 1);

interface Challenge {
  readonly challengeId: string;
  readonly options: { readonly challenge: string };
}

/** The challenge of a begin step. A failure dies with a fixed message. */
export const challengeOf = (reply: Reply, step: string): Challenge => {
  const json = reply.json as Partial<Challenge> | undefined;
  if (reply.status !== 200 || json?.challengeId === undefined || json.options === undefined) {
    throw new Error(`The ${step} step did not answer a challenge (status ${reply.status})`);
  }

  return json as Challenge;
};

const stringsOf = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) && value.every((item): item is string => typeof item === 'string')
    ? value
    : [];

/** The recovery codes of a body that holds them, or none. */
export const recoveryCodesOf = (reply: Reply): ReadonlyArray<string> =>
  stringsOf((reply.json as { readonly recoveryCodes?: unknown } | undefined)?.recoveryCodes);

/**
 * Signs a new Owner up over HTTP: a Sign-up link (through the database), the begin step, a soft
 * registration and the register step. The Owner is removed when the scope closes.
 */
export const signUpOverHttp = (
  http: Sender,
  options: { readonly name?: string; readonly timeZone?: string } = {},
) =>
  Effect.gen(function* () {
    const link = yield* createSignUpLink({ expiresInDays: 7 });
    const { ownerId } = link;
    yield* Effect.addFinalizer(() => removeOwner(ownerId).pipe(Effect.orDie));

    const begun = yield* http.send('/v1/auth/register/options', {
      body: { token: link.token, name: options.name ?? 'Test user' },
    });
    const challenge = challengeOf(begun, 'register/options');
    const authenticator = newSoftAuthenticator();
    const { response, credential } = authenticator.register(challenge.options);
    const registered = yield* http.send('/v1/auth/register', {
      body: {
        token: link.token,
        timeZone: options.timeZone ?? 'Europe/Amsterdam',
        challengeId: challenge.challengeId,
        response,
      },
    });
    const header = registered.setCookies[0];
    if (registered.status !== 200 || header === undefined) {
      return yield* Effect.die(`The register step failed (status ${registered.status})`);
    }

    return {
      ownerId,
      cookie: cookiePairOf(header),
      recoveryCodes: recoveryCodesOf(registered),
      authenticator,
      credential,
    };
  });

/** Signs in with a soft credential: the authenticate steps. Returns the finish step's reply. */
export const signInOverHttp = (
  http: Sender,
  authenticator: SoftAuthenticator,
  credential: SoftCredential,
  overrides: Parameters<SoftAuthenticator['authenticate']>[2] = {},
) =>
  Effect.gen(function* () {
    const begun = yield* http.send('/v1/auth/authenticate/options', { body: {} });
    const challenge = challengeOf(begun, 'authenticate/options');
    const response = authenticator.authenticate(challenge.options, credential, overrides);

    return yield* http.send('/v1/auth/authenticate', {
      body: { challengeId: challenge.challengeId, response },
    });
  });

/** Adds a second soft passkey to the signed-in Owner. Returns the finish step's reply and the credential. */
export const addPasskeyOverHttp = (
  http: Sender,
  cookie: string,
  authenticator: SoftAuthenticator,
  options: { readonly credentialIdLength?: number; readonly name?: string } = {},
) =>
  Effect.gen(function* () {
    const begun = yield* http.send('/v1/auth/passkeys/options', { method: 'POST', cookie });
    const challenge = challengeOf(begun, 'passkeys/options');
    const { response, credential } = authenticator.register(
      challenge.options,
      options.credentialIdLength === undefined
        ? {}
        : { credentialIdLength: options.credentialIdLength },
    );
    const reply = yield* http.send('/v1/auth/passkeys', {
      cookie,
      body: {
        challengeId: challenge.challengeId,
        response,
        ...(options.name === undefined ? {} : { name: options.name }),
      },
    });

    return { reply, credential };
  });

/** A well-formed 43 character token that no link has. */
export const unknownToken = (): string => randomBytes(32).toString('base64url');
