import { randomUUID } from 'node:crypto';
import { PgClient } from '@effect/sql-pg';
import { assert, layer } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Cause, Duration, Effect, Exit } from 'effect';
import { isSqlError, type SqlError } from 'effect/unstable/sql/SqlError';
import { appDatabase, Db, ownerDatabase } from './database';
import { trialItems } from './schema';
import { withOwner } from './with-owner';

// These tests run against the real database (docker compose) and prove that
// row-level security, not application code, separates owners (ADR 0007).
// Every owner id is random, so rows left by other runs never match.

const singleConnection = {
  maxConnections: 1,
  minConnections: 1,
  idleTimeout: Duration.hours(1),
};

const insertItem = (ownerId: string, title: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.insert(trialItems).values({ ownerId, title });
  });

const visibleOwners = Effect.gen(function* () {
  const db = yield* Db;
  const rows = yield* db.select({ ownerId: trialItems.ownerId }).from(trialItems);
  return new Set(rows.map((row) => row.ownerId));
});

const removeItemsOf = (ownerId: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* withOwner(ownerId, db.delete(trialItems));
  });

/** Drizzle wraps the driver's SqlError, possibly inside a Cause, in its query error. */
const findSqlError = (error: unknown): SqlError | undefined => {
  if (isSqlError(error)) return error;
  if (Cause.isCause(error)) return findSqlError(Cause.squash(error));
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return findSqlError(error.cause);
  }
  return undefined;
};

/** Fails unless `exit` is a rejection by a row-level security policy (SQLSTATE 42501). */
const assertRejectedByRls = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isSuccess(exit)) {
    return assert.fail(
      'expected the statement to be rejected by row-level security, but it succeeded',
    );
  }
  const error = Cause.squash(exit.cause);
  const sqlError = findSqlError(error);
  if (!sqlError) {
    return assert.fail(`expected an SqlError, got: ${String(error)}`);
  }
  assert.strictEqual(sqlError.reason._tag, 'AuthorizationError');
  // The SqlError message is generic; the PostgreSQL error is its reason's cause.
  assert.match(String(sqlError.reason.cause), /row-level security/);
};

layer(appDatabase())('as asys_app', (it) => {
  it.effect('a: withOwner(A) sees only A rows and withOwner(B) only B rows', () =>
    Effect.gen(function* () {
      const a = randomUUID();
      const b = randomUUID();
      yield* withOwner(a, insertItem(a, 'a item'));
      yield* withOwner(b, insertItem(b, 'b item'));

      assert.deepStrictEqual(yield* withOwner(a, visibleOwners), new Set([a]));
      assert.deepStrictEqual(yield* withOwner(b, visibleOwners), new Set([b]));

      yield* removeItemsOf(a);
      yield* removeItemsOf(b);
    }),
  );

  it.effect('c: inserting a row with another owner id is rejected by the with-check clause', () =>
    Effect.gen(function* () {
      const a = randomUUID();
      const b = randomUUID();
      // No RETURNING: that would also need the SELECT policy and hide the with-check clause.
      const exit = yield* Effect.exit(withOwner(a, insertItem(b, 'foreign item')));

      yield* removeItemsOf(b);
      assertRejectedByRls(exit);
    }),
  );

  it.effect('e: the SECURITY DEFINER lookup finds the owner while no owner is set', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const pg = yield* PgClient.PgClient;
      const a = randomUUID();
      const [item] = yield* withOwner(
        a,
        db
          .insert(trialItems)
          .values({ ownerId: a, title: 'lookup item' })
          .returning({ id: trialItems.id }),
      );

      const [found] = yield* pg<{ readonly owner: string | null }>`
        select trial_item_owner(${item.id}) as owner`;
      const direct = yield* db.select().from(trialItems).where(eq(trialItems.id, item.id));

      yield* removeItemsOf(a);
      assert.strictEqual(found.owner, a);
      assert.strictEqual(direct.length, 0);
    }),
  );
});

layer(appDatabase(singleConnection))('as asys_app on one fresh connection', (it) => {
  it.effect('b: with no owner set, a select returns zero rows and an insert fails', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const b = randomUUID();
      // Seeded through a separate pool, so this connection has never set app.owner_id.
      yield* withOwner(b, insertItem(b, 'b item')).pipe(Effect.provide(appDatabase()));

      // A connection that never set app.owner_id: current_setting returns NULL.
      assert.strictEqual((yield* db.select().from(trialItems)).length, 0);
      assertRejectedByRls(yield* Effect.exit(insertItem(b, 'no owner, fresh')));

      // The same connection after a transaction set it: current_setting returns ''.
      yield* withOwner(b, visibleOwners);
      assert.strictEqual((yield* db.select().from(trialItems)).length, 0);
      assertRejectedByRls(yield* Effect.exit(insertItem(b, 'no owner, reused')));

      yield* removeItemsOf(b).pipe(Effect.provide(appDatabase()));
    }),
  );
});

layer(appDatabase(singleConnection))('as asys_app on one connection', (it) => {
  it.effect('d: a query right after withOwner(A) on the same connection sees no rows', () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const pg = yield* PgClient.PgClient;
      const a = randomUUID();

      const inside = yield* withOwner(
        a,
        Effect.gen(function* () {
          yield* insertItem(a, 'a item');
          const [row] = yield* pg<{ readonly pid: number }>`select pg_backend_pid() as pid`;
          return row.pid;
        }),
      );
      const [after] = yield* pg<{ readonly pid: number }>`select pg_backend_pid() as pid`;
      const leaked = yield* db.select().from(trialItems);

      yield* removeItemsOf(a);
      assert.strictEqual(after.pid, inside, 'both queries must use the same backend');
      assert.strictEqual(leaked.length, 0);
    }),
  );
});

layer(ownerDatabase())('as asys_owner', (it) => {
  it.effect('f: forced row-level security still filters rows for the table owner', () =>
    Effect.gen(function* () {
      const a = randomUUID();
      const b = randomUUID();
      yield* withOwner(a, insertItem(a, 'a item'));
      yield* withOwner(b, insertItem(b, 'b item'));

      const seenByA = yield* withOwner(a, visibleOwners);
      const seenWithoutOwner = yield* visibleOwners;

      yield* removeItemsOf(a);
      yield* removeItemsOf(b);
      assert.deepStrictEqual(seenByA, new Set([a]));
      assert.strictEqual(seenWithoutOwner.size, 0);
    }),
  );
});
