// SPDX-License-Identifier: EUPL-1.2
import { randomBytes, randomUUID } from 'node:crypto';
import { CurrentOwner } from '@asys/contract';
import { assert, layer } from '@effect/vitest';
import {
  CreatePasskeyResult,
  PasskeyStore,
  PasskeyUnitOfWork,
  type StoredPasskey,
} from '@ionaru/effect-passkeys/server';
import { eq } from 'drizzle-orm';
import { Cause, Data, Deferred, Effect, Exit, Fiber, Layer, Ref } from 'effect';
import { HttpApiError } from 'effect/http-api';
import { TestClock } from 'effect/testing';
import { lockCounter } from '../changes/change-log';
import { appDatabase, Db } from '../db/database';
import { passkeys, sessions } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { stillRunningAfterHalfSecond } from '../test/sign-up';
import { PasskeyStoreLive } from './passkey-store';
import { createSession } from './sessions';
import { PasskeyUnitOfWorkLive } from './unit-of-work';

// These tests run against the real database (docker compose).

const T = 1_000_000;

class Boom extends Data.TaggedError('Boom')<{ readonly detail: string }> {}

const storedPasskey = (userId: string): StoredPasskey => ({
  userId,
  credentialId: randomBytes(24).toString('base64url'),
  publicKey: randomBytes(32).toString('base64url'),
  counter: 0,
  transports: [],
  backedUp: false,
  name: 'Passkey',
  createdAt: T,
  lastUsedAt: null,
});

const seed = (passkey: StoredPasskey) =>
  withOwner(
    passkey.userId,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db.insert(passkeys).values({
        ownerId: passkey.userId,
        id: randomUUID(),
        credentialId: passkey.credentialId,
        publicKey: passkey.publicKey,
        counter: passkey.counter,
        transports: passkey.transports,
        backedUp: passkey.backedUp,
        name: passkey.name,
        createdAt: new Date(passkey.createdAt),
        lastUsedAt: null,
      });
      return passkey;
    }),
  );

/** A session for `ownerId`, created as its caller would: inside the owner's transaction after the lock. */
const newSession = (ownerId: string) =>
  withOwner(ownerId, lockCounter.pipe(Effect.andThen(createSession(ownerId))));

const removeSession = (ownerId: string, sessionId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db.delete(sessions).where(eq(sessions.id, sessionId));
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

/** Whether an exit is a defect only, and that defect is an `Unauthorized`. */
const diedUnauthorized = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) &&
  Cause.hasDies(exit.cause) &&
  !Cause.hasFails(exit.cause) &&
  Cause.squash(exit.cause) instanceof HttpApiError.Unauthorized;

