// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import { Deferred, Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import { lockCounter } from '../changes/change-log';
import { appDatabase, Db } from '../db/database';
import { sessions } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { stillRunningAfterHalfSecond } from '../test/sign-up';
import {
  authenticate,
  createSession,
  deleteOtherSessions,
  deleteSession,
  SESSION_DAYS,
  SESSION_RENEW_BELOW_DAYS,
} from './sessions';
import { hashToken, newToken } from './tokens';

// These tests run against the real database (docker compose).

const T = 1_000_000;

const HOUR_MS = 60 * 60 * 1000;

const DAY_MS = 24 * HOUR_MS;

const expiry = T + SESSION_DAYS * DAY_MS;

/** A session for `ownerId`, created as its caller would: inside the owner's transaction after the lock. */
const makeSession = (ownerId: string) =>
  withOwner(ownerId, lockCounter.pipe(Effect.andThen(createSession(ownerId))));

const rowsOf = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      return yield* db.select().from(sessions);
    }),
  );

const expiryOf = (ownerId: string, sessionId: string) =>
  rowsOf(ownerId).pipe(
    Effect.map((rows) => rows.find((row) => row.id === sessionId)?.expiresAt.getTime()),
  );

const unauthorizedTag = (token: string) =>
  Effect.map(Effect.flip(authenticate(token)), (error) => error._tag);

/** A transaction that holds the owner's counter lock until `release` is completed. */
const holdLock = (ownerId: string) =>
  Effect.gen(function* () {
    const holding = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const holder = yield* Effect.forkChild(
      withOwner(
        ownerId,
        Effect.gen(function* () {
          yield* lockCounter;
          yield* Deferred.succeed(holding, undefined);
          yield* Deferred.await(release);
        }),
      ),
    );
    yield* Deferred.await(holding);
    return { release, holder };
  });

/** A Db that fails on any use, to prove that no query runs. */
const noQueryDb = new Proxy(
  {},
  {
    get: () => {
      throw new Error('no query expected');
    },
  },
);

