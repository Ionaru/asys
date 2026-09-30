// SPDX-License-Identifier: EUPL-1.2
import { PgClient } from '@effect/sql-pg';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import { Config, Context, Duration, Effect, Layer } from 'effect';

type Database = Effect.Success<ReturnType<typeof makeWithDefaults>>;

/** The Drizzle database, running on the `PgClient` it is provided with. */
export class Db extends Context.Service<Db, Database>()('asys/Db') {}

interface PoolOptions {
  readonly maxConnections?: number;
  readonly minConnections?: number;
  readonly idleTimeout?: Duration.Input;
}

const database = (urlVariable: string, pool: PoolOptions) =>
  Layer.effect(Db)(makeWithDefaults()).pipe(
    Layer.provideMerge(
      Layer.unwrap(
        Effect.map(Config.Redacted(urlVariable), (url) => PgClient.layer({ url, ...pool })),
      ),
    ),
  );

/** Connected as `asys_app`, which owns nothing and is subject to row-level security. */
export const appDatabase = (pool: PoolOptions = {}) => database('DATABASE_URL_APP', pool);

/** Connected as `asys_owner`, which owns the tables; FORCE ROW LEVEL SECURITY still applies. */
export const ownerDatabase = (pool: PoolOptions = {}) => database('DATABASE_URL_OWNER', pool);
