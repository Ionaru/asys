// SPDX-License-Identifier: EUPL-1.2
import { assert, layer } from '@effect/vitest';
import { Context, Effect, Layer, Logger } from 'effect';
import { HttpServer } from 'effect/http';
import { appDatabase } from './db/database';
import { HealthReader } from './http/health';
import { makeRedactingLogger } from './logging/logger';
import { serverLayer } from './server';
import {
  addPasskeyOverHttp,
  headersOf,
  httpDependencies,
  signUpOverHttp,
  toReply,
  type Sender,
} from './test/http';

// These tests open real sockets on port 0 and run against the real database (docker compose),
// on the real clock. The server's own log lines are collected through the redacting logger.
// Tests never print tokens or cookies.

const TIMEOUT = 30_000;

const KIB = 1024;

/** Starts the server on a free port. The server stops when the scope closes. */
const startServer = (health?: Layer.Layer<HealthReader>) =>
  Effect.gen(function* () {
    const lines: Array<string> = [];
    const context = yield* Layer.build(
      serverLayer.pipe(Layer.provide(httpDependencies(health))),
    ).pipe(Effect.provide(Logger.layer([makeRedactingLogger((line) => lines.push(line))])));
    const { address } = Context.get(context, HttpServer.HttpServer);
    if (!('port' in address)) return yield* Effect.die('The server is not on a TCP port');
    const base = `http://127.0.0.1:${address.port}`;

    const send: Sender['send'] = (path, init = {}) =>
      Effect.promise(async () =>
        toReply(
          await fetch(`${base}${path}`, {
            method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
            headers: headersOf(init),
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
          }),
        ),
      );

    return { send, lines, base };
  });

const waitFor = (condition: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 40 && !condition(); attempt++) {
      yield* Effect.sleep('50 millis');
    }
  });

layer(appDatabase(), { excludeTestServices: true })('server', (it) => {
  it.effect(
    'answers the health probe over a socket',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();

        const reply = yield* server.send('/health');

        assert.strictEqual(reply.status, 200);
      }),
    TIMEOUT,
  );

  it.effect(
    'refuses a POST from a foreign origin and without an origin',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();

        for (const origin of ['https://evil.example', null]) {
          const reply = yield* server.send('/v1/auth/authenticate/options', { body: {}, origin });
          assert.strictEqual(reply.status, 403);
          assert.strictEqual(reply.text, '');
        }
      }),
    TIMEOUT,
  );

  it.effect(
    'accepts a 100 KiB body, refuses a 2 MiB body and keeps serving',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();
        const bodyOf = (size: number) => ({ code: 'x', pad: 'a'.repeat(size) });

        const small = yield* server.send('/v1/auth/recover', { body: bodyOf(100 * KIB) });
        assert.strictEqual(small.status, 401);

        const outcome = yield* Effect.promise(() =>
          fetch(`${server.base}/v1/auth/recover`, {
            method: 'POST',
            headers: headersOf({ body: true }),
            body: JSON.stringify(bodyOf(2 * KIB * KIB)),
          }).then(
            (response) => response.status,
            () => 'rejected' as const,
          ),
        );
        assert.isTrue(
          outcome === 'rejected' ||
            (typeof outcome === 'number' && outcome >= 400 && outcome !== 401),
        );

        const health = yield* server.send('/health');
        assert.strictEqual(health.status, 200);
      }),
    TIMEOUT,
  );

  it.effect(
    'logs a defect by its class and never prints its message',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer(
          Layer.succeed(HealthReader)({ read: Effect.die(new Error('secret-123')) }),
        );

        const reply = yield* server.send('/health');
        yield* waitFor(() => server.lines.some((line) => line.includes('Die: Error')));

        assert.strictEqual(reply.status, 500);
        assert.isFalse(server.lines.some((line) => line.includes('secret-123')));
        assert.isTrue(server.lines.some((line) => line.includes('Die: Error')));
      }),
    TIMEOUT,
  );

  it.effect(
    'runs sign-up, a long-id passkey and sign-out over a socket',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();
        const { cookie, authenticator } = yield* signUpOverHttp(server);

        const me = yield* server.send('/v1/auth/me', { cookie });
        assert.strictEqual(me.status, 200);

        const added = yield* addPasskeyOverHttp(server, cookie, authenticator, {
          credentialIdLength: 128,
        });
        assert.strictEqual(added.credential.id.length, 171);
        assert.strictEqual(added.reply.status, 201);
        const removed = yield* server.send(`/v1/auth/passkeys/${added.credential.id}`, {
          method: 'DELETE',
          cookie,
        });
        assert.strictEqual(removed.status, 204);

        const signedOut = yield* server.send('/v1/auth/signout', { method: 'POST', cookie });
        assert.strictEqual(signedOut.status, 204);
        const after = yield* server.send('/v1/auth/me', { cookie });
        assert.strictEqual(after.status, 401);
      }),
    TIMEOUT,
  );
});