layer(appDatabase())('sessions', (it) => {
  it.effect('createSession stores the hash of the token and a 30 day expiry', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* scopedOwner();

      const session = yield* makeSession(o);

      assert.isTrue(/^[A-Za-z0-9_-]{43}$/.test(session.token));
      assert.strictEqual(session.expiresAt, expiry);
      const [row] = yield* rowsOf(o);
      assert.strictEqual(row.id, session.sessionId);
      assert.isTrue(row.tokenHash === hashToken(session.token));
      assert.strictEqual(row.createdAt.getTime(), T);
      assert.strictEqual(row.expiresAt.getTime(), expiry);
    }),
  );

  it.effect('authenticates a young session without renewing it', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* scopedOwner();
      const session = yield* makeSession(o);

      yield* TestClock.setTime(T + HOUR_MS);
      const result = yield* authenticate(session.token);

      assert.strictEqual(result.ownerId, o);
      assert.strictEqual(result.sessionId, session.sessionId);
      assert.strictEqual(result.renewedUntil, undefined);
      assert.strictEqual(yield* expiryOf(o, session.sessionId), expiry);
    }),
  );

  it.effect('does not renew at exactly one day and renews a millisecond later', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* scopedOwner();
      const session = yield* makeSession(o);

      yield* TestClock.setTime(T + DAY_MS);
      const atBoundary = yield* authenticate(session.token);
      const rowAtBoundary = yield* expiryOf(o, session.sessionId);
      yield* TestClock.setTime(T + DAY_MS + 1);
      const afterBoundary = yield* authenticate(session.token);
      const rowAfterBoundary = yield* expiryOf(o, session.sessionId);

      const renewed = T + DAY_MS + 1 + SESSION_DAYS * DAY_MS;
      assert.strictEqual(SESSION_RENEW_BELOW_DAYS, 29);
      assert.strictEqual(atBoundary.renewedUntil, undefined);
      assert.strictEqual(rowAtBoundary, expiry);
      assert.strictEqual(afterBoundary.ownerId, o);
      assert.strictEqual(afterBoundary.sessionId, session.sessionId);
      assert.strictEqual(afterBoundary.renewedUntil, renewed);
      assert.strictEqual(rowAfterBoundary, renewed);
    }),
  );

  it.effect('is Unauthorized at expires_at exactly', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* scopedOwner();
      const session = yield* makeSession(o);

      yield* TestClock.setTime(expiry);
      const tag = yield* unauthorizedTag(session.token);

      assert.strictEqual(tag, 'Unauthorized');
    }),
  );

  it.effect('authenticates a millisecond before expires_at and renews', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* scopedOwner();
      const session = yield* makeSession(o);

      yield* TestClock.setTime(expiry - 1);
      const result = yield* authenticate(session.token);

      const renewed = expiry - 1 + SESSION_DAYS * DAY_MS;
      assert.strictEqual(result.ownerId, o);
      assert.strictEqual(result.renewedUntil, renewed);
      assert.strictEqual(yield* expiryOf(o, session.sessionId), renewed);
    }),
  );

  it.effect('is Unauthorized for malformed and unknown tokens', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);

      assert.strictEqual(yield* unauthorizedTag(''), 'Unauthorized');
      assert.strictEqual(yield* unauthorizedTag('x'), 'Unauthorized');
      assert.strictEqual(yield* unauthorizedTag('*'.repeat(43)), 'Unauthorized');
      assert.strictEqual(yield* unauthorizedTag(newToken()), 'Unauthorized');
    }),
  );

  it.effect('is Unauthorized for an empty, a short and a malformed token without a query', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);

      assert.strictEqual(yield* unauthorizedTag(''), 'Unauthorized');
      assert.strictEqual(yield* unauthorizedTag('x'), 'Unauthorized');
      assert.strictEqual(yield* unauthorizedTag('*'.repeat(43)), 'Unauthorized');
    }).pipe(Effect.provideService(Db, noQueryDb as never)),
  );

  it.effect(
    'deleteSession waits for the owner lock and runs after the holder ends',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const o = yield* scopedOwner();
        const session = yield* makeSession(o);
        const { release, holder } = yield* holdLock(o);

        const deletion = yield* Effect.forkChild(deleteSession(o, session.sessionId));
        const waiting = yield* stillRunningAfterHalfSecond(deletion);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        yield* Fiber.join(deletion);

        assert.isTrue(waiting);
        assert.deepStrictEqual(yield* rowsOf(o), []);
      }),
    15_000,
  );

  it.effect(
    'the renewal in authenticate waits for the owner lock and runs after the holder ends',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const o = yield* scopedOwner();
        const session = yield* makeSession(o);
        yield* TestClock.setTime(T + DAY_MS + 1);
        const { release, holder } = yield* holdLock(o);

        const authenticating = yield* Effect.forkChild(authenticate(session.token));
        const waiting = yield* stillRunningAfterHalfSecond(authenticating);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const result = yield* Fiber.join(authenticating);

        const renewed = T + DAY_MS + 1 + SESSION_DAYS * DAY_MS;
        assert.isTrue(waiting);
        assert.strictEqual(result.sessionId, session.sessionId);
        assert.strictEqual(result.renewedUntil, renewed);
        assert.strictEqual(yield* expiryOf(o, session.sessionId), renewed);
      }),
    15_000,
  );

  it.effect('is Unauthorized for a session that deleteSession removed', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* scopedOwner();
      const session = yield* makeSession(o);
      yield* authenticate(session.token);

      yield* deleteSession(o, session.sessionId);

      assert.strictEqual(yield* unauthorizedTag(session.token), 'Unauthorized');
      assert.deepStrictEqual(yield* rowsOf(o), []);
    }),
  );

  it.effect('deleteSession of an unknown session id leaves the owner sessions', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const o = yield* scopedOwner();
      const session = yield* makeSession(o);

      yield* deleteSession(o, randomUUID());

      assert.strictEqual((yield* authenticate(session.token)).sessionId, session.sessionId);
    }),
  );

  it.effect("deleteOtherSessions deletes the owner's other sessions only", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      const keep = yield* makeSession(a);
      const other1 = yield* makeSession(a);
      const other2 = yield* makeSession(a);
      const bSession = yield* makeSession(b);

      yield* withOwner(a, lockCounter.pipe(Effect.andThen(deleteOtherSessions(a, keep.sessionId))));

      assert.deepStrictEqual(
        (yield* rowsOf(a)).map((row) => row.id),
        [keep.sessionId],
      );
      assert.strictEqual((yield* authenticate(keep.token)).sessionId, keep.sessionId);
      assert.strictEqual(yield* unauthorizedTag(other1.token), 'Unauthorized');
      assert.strictEqual(yield* unauthorizedTag(other2.token), 'Unauthorized');
      assert.strictEqual((yield* authenticate(bSession.token)).sessionId, bSession.sessionId);
    }),
  );
});
