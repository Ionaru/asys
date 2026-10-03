// SPDX-License-Identifier: EUPL-1.2
import { randomBytes, randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import {
  CreatePasskeyResult,
  DeletePasskeyResult,
  PasskeyStore,
  type StoredPasskey,
} from '@ionaru/effect-passkeys/server';
import { Deferred, Effect, Fiber, Layer, Option } from 'effect';
import { TestClock } from 'effect/testing';
import { lockCounter } from '../changes/change-log';
import { appDatabase, Db } from '../db/database';
import { passkeys } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import { stillRunningAfterHalfSecond, storedPasskeyOf } from '../test/sign-up';
import { PasskeyStoreLive } from './passkey-store';

// These tests run against the real database (docker compose).

const T = 1_000_000;

const storedPasskey = (userId: string, overrides: Partial<StoredPasskey> = {}): StoredPasskey => ({
  userId,
  credentialId: randomBytes(24).toString('base64url'),
  publicKey: randomBytes(32).toString('base64url'),
  counter: 7,
  transports: ['internal', 'hybrid'],
  backedUp: true,
  name: 'Laptop',
  createdAt: T - 5000,
  lastUsedAt: T - 1000,
  ...overrides,
});

/** Seeds a passkey row directly, as `asys_app` under the owner. */
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
        lastUsedAt: passkey.lastUsedAt === null ? null : new Date(passkey.lastUsedAt),
      });
      return passkey;
    }),
  );

const rowsOf = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      return (yield* db.select().from(passkeys)).map(storedPasskeyOf);
    }),
  );

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

