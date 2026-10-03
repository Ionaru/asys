// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { API_VERSION } from '@asys/contract';
import { RULES_VERSION } from '@asys/domain';
import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { appDatabase } from '../db/database';
import { makeHttp, signUpOverHttp } from '../test/http';

// These tests run against the real database (docker compose) through the web handler, on the
// real clock. Tests never print the session cookie.

const TIMEOUT = 30_000;

const capture = (overrides: Record<string, unknown> = {}) => ({
  _tag: 'CaptureTask',
  idempotencyKey: randomUUID(),
  taskId: randomUUID(),
  title: 'Buy milk',
  captureText: 'buy milk',
  ...overrides,
});

layer(appDatabase(), { excludeTestServices: true })('data endpoints', (it) => {
  it.effect(
    'refuses a command from a foreign origin, without an origin and with a trailing slash',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);

        for (const origin of ['https://evil.example', null, 'http://localhost:4200/']) {
          const reply = yield* http.send('/v1/commands', { cookie, body: capture(), origin });
          assert.strictEqual(reply.status, 403);
          assert.strictEqual(reply.text, '');
        }

        const changes = yield* http.send('/v1/changes?after=0', { cookie });
        assert.strictEqual(changes.status, 200);
        assert.deepStrictEqual(changes.json, { seq: 0, entries: [] });
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 401 Unauthorized for a snapshot without cookie and origin',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();

        const reply = yield* http.send('/v1/snapshot', { origin: null });

        assert.strictEqual(reply.status, 401);
        assert.deepStrictEqual(reply.json, { _tag: 'Unauthorized' });
      }),
    TIMEOUT,
  );

  it.effect(
    'serves a fresh snapshot with seq 0, two areas and no tasks',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);

        const reply = yield* http.send('/v1/snapshot', { cookie });
        const body = reply.json as {
          seq: number;
          areas: ReadonlyArray<unknown>;
          tasks: ReadonlyArray<unknown>;
        };

        assert.strictEqual(reply.status, 200);
        assert.strictEqual(body.seq, 0);
        assert.strictEqual(body.areas.length, 2);
        assert.strictEqual(body.tasks.length, 0);
      }),
    TIMEOUT,
  );

  it.effect(
    'applies a command once, replays it identically and rejects a reused key',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);
        const command = capture();

        const first = yield* http.send('/v1/commands', { cookie, body: command });
        assert.strictEqual(first.status, 200);
        assert.deepStrictEqual(first.json, { _tag: 'Applied', seq: 1 });

        const again = yield* http.send('/v1/commands', { cookie, body: command });
        assert.strictEqual(again.status, 200);
        assert.strictEqual(again.text, first.text);

        const reused = yield* http.send('/v1/commands', {
          cookie,
          body: { ...command, title: 'Something else' },
        });
        assert.strictEqual(reused.status, 409);
        assert.deepStrictEqual(reused.json, { _tag: 'IdempotencyKeyReused' });
      }),
    TIMEOUT,
  );

  it.effect(
    'rejects a fractional estimate with 422 CommandRejected',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);
        const taskId = randomUUID();
        yield* http.send('/v1/commands', { cookie, body: capture({ taskId }) });

        const reply = yield* http.send('/v1/commands', {
          cookie,
          body: {
            _tag: 'TriageTask',
            idempotencyKey: randomUUID(),
            taskId,
            important: true,
            estimateMinutes: 2.5,
          },
        });

        assert.strictEqual(reply.status, 422);
        assert.strictEqual((reply.json as { _tag?: string } | undefined)?._tag, 'CommandRejected');
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 400 for a body that is not a command',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);

        const empty = yield* http.send('/v1/commands', { cookie, body: {} });
        assert.strictEqual(empty.status, 400);
        assert.strictEqual(empty.text, '');

        const unknownTag = yield* http.send('/v1/commands', { cookie, body: { _tag: 'Nope' } });
        assert.strictEqual(unknownTag.status, 400);
      }),
    TIMEOUT,
  );

  it.effect(
    'lists changes after a sequence number and handles bad and expired cursors',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);
        yield* http.send('/v1/commands', { cookie, body: capture() });

        const all = yield* http.send('/v1/changes?after=0', { cookie });
        const body = all.json as { seq: number; entries: ReadonlyArray<unknown> };
        assert.strictEqual(all.status, 200);
        assert.strictEqual(body.seq, 1);
        assert.strictEqual(body.entries.length, 1);

        const malformed = yield* http.send('/v1/changes?after=abc', { cookie });
        assert.strictEqual(malformed.status, 400);

        const expired = yield* http.send('/v1/changes?after=99', { cookie });
        assert.strictEqual(expired.status, 410);
        assert.deepStrictEqual(expired.json, { _tag: 'ChangesExpired', after: 99 });
      }),
    TIMEOUT,
  );

  it.effect(
    'serves the meta document with the rules version and the settings',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);

        const reply = yield* http.send('/v1/meta', { cookie });

        assert.strictEqual(reply.status, 200);
        assert.deepStrictEqual(reply.json, {
          rulesVersion: RULES_VERSION,
          apiVersion: API_VERSION,
          settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
        });
        assert.strictEqual(API_VERSION, 1);
      }),
    TIMEOUT,
  );
});
