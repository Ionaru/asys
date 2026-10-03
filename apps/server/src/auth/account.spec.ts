// SPDX-License-Identifier: EUPL-1.2
import { randomBytes } from 'node:crypto';
import { CurrentOwner, SignInFailed } from '@asys/contract';
import { assert, layer } from '@effect/vitest';
import { PasskeyLastCredential } from '@ionaru/effect-passkeys/api';
import {
  CreatePasskeyResult,
  PasskeyStore,
  removePasskey,
  type StoredPasskey,
} from '@ionaru/effect-passkeys/server';
import { eq } from 'drizzle-orm';
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from 'effect';
import { HttpApiError } from 'effect/http-api';
import { TestClock } from 'effect/testing';
import { lockCounter } from '../changes/change-log';
import { appDatabase, Db } from '../db/database';
import { passkeys, recoveryCodes, sessions } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { passkeyTestLayer, signUpUser, stillRunningAfterHalfSecond } from '../test/sign-up';
import { me, regenerateRecoveryCodes, revokeOtherSessions, signOut } from './account';
import { PasskeyStoreLive } from './passkey-store';
import { RECOVERY_CODE_COUNT } from './recovery-codes';
import { authenticate, createSession, deleteSession } from './sessions';
import { recover } from './sign-in';
import { PasskeyUnitOfWorkLive } from './unit-of-work';

// These tests run against the real database (docker compose).

const T = 1_000_000;

const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/;

/** The failure of `effect`. A success dies without printing its value, which holds secrets. */
const failureOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.andThen(() => Effect.die('Expected a failure, got a success')),
    Effect.flip,
  );

const newSession = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      yield* lockCounter;
      return yield* createSession(ownerId);
    }),
  );

const sessionIds = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      return (yield* db.select().from(sessions)).map((row) => row.id);
    }),
  );

const passkeyCount = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      return (yield* db.select().from(passkeys)).length;
    }),
  );

const codeHashes = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      return (yield* db.select().from(recoveryCodes)).map((row) => row.codeHash).toSorted();
    }),
  );

const sameHashes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((hash, index) => hash === b[index]);

/**
 * A transaction that holds the owner's counter lock until `release` is completed and, when
 * `deleteSessionId` is given, deletes that session inside it (committed when the lock ends).
 */
const holdLock = (ownerId: string, deleteSessionId?: string) =>
  Effect.gen(function* () {
    const holding = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const holder = yield* Effect.forkChild(
      withOwner(
        ownerId,
        Effect.gen(function* () {
          yield* lockCounter;
          if (deleteSessionId !== undefined) {
            const db = yield* Db;
            yield* db.delete(sessions).where(eq(sessions.id, deleteSessionId));
          }
          yield* Deferred.succeed(holding, undefined);
          yield* Deferred.await(release);
        }),
      ),
    );
    yield* Deferred.await(holding);
    return { release, holder };
  });

/** Adds a second passkey row for the owner through the store and returns its credential id. */
const addPasskey = (ownerId: string) =>
  Effect.gen(function* () {
    const store = yield* PasskeyStore;
    const passkey: StoredPasskey = {
      userId: ownerId,
      credentialId: randomBytes(24).toString('base64url'),
      publicKey: randomBytes(32).toString('base64url'),
      counter: 0,
      transports: ['internal'],
      backedUp: false,
      name: 'Second',
      createdAt: T,
      lastUsedAt: null,
    };
    const result = yield* store.createPasskey(passkey);
    assert.strictEqual(result, CreatePasskeyResult.Created);
    return passkey.credentialId;
  });

const remove = (
  owner: { readonly ownerId: string; readonly sessionId: string },
  credentialId: string,
) =>
  removePasskey(owner.ownerId, credentialId, revokeOtherSessions).pipe(
    Effect.provideService(CurrentOwner, owner),
  );

const testLayer = Layer.mergeAll(PasskeyStoreLive, PasskeyUnitOfWorkLive).pipe(
  Layer.provideMerge(appDatabase()),
  Layer.provideMerge(passkeyTestLayer),
);

