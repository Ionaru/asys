// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { appDatabase, Db } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { makeHttp } from '../test/http';
import { scopedOwner } from '../test/owners';
import { HealthReader, HealthUnavailable } from './health';

// These tests run against the real database (docker compose) through the web handler, on the
// real clock. Health counts the jobs of every owner, so the live test asserts on a difference.

const TIMEOUT = 30_000;

const HUNDRED_YEARS_SECONDS = 100 * 365 * 86_400;

const failingJobsOf = (body: unknown): number => (body as { failingJobs: number }).failingJobs;

layer(appDatabase(), { excludeTestServices: true })('health endpoint', (it) => {
  it.effect(
    'counts a failing, long overdue job and reports its age',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const before = yield* http.send('/health');
        assert.strictEqual(before.status, 200);
        const baseline = failingJobsOf(before.json);

        const owner = yield* scopedOwner();
        const db = yield* Db;
        yield* withOwner(
          owner,
          db.insert(jobs).values({
            ownerId: owner,
            id: randomUUID(),
            kind: 'test',
            payload: {},
            runAt: new Date(Date.UTC(1900, 0, 1)),
            lastError: 'x',
          }),
        );

        const after = yield* http.send('/health');
        const body = after.json as {
          status: string;
          failingJobs: number;
          oldestDueJobAgeSeconds: number;
        };

        assert.strictEqual(after.status, 200);
        assert.strictEqual(body.status, 'ok');
        assert.strictEqual(body.failingJobs, baseline + 1);
        assert.isAtLeast(body.oldestDueJobAgeSeconds, HUNDRED_YEARS_SECONDS);
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 503 ServiceUnavailable when the health reader is unavailable',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp({
          health: Layer.succeed(HealthReader)({ read: Effect.fail(new HealthUnavailable()) }),
        });

        const reply = yield* http.send('/health');

        assert.strictEqual(reply.status, 503);
        assert.deepStrictEqual(reply.json, { _tag: 'ServiceUnavailable' });
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 500 with an empty body when the health reader dies',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp({
          health: Layer.succeed(HealthReader)({ read: Effect.die(new Error('secret-123')) }),
        });

        const reply = yield* http.send('/health');

        assert.strictEqual(reply.status, 500);
        assert.strictEqual(reply.text, '');
      }),
    TIMEOUT,
  );
});
