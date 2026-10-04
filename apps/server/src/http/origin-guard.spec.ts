// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { appDatabase } from '../db/database';
import { startServer } from '../test/http';
import { makeStaticRoot } from '../test/static-root';
import { HealthReader } from './health';
import { SECURITY_HEADERS, withSecurityHeaders } from './origin-guard';
import { CONTENT_SECURITY_POLICY } from './static-files';

// The socket tests open real sockets on port 0 and run against the real database (docker compose).

const TIMEOUT = 30_000;

const EXPECTED_SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000',
};

const IMMUTABLE = 'public, max-age=31536000, immutable';

const empty = HttpServerResponse.empty({ status: 200 });

const expectSecurityHeaders = (headers: Record<string, string | undefined>) => {
  for (const [name, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    assert.strictEqual(headers[name], value, name);
  }
};

const socketHeaders = (headers: Headers) => {
  const record: Record<string, string | undefined> = {};
  for (const name of Object.keys(EXPECTED_SECURITY_HEADERS)) {
    record[name] = headers.get(name) ?? undefined;
  }

  return record;
};

const HTML = { accept: 'text/html' };

const fetchPath = (
  server: { readonly base: string },
  path: string,
  init: { readonly headers?: Record<string, string>; readonly method?: string } = {},
) =>
  Effect.promise(async () => {
    const response = await fetch(`${server.base}${path}`, init);

    return { status: response.status, headers: response.headers, text: await response.text() };
  });

describe('SECURITY_HEADERS', () => {
  it('holds exactly the four contract headers', () => {
    const lower: Record<string, string> = Object.fromEntries(
      Object.entries(SECURITY_HEADERS).map(([name, value]) => [name.toLowerCase(), value]),
    );

    assert.deepStrictEqual(lower, EXPECTED_SECURITY_HEADERS);
  });
});

describe('withSecurityHeaders', () => {
  it('sets the four headers and no Cache-Control on a non-API path', () => {
    const response = withSecurityHeaders(empty, '/');

    expectSecurityHeaders(response.headers);
    assert.isUndefined(response.headers['cache-control']);
  });

  it('replaces Cache-Control with no-store on an API path', () => {
    const response = withSecurityHeaders(
      HttpServerResponse.setHeader(empty, 'cache-control', 'no-cache'),
      '/v1/nope',
    );

    expectSecurityHeaders(response.headers);
    assert.strictEqual(response.headers['cache-control'], 'no-store');
  });

  it('adds no-store on the /v1 root path', () => {
    const response = withSecurityHeaders(empty, '/v1');

    assert.strictEqual(response.headers['cache-control'], 'no-store');
  });

  it('leaves an immutable Cache-Control alone on a non-API path', () => {
    const response = withSecurityHeaders(
      HttpServerResponse.setHeader(empty, 'cache-control', IMMUTABLE),
      '/main-ABCDEFGH.js',
    );

    expectSecurityHeaders(response.headers);
    assert.strictEqual(response.headers['cache-control'], IMMUTABLE);
  });

  it('keeps other headers such as the CSP', () => {
    const response = withSecurityHeaders(
      HttpServerResponse.setHeader(empty, 'content-security-policy', CONTENT_SECURITY_POLICY),
      '/',
    );

    assert.strictEqual(response.headers['content-security-policy'], CONTENT_SECURITY_POLICY);
  });

  it('replaces existing values of the security headers', () => {
    const response = withSecurityHeaders(
      HttpServerResponse.setHeader(empty, 'referrer-policy', 'origin'),
      '/',
    );

    assert.strictEqual(response.headers['referrer-policy'], 'no-referrer');
  });
});

layer(appDatabase(), { excludeTestServices: true })('security headers over a socket', (it) => {
  it.effect(
    'puts the headers and the CSP on the app shell, uncached',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        const answer = yield* fetchPath(server, '/', { headers: HTML });

        assert.strictEqual(answer.status, 200);
        expectSecurityHeaders(socketHeaders(answer.headers));
        assert.strictEqual(answer.headers.get('cache-control'), 'no-cache');
        assert.strictEqual(answer.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
      }),
    TIMEOUT,
  );

  it.effect(
    'keeps a hashed file immutable, not no-store',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        const answer = yield* fetchPath(server, '/main-ABCDEFGH.js');

        assert.strictEqual(answer.status, 200);
        expectSecurityHeaders(socketHeaders(answer.headers));
        assert.strictEqual(answer.headers.get('cache-control'), IMMUTABLE);
      }),
    TIMEOUT,
  );

  it.effect(
    'makes API answers no-store and leaves the CSP off them',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();

        const answer = yield* fetchPath(server, '/v1/meta');

        assert.strictEqual(answer.status, 401);
        expectSecurityHeaders(socketHeaders(answer.headers));
        assert.strictEqual(answer.headers.get('cache-control'), 'no-store');
        assert.isNull(answer.headers.get('content-security-policy'));
      }),
    TIMEOUT,
  );

  it.effect(
    'makes an unknown API path no-store even when the static route answers it',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        const answer = yield* fetchPath(server, '/v1/nope', { headers: HTML });

        assert.strictEqual(answer.status, 404);
        expectSecurityHeaders(socketHeaders(answer.headers));
        assert.strictEqual(answer.headers.get('cache-control'), 'no-store');
      }),
    TIMEOUT,
  );

  it.effect(
    'makes API answers no-store when the path differs in case or has duplicate slashes',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();

        const plain = yield* fetchPath(server, '/v1/meta');
        assert.strictEqual(plain.status, 401);
        assert.strictEqual(plain.headers.get('cache-control'), 'no-store');

        for (const path of ['/V1/meta', '//v1/meta']) {
          const answer = yield* fetchPath(server, path);

          assert.strictEqual(answer.status, 401, path);
          expectSecurityHeaders(socketHeaders(answer.headers));
          assert.strictEqual(answer.headers.get('cache-control'), 'no-store', path);
          assert.isNull(answer.headers.get('content-security-policy'), path);
        }
      }),
    TIMEOUT,
  );

  it.effect(
    'puts the headers on /health without no-store',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();

        const answer = yield* fetchPath(server, '/health');

        assert.strictEqual(answer.status, 200);
        expectSecurityHeaders(socketHeaders(answer.headers));
        assert.notStrictEqual(answer.headers.get('cache-control'), 'no-store');
      }),
    TIMEOUT,
  );

  it.effect(
    'puts the headers on the refused POSTs, with an empty body',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();
        const path = '/v1/auth/authenticate/options';

        const foreign = yield* fetchPath(server, path, {
          method: 'POST',
          headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        });
        assert.strictEqual(foreign.status, 403);
        assert.strictEqual(foreign.text, '');
        expectSecurityHeaders(socketHeaders(foreign.headers));
        assert.strictEqual(foreign.headers.get('cache-control'), 'no-store');

        const missing = yield* fetchPath(server, path, { method: 'POST' });
        assert.strictEqual(missing.status, 403);
        assert.strictEqual(missing.text, '');
        expectSecurityHeaders(socketHeaders(missing.headers));
      }),
    TIMEOUT,
  );

  it.effect(
    'puts the headers on a 500 from a dying health reader',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer({
          health: Layer.succeed(HealthReader)({ read: Effect.die(new Error('secret-123')) }),
        });

        const answer = yield* fetchPath(server, '/health');

        assert.strictEqual(answer.status, 500);
        expectSecurityHeaders(socketHeaders(answer.headers));
      }),
    TIMEOUT,
  );
});