layer(testLayer)('account', (it) => {
  it.effect('me is the name and the unused recovery code count', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser({ name: 'Ann' });

      const result = yield* me(user.ownerId);

      assert.deepStrictEqual(result, { name: 'Ann', recoveryCodesLeft: RECOVERY_CODE_COUNT });
    }),
  );

  it.effect('removing a passkey revokes the other sessions and keeps the current one', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser();
      const secondCredential = yield* addPasskey(user.ownerId);
      const other = yield* newSession(user.ownerId);

      yield* remove({ ownerId: user.ownerId, sessionId: user.session.sessionId }, secondCredential);

      assert.strictEqual(yield* passkeyCount(user.ownerId), 1);
      const current = yield* authenticate(user.session.token);
      assert.strictEqual(current.sessionId, user.session.sessionId);
      const revoked = yield* failureOf(authenticate(other.token));
      assert.instanceOf(revoked, HttpApiError.Unauthorized);
      assert.deepStrictEqual(yield* sessionIds(user.ownerId), [user.session.sessionId]);
    }),
  );

  it.effect('removing the only remaining passkey is PasskeyLastCredential', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser();
      const other = yield* newSession(user.ownerId);

      const failure = yield* failureOf(
        remove(
          { ownerId: user.ownerId, sessionId: user.session.sessionId },
          user.passkey.credentialId,
        ),
      );

      assert.instanceOf(failure, PasskeyLastCredential);
      assert.strictEqual(yield* passkeyCount(user.ownerId), 1);
      assert.strictEqual((yield* authenticate(other.token)).sessionId, other.sessionId);
    }),
  );

  it.effect(
    'two concurrent removals of two passkeys: one wins, the other is PasskeyLastCredential',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const user = yield* signUpUser();
        const owner = { ownerId: user.ownerId, sessionId: user.session.sessionId };
        const secondCredential = yield* addPasskey(user.ownerId);

        const fiberA = yield* Effect.forkChild(
          Effect.exit(remove(owner, user.passkey.credentialId)),
        );
        const fiberB = yield* Effect.forkChild(Effect.exit(remove(owner, secondCredential)));
        const exits = [yield* Fiber.join(fiberA), yield* Fiber.join(fiberB)];

        assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
        const failures = exits.filter(Exit.isFailure);
        assert.strictEqual(failures.length, 1);
        assert.instanceOf(Cause.squash(failures[0].cause), PasskeyLastCredential);
        assert.strictEqual(yield* passkeyCount(user.ownerId), 1);
      }),
    15_000,
  );

  it.effect('regenerateRecoveryCodes replaces the codes and revokes the other sessions', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser();
      const other = yield* newSession(user.ownerId);

      const codes = yield* regenerateRecoveryCodes({
        ownerId: user.ownerId,
        sessionId: user.session.sessionId,
      });

      assert.strictEqual(codes.length, RECOVERY_CODE_COUNT);
      assert.strictEqual(new Set(codes).size, RECOVERY_CODE_COUNT);
      assert.isTrue(codes.every((code) => CODE_PATTERN.test(code)));
      assert.isTrue(codes.every((code) => !user.recoveryCodes.includes(code)));
      assert.deepStrictEqual(yield* me(user.ownerId), {
        name: 'Test user',
        recoveryCodesLeft: RECOVERY_CODE_COUNT,
      });
      assert.strictEqual(
        (yield* authenticate(user.session.token)).sessionId,
        user.session.sessionId,
      );
      const revoked = yield* failureOf(authenticate(other.token));
      assert.instanceOf(revoked, HttpApiError.Unauthorized);
      const oldCode = yield* failureOf(recover({ code: user.recoveryCodes[0] }));
      assert.instanceOf(oldCode, SignInFailed);
      const recovered = yield* recover({ code: codes[0] });
      assert.strictEqual(recovered.recoveryCodesLeft, RECOVERY_CODE_COUNT - 1);
    }),
  );

  it.effect(
    'regenerateRecoveryCodes with a revoked session is Unauthorized and changes nothing',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const user = yield* signUpUser();
        const other = yield* newSession(user.ownerId);
        const before = yield* codeHashes(user.ownerId);
        yield* deleteSession(user.ownerId, user.session.sessionId);

        const failure = yield* failureOf(
          regenerateRecoveryCodes({ ownerId: user.ownerId, sessionId: user.session.sessionId }),
        );

        assert.instanceOf(failure, HttpApiError.Unauthorized);
        assert.isTrue(sameHashes(before, yield* codeHashes(user.ownerId)));
        assert.strictEqual((yield* authenticate(other.token)).sessionId, other.sessionId);
        const recovered = yield* recover({ code: user.recoveryCodes[0] });
        assert.strictEqual(recovered.recoveryCodesLeft, RECOVERY_CODE_COUNT - 1);
      }),
  );

  it.effect(
    'regenerateRecoveryCodes waits for the owner lock and runs after the holder ends',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const user = yield* signUpUser();
        const before = yield* codeHashes(user.ownerId);
        const { release, holder } = yield* holdLock(user.ownerId);

        const regenerating = yield* Effect.forkChild(
          regenerateRecoveryCodes({
            ownerId: user.ownerId,
            sessionId: user.session.sessionId,
          }),
        );
        const waiting = yield* stillRunningAfterHalfSecond(regenerating);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const codes = yield* Fiber.join(regenerating);

        assert.isTrue(waiting);
        assert.strictEqual(codes.length, RECOVERY_CODE_COUNT);
        assert.isFalse(sameHashes(before, yield* codeHashes(user.ownerId)));
      }),
    15_000,
  );

  it.effect(
    'regenerateRecoveryCodes of a session revoked while it waited for the lock is Unauthorized',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const user = yield* signUpUser();
        const other = yield* newSession(user.ownerId);
        const before = yield* codeHashes(user.ownerId);
        const { release, holder } = yield* holdLock(user.ownerId, user.session.sessionId);

        const regenerating = yield* Effect.forkChild(
          regenerateRecoveryCodes({
            ownerId: user.ownerId,
            sessionId: user.session.sessionId,
          }),
        );
        const waiting = yield* stillRunningAfterHalfSecond(regenerating);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const failure = yield* failureOf(Fiber.join(regenerating));

        assert.isTrue(waiting);
        assert.instanceOf(failure, HttpApiError.Unauthorized);
        assert.strictEqual((yield* authenticate(other.token)).sessionId, other.sessionId);
        assert.isTrue(sameHashes(before, yield* codeHashes(user.ownerId)));
      }),
    15_000,
  );

  it.effect('signOut ends that session only', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser();
      const other = yield* newSession(user.ownerId);

      yield* signOut({ ownerId: user.ownerId, sessionId: user.session.sessionId });

      const gone = yield* failureOf(authenticate(user.session.token));
      assert.instanceOf(gone, HttpApiError.Unauthorized);
      assert.strictEqual((yield* authenticate(other.token)).sessionId, other.sessionId);
    }),
  );
});
