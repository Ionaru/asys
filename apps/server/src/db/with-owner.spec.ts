// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { PgClient } from '@effect/sql-pg';
import { assert, layer } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { removeOwner } from '../test/owners';
import { appDatabase, Db } from './database';
import { trialItems } from './schema';
import { withOwner } from './with-owner';

// These tests run against the real database (docker compose) and prove that
// row-level security, not application code, separates owners (ADR 0007).
// Every owner id is random, so rows left by other runs never match.
// The isolation tests live in isolation.spec.ts; this file keeps the trial
// lookup test, which goes with the lookup function when piece 3 removes it.

layer(appDatabase())('as asys_app', (it) => {
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

      yield* removeOwner(a);
      assert.strictEqual(found.owner, a);
      assert.strictEqual(direct.length, 0);
    }),
  );
});
