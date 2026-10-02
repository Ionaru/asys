// SPDX-License-Identifier: EUPL-1.2
import { sql } from 'drizzle-orm';
import type { PgTransactionConfig } from 'drizzle-orm/pg-core';
import { Effect } from 'effect';
import { Db } from './database';

export interface WithOwnerOptions {
  readonly isolationLevel?: NonNullable<PgTransactionConfig['isolationLevel']>;
}

/**
 * Runs `effect` in one transaction whose first statement sets the current owner
 * for row-level security. The setting is transaction-local, so it ends with the
 * transaction and never leaks to the next use of the pooled connection.
 * Without `options.isolationLevel` the transaction uses PostgreSQL's default (read committed).
 */
export const withOwner = <A, E, R>(
  ownerId: string,
  effect: Effect.Effect<A, E, R>,
  options?: WithOwnerOptions,
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    return yield* db.transaction(
      (tx) =>
        Effect.gen(function* () {
          yield* tx.execute(sql`select set_config('app.owner_id', ${ownerId}, true)`);
          return yield* effect;
        }),
      options?.isolationLevel === undefined
        ? undefined
        : { isolationLevel: options.isolationLevel },
    );
  });
