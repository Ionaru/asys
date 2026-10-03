// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import { Cause, Effect, Exit, Random } from 'effect';
import { MAX_ATTEMPTS, retryDelay } from './backoff';

const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const capMs = 3_600_000;

describe('MAX_ATTEMPTS', () => {
  it('is 8', () => {
    assert.strictEqual(MAX_ATTEMPTS, 8);
  });
});

describe('retryDelay', () => {
  it.effect('grows exponentially from 1 second with a jitter factor of 0.8 to 1.2', () =>
    Effect.gen(function* () {
      for (let attempts = 1; attempts <= 8; attempts++) {
        const delay = yield* retryDelay(attempts).pipe(Random.withSeed('backoff'));
        const base = 2 ** (attempts - 1);

        assert.isTrue(Number.isInteger(delay), `attempt ${attempts} gave ${delay}`);
        assert.isTrue(delay >= 800 * base, `attempt ${attempts} gave ${delay}`);
        assert.isTrue(delay <= 1200 * base, `attempt ${attempts} gave ${delay}`);
      }
    }),
  );

  it.effect('caps the delay at 1 hour', () =>
    Effect.gen(function* () {
      for (const seed of seeds) {
        for (const attempts of [13, 20, 40]) {
          const delay = yield* retryDelay(attempts).pipe(Random.withSeed(seed));

          assert.isTrue(delay <= capMs, `seed ${seed} attempt ${attempts} gave ${delay}`);
        }
      }
    }),
  );

  it.effect('applies jitter before the cap, so attempt 13 stays within 0.8 to 1 hour', () =>
    Effect.gen(function* () {
      for (const seed of seeds) {
        const delay = yield* retryDelay(13).pipe(Random.withSeed(seed));

        assert.isTrue(delay >= 2_880_000, `seed ${seed} gave ${delay}`);
      }
    }),
  );

  it.effect('is repeatable for the same seed', () =>
    Effect.gen(function* () {
      const first = yield* retryDelay(3).pipe(Random.withSeed('a'));
      const second = yield* retryDelay(3).pipe(Random.withSeed('a'));

      assert.strictEqual(first, second);
    }),
  );

  it.effect('differs between seeds', () =>
    Effect.gen(function* () {
      const a = yield* retryDelay(3).pipe(Random.withSeed('a'));
      const b = yield* retryDelay(3).pipe(Random.withSeed('b'));

      assert.notStrictEqual(a, b);
    }),
  );

  it.effect('dies on attempts below 1', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(retryDelay(0));

      assert.isTrue(Exit.isFailure(exit));
      assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause));
    }),
  );
});