layer(
  Layer.mergeAll(PasskeyStoreLive, PasskeyUnitOfWorkLive).pipe(Layer.provideMerge(appDatabase())),
)('PasskeyUnitOfWork', (it) => {
  it.effect('a failure after createPasskey rolls the passkey back', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const unitOfWork = yield* PasskeyUnitOfWork;
      const a = yield* scopedOwner();

      yield* Effect.flip(
        unitOfWork.run(
          a,
          Effect.gen(function* () {
            yield* store.createPasskey(storedPasskey(a));
            return yield* new Boom({ detail: 'after the insert' });
          }),
        ),
      );

      assert.deepStrictEqual(yield* store.listPasskeys(a), []);
    }),
  );

  it.effect('a duplicate inside a run is a Duplicate and the run can go on', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const unitOfWork = yield* PasskeyUnitOfWork;
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      const existing = yield* seed(storedPasskey(b));
      const fresh = storedPasskey(a);

      const outcome = yield* unitOfWork.run(
        a,
        Effect.gen(function* () {
          const created = yield* store.createPasskey(fresh);
          const duplicate = yield* store.createPasskey({
            ...storedPasskey(a),
            credentialId: existing.credentialId,
          });
          const listed = yield* store.listPasskeys(a);
          return { created, duplicate, listed };
        }),
      );

      assert.strictEqual(outcome.created, CreatePasskeyResult.Created);
      assert.strictEqual(outcome.duplicate, CreatePasskeyResult.Duplicate);
      assert.deepStrictEqual(outcome.listed, [fresh]);
      assert.deepStrictEqual(yield* store.listPasskeys(a), [fresh]);
    }),
  );

  it.effect(
    'a run holds the owner lock until it ends',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const unitOfWork = yield* PasskeyUnitOfWork;
        const a = yield* scopedOwner();
        const inside = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const run = yield* Effect.forkChild(
          unitOfWork.run(
            a,
            Effect.gen(function* () {
              yield* Deferred.succeed(inside, undefined);
              yield* Deferred.await(release);
            }),
          ),
        );
        yield* Deferred.await(inside);

        const locking = yield* Effect.forkChild(withOwner(a, lockCounter));
        const waiting = yield* stillRunningAfterHalfSecond(locking);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(run);
        yield* Fiber.join(locking);

        assert.isTrue(waiting);
      }),
    15_000,
  );

  it.effect('a run with the CurrentOwner of a live session runs the effect', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const unitOfWork = yield* PasskeyUnitOfWork;
      const a = yield* scopedOwner();
      const session = yield* newSession(a);

      const result = yield* unitOfWork
        .run(a, Effect.succeed('ran'))
        .pipe(Effect.provideService(CurrentOwner, { ownerId: a, sessionId: session.sessionId }));

      assert.strictEqual(result, 'ran');
    }),
  );

  it.effect('a run with the CurrentOwner of a deleted session dies of Unauthorized', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const unitOfWork = yield* PasskeyUnitOfWork;
      const a = yield* scopedOwner();
      const session = yield* newSession(a);
      yield* removeSession(a, session.sessionId);
      const ran = yield* Ref.make(false);

      const exit = yield* Effect.exit(
        unitOfWork
          .run(a, Ref.set(ran, true))
          .pipe(Effect.provideService(CurrentOwner, { ownerId: a, sessionId: session.sessionId })),
      );

      assert.isTrue(diedUnauthorized(exit));
      assert.isFalse(yield* Ref.get(ran));
    }),
  );

  it.effect(
    'a run of a session revoked while it waited for the lock dies of Unauthorized',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const store = yield* PasskeyStore;
        const unitOfWork = yield* PasskeyUnitOfWork;
        const a = yield* scopedOwner();
        const session = yield* newSession(a);
        const holding = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const holder = yield* Effect.forkChild(
          withOwner(
            a,
            Effect.gen(function* () {
              yield* lockCounter;
              const db = yield* Db;
              yield* db.delete(sessions).where(eq(sessions.id, session.sessionId));
              yield* Deferred.succeed(holding, undefined);
              yield* Deferred.await(release);
            }),
          ),
        );
        yield* Deferred.await(holding);

        const run = yield* Effect.forkChild(
          Effect.exit(
            unitOfWork
              .run(a, store.createPasskey(storedPasskey(a)))
              .pipe(
                Effect.provideService(CurrentOwner, { ownerId: a, sessionId: session.sessionId }),
              ),
          ),
        );
        const waiting = yield* stillRunningAfterHalfSecond(run);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const exit = yield* Fiber.join(run);

        assert.isTrue(waiting);
        assert.isTrue(diedUnauthorized(exit));
        assert.strictEqual(yield* passkeyCount(a), 0);
      }),
    15_000,
  );

  it.effect('the failure of the effect comes back unchanged', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const unitOfWork = yield* PasskeyUnitOfWork;
      const a = yield* scopedOwner();
      const boom = new Boom({ detail: 'the same error' });

      const failure = yield* Effect.flip(unitOfWork.run(a, Effect.fail(boom)));

      assert.strictEqual(failure, boom);
      assert.strictEqual(failure._tag, 'Boom');
    }),
  );
});
