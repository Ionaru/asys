// SPDX-License-Identifier: EUPL-1.2
import { SignInFailed } from '@asys/contract';
import { assert, layer } from '@effect/vitest';
import { beginAuthentication, finishAuthentication } from '@ionaru/effect-passkeys/server';
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from 'effect';
import { HttpApiError } from 'effect/http-api';
import { TestClock } from 'effect/testing';
import { lockCounter } from '../changes/change-log';
import { appDatabase, Db } from '../db/database';
import { passkeys, recoveryCodes, sessions } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { passkeyTestLayer, signUpUser, stillRunningAfterHalfSecond } from '../test/sign-up';
import { PasskeyStoreLive } from './passkey-store';
import { newRecoveryCode, normalizeRecoveryCode, RECOVERY_CODE_COUNT } from './recovery-codes';
import { authenticate } from './sessions';
import { recover, signIn } from './sign-in';
import { PasskeyUnitOfWorkLive } from './unit-of-work';
import { hashToken } from './tokens';

// These tests run against the real database (docker compose).

const T = 1_000_000;

class Boom {
  readonly _tag = 'Boom';
}

/** The failure of `effect`. A success dies without printing its value, which holds secrets. */
const failureOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.andThen(() => Effect.die('Expected a failure, got a success')),
    Effect.flip,
  );

const rowsOf = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      return {
        passkeys: yield* db.select().from(passkeys),
        codes: yield* db.select().from(recoveryCodes),
        sessions: yield* db.select().from(sessions),
      };
    }),
  );

const codeRowOf = (ownerId: string, code: string) =>
  Effect.gen(function* () {
    const rows = yield* rowsOf(ownerId);
    const hash = hashToken(normalizeRecoveryCode(code) ?? '');
    return rows.codes.filter((row) => row.codeHash === hash)[0];
  });

const testLayer = Layer.mergeAll(PasskeyStoreLive, PasskeyUnitOfWorkLive).pipe(
  Layer.provideMerge(appDatabase()),
  Layer.provideMerge(passkeyTestLayer),
);

layer(testLayer)('sign-in', (it) => {
  it.effect('a soft assertion signs in, counts the use and returns me and a session', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser({ name: 'Ann' });
      const challenge = yield* beginAuthentication();
      const response = user.authenticator.authenticate(challenge.options, user.credential);

      const result = yield* finishAuthentication(
        { challengeId: challenge.challengeId, response },
        signIn,
      );

      assert.strictEqual(result.me.name, 'Ann');
      assert.strictEqual(result.me.recoveryCodesLeft, RECOVERY_CODE_COUNT);
      const rows = yield* rowsOf(user.ownerId);
      assert.strictEqual(rows.passkeys.length, 1);
      assert.strictEqual(rows.passkeys[0].counter, 1);
      assert.strictEqual(rows.passkeys[0].lastUsedAt?.getTime(), T);
      assert.strictEqual(rows.sessions.length, 2);
      const authenticated = yield* authenticate(result.session.token);
      assert.strictEqual(authenticated.ownerId, user.ownerId);
      assert.strictEqual(authenticated.sessionId, result.session.sessionId);
    }),
  );

  it.effect('a failing hook rolls back the counter and the session', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser();
      const challenge = yield* beginAuthentication();
      const response = user.authenticator.authenticate(challenge.options, user.credential);

      const failure = yield* failureOf(
        finishAuthentication({ challengeId: challenge.challengeId, response }, (passkey) =>
          signIn(passkey).pipe(Effect.andThen(Effect.fail(new Boom()))),
        ),
      );

      assert.instanceOf(failure, Boom);
      const rows = yield* rowsOf(user.ownerId);
      assert.strictEqual(rows.passkeys[0].counter, 0);
      assert.strictEqual(rows.passkeys[0].lastUsedAt, null);
      assert.deepStrictEqual(
        rows.sessions.map((row) => row.id),
        [user.session.sessionId],
      );
    }),
  );

  it.effect('recover with a lower-case code with spaces signs in and spends the code', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser();
      const code = user.recoveryCodes[1];
      const typed = code.toLowerCase().replaceAll('-', ' ');

      const result = yield* recover({ code: typed });

      assert.strictEqual(result.recoveryCodesLeft, RECOVERY_CODE_COUNT - 1);
      const row = yield* codeRowOf(user.ownerId, code);
      assert.strictEqual(row.usedAt?.getTime(), T);
      const old = yield* failureOf(authenticate(user.session.token));
      assert.instanceOf(old, HttpApiError.Unauthorized);
      const authenticated = yield* authenticate(result.session.token);
      assert.strictEqual(authenticated.ownerId, user.ownerId);
      assert.strictEqual(authenticated.sessionId, result.session.sessionId);
    }),
  );

  it.effect('recover refuses a used, a malformed and a never issued code', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const user = yield* signUpUser();
      yield* recover({ code: user.recoveryCodes[0] });

      const again = yield* failureOf(recover({ code: user.recoveryCodes[0] }));
      const malformed = yield* failureOf(recover({ code: 'nope' }));
      const unknown = yield* failureOf(recover({ code: newRecoveryCode() }));

      assert.instanceOf(again, SignInFailed);
      assert.instanceOf(malformed, SignInFailed);
      assert.instanceOf(unknown, SignInFailed);
    }),
  );

  it.effect(
    'two concurrent recovers with one code: one wins, the other is SignInFailed',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const user = yield* signUpUser();
        const code = user.recoveryCodes[2];

        const fiberA = yield* Effect.forkChild(Effect.exit(recover({ code })));
        const fiberB = yield* Effect.forkChild(Effect.exit(recover({ code })));
        const exits = [yield* Fiber.join(fiberA), yield* Fiber.join(fiberB)];

        assert.strictEqual(exits.filter(Exit.isSuccess).length, 1);
        const failures = exits.filter(Exit.isFailure);
        assert.strictEqual(failures.length, 1);
        assert.instanceOf(Cause.squash(failures[0].cause), SignInFailed);
        const rows = yield* rowsOf(user.ownerId);
        assert.strictEqual(rows.codes.filter((row) => row.usedAt !== null).length, 1);
        assert.strictEqual(rows.sessions.length, 1);
      }),
    15_000,
  );

  it.effect(
    'recover waits for the owner lock and runs after the holder ends',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const user = yield* signUpUser();
        const code = user.recoveryCodes[3];
        const holding = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const holder = yield* Effect.forkChild(
          withOwner(
            user.ownerId,
            Effect.gen(function* () {
              yield* lockCounter;
              yield* Deferred.succeed(holding, undefined);
              yield* Deferred.await(release);
            }),
          ),
        );
        yield* Deferred.await(holding);

        const recovering = yield* Effect.forkChild(recover({ code }));
        const waiting = yield* stillRunningAfterHalfSecond(recovering);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const result = yield* Fiber.join(recovering);

        assert.isTrue(waiting);
        assert.isTrue(result.recoveryCodesLeft === RECOVERY_CODE_COUNT - 1);
        const row = yield* codeRowOf(user.ownerId, code);
        assert.isTrue(row.usedAt !== null);
      }),
    15_000,
  );
});