layer(PasskeyStoreLive.pipe(Layer.provideMerge(appDatabase())))('PasskeyStore', (it) => {
  it.effect('findPasskey finds a passkey of another owner as a StoredPasskey', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      const passkey = yield* seed(storedPasskey(a));
      yield* seed(storedPasskey(b));

      const found = yield* store.findPasskey(passkey.credentialId);

      assert.deepStrictEqual(found, Option.some(passkey));
    }),
  );

  it.effect('findPasskey of an unknown credential id gives none', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;

      const found = yield* store.findPasskey(randomBytes(24).toString('base64url'));

      assert.isTrue(Option.isNone(found));
    }),
  );

  it.effect('listPasskeys lists the passkeys of the user only', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      const first = yield* seed(storedPasskey(a));
      const second = yield* seed(storedPasskey(a, { lastUsedAt: null }));
      yield* seed(storedPasskey(b));

      const listed = yield* store.listPasskeys(a);

      assert.deepStrictEqual(
        listed.toSorted((x, y) => x.credentialId.localeCompare(y.credentialId)),
        [first, second].toSorted((x, y) => x.credentialId.localeCompare(y.credentialId)),
      );
    }),
  );

  it.effect('createPasskey of a credential id that is already stored is a Duplicate', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      const existing = yield* seed(storedPasskey(a));

      const result = yield* store.createPasskey(
        storedPasskey(b, { credentialId: existing.credentialId, name: 'Other' }),
      );

      assert.strictEqual(result, CreatePasskeyResult.Duplicate);
      assert.deepStrictEqual(yield* rowsOf(b), []);
      assert.deepStrictEqual(yield* rowsOf(a), [existing]);
    }),
  );

  it.effect('createPasskey of a new credential id is Created and stored', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();
      const passkey = storedPasskey(a);

      const result = yield* store.createPasskey(passkey);

      assert.strictEqual(result, CreatePasskeyResult.Created);
      assert.deepStrictEqual(yield* rowsOf(a), [passkey]);
    }),
  );

  it.effect('updateCounter is a compare-and-set that records the use', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();
      const passkey = yield* seed(storedPasskey(a, { counter: 0, lastUsedAt: null }));

      const first = yield* store.updateCounter(passkey.credentialId, 0, 1, T);
      const repeated = yield* store.updateCounter(passkey.credentialId, 0, 1, T);

      assert.isTrue(first);
      assert.isFalse(repeated);
      const [row] = yield* rowsOf(a);
      assert.strictEqual(row.counter, 1);
      assert.strictEqual(row.lastUsedAt, T);
    }),
  );

  it.effect('updateCounter of an unknown credential id is false', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;

      const result = yield* store.updateCounter(randomBytes(24).toString('base64url'), 0, 1, T);

      assert.isFalse(result);
    }),
  );

  it.effect('deletePasskey keeps the only passkey when keepLast is set', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();
      const passkey = yield* seed(storedPasskey(a));

      const result = yield* store.deletePasskey(a, passkey.credentialId, true);

      assert.strictEqual(result, DeletePasskeyResult.LastPasskey);
      assert.deepStrictEqual(yield* rowsOf(a), [passkey]);
    }),
  );

  it.effect('deletePasskey deletes one of two passkeys', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();
      const first = yield* seed(storedPasskey(a));
      const second = yield* seed(storedPasskey(a));

      const result = yield* store.deletePasskey(a, first.credentialId, true);

      assert.strictEqual(result, DeletePasskeyResult.Deleted);
      assert.deepStrictEqual(yield* rowsOf(a), [second]);
    }),
  );

  it.effect("deletePasskey of another owner's credential id is NotFound", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();
      const b = yield* scopedOwner();
      yield* seed(storedPasskey(a));
      const others = yield* seed(storedPasskey(b));

      const result = yield* store.deletePasskey(a, others.credentialId, true);

      assert.strictEqual(result, DeletePasskeyResult.NotFound);
      assert.deepStrictEqual(yield* rowsOf(b), [others]);
    }),
  );

  it.effect('userName is the name of the user, and none for an unknown user', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const store = yield* PasskeyStore;
      const a = yield* scopedOwner();

      const known = yield* store.userName(a);
      const unknown = yield* store.userName(randomUUID());

      assert.deepStrictEqual(known, Option.some('Test owner'));
      assert.isTrue(Option.isNone(unknown));
    }),
  );

  it.effect(
    'deletePasskey waits for the owner lock and runs after the holder ends',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const store = yield* PasskeyStore;
        const a = yield* scopedOwner();
        const first = yield* seed(storedPasskey(a));
        const second = yield* seed(storedPasskey(a));
        const holding = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const holder = yield* Effect.forkChild(
          withOwner(
            a,
            Effect.gen(function* () {
              yield* lockCounter;
              yield* Deferred.succeed(holding, undefined);
              yield* Deferred.await(release);
            }),
          ),
        );
        yield* Deferred.await(holding);

        const deletion = yield* Effect.forkChild(store.deletePasskey(a, first.credentialId, true));
        const waiting = yield* stillRunningAfterHalfSecond(deletion);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const result = yield* Fiber.join(deletion);

        assert.isTrue(waiting);
        assert.strictEqual(result, DeletePasskeyResult.Deleted);
        assert.deepStrictEqual(yield* rowsOf(a), [second]);
      }),
    15_000,
  );

  it.effect(
    'updateCounter waits for the owner lock and runs after the holder ends',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const store = yield* PasskeyStore;
        const a = yield* scopedOwner();
        const passkey = yield* seed(storedPasskey(a, { counter: 0, lastUsedAt: null }));
        const { release, holder } = yield* holdLock(a);

        const update = yield* Effect.forkChild(store.updateCounter(passkey.credentialId, 0, 1, T));
        const waiting = yield* stillRunningAfterHalfSecond(update);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const result = yield* Fiber.join(update);

        assert.isTrue(waiting);
        assert.isTrue(result);
        const [row] = yield* rowsOf(a);
        assert.strictEqual(row.counter, 1);
      }),
    15_000,
  );

  it.effect(
    'createPasskey waits for the owner lock and runs after the holder ends',
    () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(T);
        const store = yield* PasskeyStore;
        const a = yield* scopedOwner();
        const passkey = storedPasskey(a);
        const { release, holder } = yield* holdLock(a);

        const creation = yield* Effect.forkChild(store.createPasskey(passkey));
        const waiting = yield* stillRunningAfterHalfSecond(creation);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const result = yield* Fiber.join(creation);

        assert.isTrue(waiting);
        assert.strictEqual(result, CreatePasskeyResult.Created);
        assert.deepStrictEqual(yield* rowsOf(a), [passkey]);
      }),
    15_000,
  );
});
