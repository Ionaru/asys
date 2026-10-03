// SPDX-License-Identifier: MIT

import { assert, describe, it } from '@effect/vitest';
import { Effect, Option } from 'effect';
import { TestClock } from 'effect/testing';
import { type ChallengeEntry, ChallengePurpose, PasskeyChallenges } from './challenges';

const T = 1_000_000;

const registerEntry: ChallengeEntry = {
  purpose: ChallengePurpose.Register,
  challenge: 'c-register',
  userId: 'user-1',
  userName: 'Ann',
};

const authenticateEntry = (challenge: string): ChallengeEntry => ({
  purpose: ChallengePurpose.Authenticate,
  challenge,
});

describe('PasskeyChallenges.memory', () => {
  it.effect('returns a put entry once and none the second time', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const challenges = yield* PasskeyChallenges;

      yield* challenges.put('id-1', registerEntry);

      assert.deepStrictEqual(yield* challenges.take('id-1'), Option.some(registerEntry));
      assert.deepStrictEqual(yield* challenges.take('id-1'), Option.none());
    }).pipe(Effect.provide(PasskeyChallenges.memory())),
  );

  it.effect('returns none for an unknown challenge id', () =>
    Effect.gen(function* () {
      const challenges = yield* PasskeyChallenges;

      assert.deepStrictEqual(yield* challenges.take('nothing'), Option.none());
    }).pipe(Effect.provide(PasskeyChallenges.memory())),
  );

  it.effect('returns an entry 299999 ms after it was put', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const challenges = yield* PasskeyChallenges;
      yield* challenges.put('id-1', authenticateEntry('c1'));

      yield* TestClock.adjust(299_999);

      assert.deepStrictEqual(yield* challenges.take('id-1'), Option.some(authenticateEntry('c1')));
    }).pipe(Effect.provide(PasskeyChallenges.memory())),
  );

  it.effect('drops an entry 300000 ms after it was put, and a second take finds none', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const challenges = yield* PasskeyChallenges;
      yield* challenges.put('id-1', authenticateEntry('c1'));

      yield* TestClock.adjust(300_000);

      assert.deepStrictEqual(yield* challenges.take('id-1'), Option.none());
      assert.deepStrictEqual(yield* challenges.take('id-1'), Option.none());
    }).pipe(Effect.provide(PasskeyChallenges.memory())),
  );

  it.effect('honours a custom ttl', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const challenges = yield* PasskeyChallenges;
      yield* challenges.put('id-1', authenticateEntry('c1'));
      yield* challenges.put('id-2', authenticateEntry('c2'));

      yield* TestClock.adjust(999);
      assert.isTrue(Option.isSome(yield* challenges.take('id-1')));

      yield* TestClock.adjust(1);
      assert.deepStrictEqual(yield* challenges.take('id-2'), Option.none());
    }).pipe(Effect.provide(PasskeyChallenges.memory({ ttl: '1 second' }))),
  );

  it.effect('evicts the oldest entry of a full purpose partition', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const challenges = yield* PasskeyChallenges;

      yield* challenges.put('a', authenticateEntry('ca'));
      yield* challenges.put('b', authenticateEntry('cb'));
      yield* challenges.put('c', authenticateEntry('cc'));

      assert.deepStrictEqual(yield* challenges.take('a'), Option.none());
      assert.deepStrictEqual(yield* challenges.take('b'), Option.some(authenticateEntry('cb')));
      assert.deepStrictEqual(yield* challenges.take('c'), Option.some(authenticateEntry('cc')));
    }).pipe(Effect.provide(PasskeyChallenges.memory({ capacityPerPurpose: 2 }))),
  );

  it.effect('never evicts entries of another purpose', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const challenges = yield* PasskeyChallenges;

      yield* challenges.put('r', registerEntry);
      yield* challenges.put('a', authenticateEntry('ca'));
      yield* challenges.put('b', authenticateEntry('cb'));
      yield* challenges.put('c', authenticateEntry('cc'));

      assert.deepStrictEqual(yield* challenges.take('r'), Option.some(registerEntry));
    }).pipe(Effect.provide(PasskeyChallenges.memory({ capacityPerPurpose: 2 }))),
  );

  it.effect('starts every build of the layer with an empty store', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      yield* Effect.gen(function* () {
        const challenges = yield* PasskeyChallenges;
        yield* challenges.put('id-1', registerEntry);
      }).pipe(Effect.provide(PasskeyChallenges.memory()));

      const fresh = yield* Effect.gen(function* () {
        const challenges = yield* PasskeyChallenges;
        return yield* challenges.take('id-1');
      }).pipe(Effect.provide(PasskeyChallenges.memory()));

      assert.deepStrictEqual(fresh, Option.none());
    }),
  );
});
