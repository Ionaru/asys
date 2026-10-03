// SPDX-License-Identifier: EUPL-1.2
import { SignUpLinkInvalid } from '@asys/contract';
import { assert, layer } from '@effect/vitest';
import { PasskeyAlreadyRegistered } from '@ionaru/effect-passkeys/api';
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { eq } from 'drizzle-orm';
import { appDatabase, Db } from '../db/database';
import {
  areas,
  changeCounters,
  jobs,
  passkeys,
  recoveryCodes,
  sessions,
  settings,
  signUpLinks,
  users,
} from '../db/schema';
import { withOwner } from '../db/with-owner';
import { removeOwner } from '../test/owners';
import {
  newSoftAuthenticator,
  passkeyTestLayer,
  signUpUser,
  softRegistration,
  stillRunningAfterHalfSecond,
  storedPasskeyOf,
} from '../test/sign-up';
import { authenticate } from './sessions';
import { createSignUpLink } from './sign-up-links';
import { signUp, signUpBegin } from './sign-up';
import { hashToken, newToken } from './tokens';
import { normalizeRecoveryCode, RECOVERY_CODE_COUNT } from './recovery-codes';

// These tests run against the real database (docker compose).

const T = 1_000_000;

const DAY_MS = 24 * 60 * 60 * 1000;

const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

/** A Sign-up link whose owner is removed when the scope closes, even though it has no user. */
const scopedLink = (expiresInDays = 7) =>
  Effect.gen(function* () {
    const link = yield* createSignUpLink({ expiresInDays });
    yield* Effect.addFinalizer(() => removeOwner(link.ownerId).pipe(Effect.orDie));
    return link;
  });

const snapshot = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      return {
        users: yield* db.select().from(users),
        settings: yield* db.select().from(settings),
        areas: yield* db.select().from(areas),
        counters: yield* db.select().from(changeCounters),
        jobs: yield* db.select().from(jobs),
        passkeys: yield* db.select().from(passkeys),
        codes: yield* db.select().from(recoveryCodes),
        sessions: yield* db.select().from(sessions),
        links: yield* db.select().from(signUpLinks),
      };
    }),
  );

const markUsed = (ownerId: string, usedAt: number) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db.update(signUpLinks).set({ usedAt: new Date(usedAt) });
    }),
  );

/** The failure of `effect`. A success dies without printing its value, which holds secrets. */
const failureOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.andThen(() => Effect.die('Expected a failure, got a success')),
    Effect.flip,
  );

