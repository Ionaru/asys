// SPDX-License-Identifier: EUPL-1.2
import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit } from 'effect';
import { TestClock } from 'effect/testing';
import { appDatabase, Db } from '../db/database';
import { signUpLinks, users } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { removeOwner } from '../test/owners';
import { hashToken } from './tokens';
import { createSignUpLink, MAX_LINK_DAYS } from './sign-up-links';

// These tests run against the real database (docker compose).

const T = 1_000_000;

const DAY_MS = 24 * 60 * 60 * 1000;

const assertDies = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect);

    assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause) && !Cause.hasFails(exit.cause));
  });

layer(appDatabase())('createSignUpLink', (it) => {
  it.effect('stores the hash of the token, T plus 7 days as expiry, and no user', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const link = yield* createSignUpLink({ expiresInDays: 7 });
      yield* Effect.addFinalizer(() => removeOwner(link.ownerId).pipe(Effect.orDie));

      const { links, owners } = yield* withOwner(
        link.ownerId,
        Effect.gen(function* () {
          const db = yield* Db;
          return {
            links: yield* db.select().from(signUpLinks),
            owners: yield* db.select().from(users),
          };
        }),
      );

      assert.isTrue(/^[A-Za-z0-9_-]{43}$/.test(link.token));
      assert.strictEqual(link.expiresAt, T + 7 * DAY_MS);
      assert.strictEqual(links.length, 1);
      const [row] = links;
      assert.strictEqual(row.ownerId, link.ownerId);
      assert.strictEqual(row.id, link.linkId);
      assert.isTrue(row.tokenHash === hashToken(link.token));
      assert.strictEqual(row.createdAt.getTime(), T);
      assert.strictEqual(row.expiresAt.getTime(), T + 7 * DAY_MS);
      assert.strictEqual(row.usedAt, null);
      assert.deepStrictEqual(owners, []);
    }),
  );

  it.effect('gives every link its own token and owner', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const first = yield* createSignUpLink({ expiresInDays: 1 });
      yield* Effect.addFinalizer(() => removeOwner(first.ownerId).pipe(Effect.orDie));
      const second = yield* createSignUpLink({ expiresInDays: MAX_LINK_DAYS });
      yield* Effect.addFinalizer(() => removeOwner(second.ownerId).pipe(Effect.orDie));

      assert.isTrue(first.token !== second.token);
      assert.notStrictEqual(first.ownerId, second.ownerId);
      assert.strictEqual(first.expiresAt, T + DAY_MS);
      assert.strictEqual(second.expiresAt, T + 30 * DAY_MS);
    }),
  );

  it.effect('dies unless the days are an integer from 1 to 30', () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(T);

      yield* assertDies(createSignUpLink({ expiresInDays: 0 }));
      yield* assertDies(createSignUpLink({ expiresInDays: 31 }));
      yield* assertDies(createSignUpLink({ expiresInDays: 1.5 }));
    }),
  );
});
