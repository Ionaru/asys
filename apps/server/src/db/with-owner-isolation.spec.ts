// SPDX-License-Identifier: EUPL-1.2
import { PgClient } from '@effect/sql-pg';
import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { newOwner, removeOwner } from '../test/owners';
import { appDatabase } from './database';
import { withOwner } from './with-owner';

// These tests run against the real database (docker compose).

const currentLevel = Effect.gen(function* () {
  const pg = yield* PgClient.PgClient;
  const [row] = yield* pg<{
    readonly level: string;
  }>`select current_setting('transaction_isolation') as level`;
  return row.level;
});

layer(appDatabase())('withOwner isolation level', (it) => {
  it.effect('runs at read committed when no isolation level is given', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const level = yield* withOwner(owner, currentLevel);

      yield* removeOwner(owner);
      assert.strictEqual(level, 'read committed');
    }),
  );

  it.effect('runs at repeatable read when asked', () =>
    Effect.gen(function* () {
      const owner = yield* newOwner();
      const level = yield* withOwner(owner, currentLevel, { isolationLevel: 'repeatable read' });

      yield* removeOwner(owner);
      assert.strictEqual(level, 'repeatable read');
    }),
  );
});