layer(Layer.mergeAll(appDatabase(), passkeyTestLayer))('sign-up', (it) => {
  it.effect('signUpUser creates the whole account', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);

      const user = yield* signUpUser({ name: 'Ann', timeZone: 'Europe/Amsterdam' });
      const rows = yield* snapshot(user.ownerId);

      assert.strictEqual(rows.users.length, 1);
      assert.strictEqual(rows.users[0].name, 'Ann');
      assert.strictEqual(rows.settings.length, 1);
      assert.strictEqual(rows.settings[0].timeZone, 'Europe/Amsterdam');
      assert.strictEqual(rows.areas.length, 2);
      assert.strictEqual(rows.counters.length, 1);
      assert.strictEqual(rows.counters[0].lastSeq, 0);
      assert.strictEqual(rows.counters[0].prunedThrough, 0);
      assert.strictEqual(rows.jobs.length, 1);
      assert.strictEqual(rows.jobs[0].kind, 'prune');

      assert.deepStrictEqual(rows.passkeys.map(storedPasskeyOf), [user.passkey]);
      assert.strictEqual(user.passkey.userId, user.ownerId);
      assert.strictEqual(rows.passkeys[0].createdAt.getTime(), T);

      assert.strictEqual(user.recoveryCodes.length, RECOVERY_CODE_COUNT);
      assert.strictEqual(new Set(user.recoveryCodes).size, RECOVERY_CODE_COUNT);
      assert.isTrue(user.recoveryCodes.every((code) => CODE_PATTERN.test(code)));
      const expectedHashes = user.recoveryCodes.map((code) =>
        hashToken(normalizeRecoveryCode(code) ?? ''),
      );
      const storedHashes = rows.codes.map((row) => row.codeHash).toSorted();
      const sortedExpected = expectedHashes.toSorted();
      assert.isTrue(
        storedHashes.length === sortedExpected.length &&
          storedHashes.every((hash, index) => hash === sortedExpected[index]),
      );
      for (const row of rows.codes) {
        assert.strictEqual(row.createdAt.getTime(), T);
        assert.strictEqual(row.usedAt, null);
      }

      assert.strictEqual(rows.sessions.length, 1);
      assert.strictEqual(rows.sessions[0].id, user.session.sessionId);
      const authenticated = yield* authenticate(user.session.token);
      assert.strictEqual(authenticated.ownerId, user.ownerId);
      assert.strictEqual(authenticated.sessionId, user.session.sessionId);

      assert.strictEqual(rows.links.length, 1);
      assert.strictEqual(rows.links[0].usedAt?.getTime(), T);
    }),
  );

  it.effect('signUpBegin refuses an unknown token', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);

      const failure = yield* failureOf(signUpBegin({ token: newToken(), name: 'Ann' }));

      assert.instanceOf(failure, SignUpLinkInvalid);
    }),
  );

  it.effect('signUpBegin refuses a used link', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const link = yield* scopedLink();
      yield* markUsed(link.ownerId, T);

      const failure = yield* failureOf(signUpBegin({ token: link.token, name: 'Ann' }));

      assert.instanceOf(failure, SignUpLinkInvalid);
    }),
  );

  it.effect(
    'signUpBegin refuses a link at its expires_at and accepts it a millisecond before',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const link = yield* scopedLink();

        yield* TestClock.setTime(T + 7 * DAY_MS - 1);
        const before = yield* signUpBegin({ token: link.token, name: 'Ann' });
        yield* TestClock.setTime(T + 7 * DAY_MS);
        const failure = yield* failureOf(signUpBegin({ token: link.token, name: 'Ann' }));

        assert.strictEqual(before.userId, link.ownerId);
        assert.instanceOf(failure, SignUpLinkInvalid);
      }),
  );

  it.effect('signUpBegin of a fresh link returns the owner and the trimmed name', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const link = yield* scopedLink();

      const begun = yield* signUpBegin({ token: link.token, name: '  Ann ' });

      assert.deepStrictEqual(begun, { userId: link.ownerId, userName: 'Ann' });
    }),
  );

  it.effect('signUp with the token of another link is refused and writes nothing', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const mine = yield* scopedLink();
      const other = yield* scopedLink();
      const { registration } = yield* softRegistration(newSoftAuthenticator(), {
        userId: mine.ownerId,
        userName: 'Ann',
      });

      const failure = yield* failureOf(
        signUp(registration, { token: other.token, timeZone: 'Europe/Amsterdam' }),
      );

      assert.instanceOf(failure, SignUpLinkInvalid);
      for (const ownerId of [mine.ownerId, other.ownerId]) {
        const rows = yield* snapshot(ownerId);
        assert.deepStrictEqual(rows.users, []);
        assert.deepStrictEqual(rows.passkeys, []);
        assert.strictEqual(rows.links[0].usedAt, null);
      }
    }),
  );

  it.effect('signUp fails at the expires_at of the link and writes nothing', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const link = yield* scopedLink();
      const begun = yield* signUpBegin({ token: link.token, name: 'Ann' });
      const { registration } = yield* softRegistration(newSoftAuthenticator(), begun);

      yield* TestClock.adjust(7 * DAY_MS);
      const failure = yield* failureOf(
        signUp(registration, { token: link.token, timeZone: 'Europe/Amsterdam' }),
      );

      assert.instanceOf(failure, SignUpLinkInvalid);
      const rows = yield* snapshot(link.ownerId);
      assert.deepStrictEqual(rows.users, []);
      assert.strictEqual(rows.links[0].usedAt, null);
    }),
  );

  it.effect('a second signUp on a used link is refused', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const link = yield* scopedLink();
      const authenticator = newSoftAuthenticator();
      const who = { userId: link.ownerId, userName: 'Ann' };
      const first = yield* softRegistration(authenticator, who);
      const second = yield* softRegistration(authenticator, who);
      yield* signUp(first.registration, { token: link.token, timeZone: 'Europe/Amsterdam' });

      const failure = yield* failureOf(
        signUp(second.registration, { token: link.token, timeZone: 'Europe/Amsterdam' }),
      );

      assert.instanceOf(failure, SignUpLinkInvalid);
      const rows = yield* snapshot(link.ownerId);
      assert.strictEqual(rows.users.length, 1);
      assert.deepStrictEqual(
        rows.passkeys.map((row) => row.credentialId),
        [first.registration.passkey.credentialId],
      );
    }),
  );

  it.effect('signUp with an already registered credential id is PasskeyAlreadyRegistered', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const existing = yield* signUpUser();
      const link = yield* scopedLink();
      const { registration } = yield* softRegistration(newSoftAuthenticator(), {
        userId: link.ownerId,
        userName: 'Ann',
      });
      const clashing = {
        ...registration,
        passkey: { ...registration.passkey, credentialId: existing.passkey.credentialId },
      };

      const failure = yield* failureOf(
        signUp(clashing, { token: link.token, timeZone: 'Europe/Amsterdam' }),
      );

      assert.instanceOf(failure, PasskeyAlreadyRegistered);
      const rows = yield* snapshot(link.ownerId);
      assert.deepStrictEqual(rows.users, []);
      assert.deepStrictEqual(rows.passkeys, []);
      assert.deepStrictEqual(rows.codes, []);
      assert.deepStrictEqual(rows.sessions, []);
      assert.strictEqual(rows.links[0].usedAt, null);
      assert.strictEqual((yield* snapshot(existing.ownerId)).passkeys.length, 1);
    }),
  );

  it.effect(
    'signUp waits for a transaction that holds the link and refuses a link it used',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const link = yield* scopedLink();
        const { registration } = yield* softRegistration(newSoftAuthenticator(), {
          userId: link.ownerId,
          userName: 'Ann',
        });
        const locked = yield* Deferred.make<void>();
        const proceed = yield* Deferred.make<void>();
        const holder = yield* Effect.forkChild(
          withOwner(
            link.ownerId,
            Effect.gen(function* () {
              const db = yield* Db;
              yield* db.select().from(signUpLinks).for('update');
              yield* Deferred.succeed(locked, undefined);
              yield* Deferred.await(proceed);
              yield* db
                .update(signUpLinks)
                .set({ usedAt: new Date(T) })
                .where(eq(signUpLinks.id, link.linkId));
            }),
          ),
        );
        yield* Deferred.await(locked);

        const attempt = yield* Effect.forkChild(
          signUp(registration, { token: link.token, timeZone: 'Europe/Amsterdam' }),
        );
        const waiting = yield* stillRunningAfterHalfSecond(attempt);
        yield* Deferred.succeed(proceed, undefined);
        yield* Fiber.join(holder);
        const failure = yield* failureOf(Fiber.join(attempt));

        assert.isTrue(waiting);
        assert.instanceOf(failure, SignUpLinkInvalid);
        assert.deepStrictEqual((yield* snapshot(link.ownerId)).users, []);
      }),
    15_000,
  );

  it.effect(
    'two concurrent signUps on one link: one wins, the other is refused',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const link = yield* scopedLink();
        const authenticator = newSoftAuthenticator();
        const who = { userId: link.ownerId, userName: 'Ann' };
        const first = yield* softRegistration(authenticator, who);
        const second = yield* softRegistration(authenticator, who);
        const payload = { token: link.token, timeZone: 'Europe/Amsterdam' };

        const fiberA = yield* Effect.forkChild(Effect.exit(signUp(first.registration, payload)));
        const fiberB = yield* Effect.forkChild(Effect.exit(signUp(second.registration, payload)));
        const exits = [yield* Fiber.join(fiberA), yield* Fiber.join(fiberB)];

        const successes = exits.filter(Exit.isSuccess);
        const failures = exits.filter(Exit.isFailure);
        assert.strictEqual(successes.length, 1);
        assert.strictEqual(failures.length, 1);
        const rows = yield* snapshot(link.ownerId);
        assert.strictEqual(rows.users.length, 1);
        assert.strictEqual(rows.passkeys.length, 1);
        assert.strictEqual(rows.sessions.length, 1);
        assert.strictEqual(rows.codes.length, RECOVERY_CODE_COUNT);
        assert.instanceOf(Cause.squash(failures[0].cause), SignUpLinkInvalid);
      }),
    15_000,
  );
});
