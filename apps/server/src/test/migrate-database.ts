// SPDX-License-Identifier: EUPL-1.2
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PgClient } from '@effect/sql-pg';
import { Effect, Redacted } from 'effect';

export const MIGRATE_TEST_DATABASE = 'asys_migrate_test';

const COMMITTED_FOLDER = resolve(import.meta.dirname, '../../drizzle');

/** The number of committed migrations: subdirectories of `apps/server/drizzle` holding a `migration.sql`. */
export const COMMITTED_MIGRATION_COUNT: number = readdirSync(COMMITTED_FOLDER, {
  withFileTypes: true,
}).filter(
  (entry) => entry.isDirectory() && existsSync(join(COMMITTED_FOLDER, entry.name, 'migration.sql')),
).length;

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`${key} is not set (see .env)`);
  }
  return value;
};

/** The URL of the dev server's `postgres` database as the superuser, built from the owner URL's host. */
const superuserUrl = (): string => {
  const owner = new URL(requiredEnv('DATABASE_URL_OWNER'));
  const url = new URL(`postgresql://${owner.host}/postgres`);
  url.username = 'postgres';
  url.password = requiredEnv('POSTGRES_PASSWORD');
  return url.toString();
};

/** `DATABASE_URL_OWNER` with its path replaced by the throwaway database. */
const ownerUrlFor = (database: string): string => {
  const url = new URL(requiredEnv('DATABASE_URL_OWNER'));
  url.pathname = `/${database}`;
  return url.toString();
};

const assertThrowaway = (database: string): void => {
  if (database !== MIGRATE_TEST_DATABASE) {
    throw new Error(`Refusing to touch a database other than ${MIGRATE_TEST_DATABASE}`);
  }
};

/** Runs `use` on a connection to `url`, closed when the effect ends. Failures never carry a URL or password. */
const withConnection = <A>(
  url: string,
  message: string,
  use: (sql: PgClient.PgClient) => Effect.Effect<A, unknown>,
) =>
  Effect.gen(function* () {
    const sql = yield* PgClient.PgClient;
    return yield* use(sql);
  }).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(url) })),
    Effect.scoped,
    Effect.mapError(() => new Error(message)),
  );

/** Runs statements as the superuser. */
const asSuperuser = (statements: ReadonlyArray<string>) =>
  Effect.suspend(() =>
    withConnection(superuserUrl(), 'Could not run the throwaway database statements', (sql) =>
      Effect.forEach(statements, (statement) => sql.unsafe(statement), { discard: true }),
    ),
  );

const drop = `DROP DATABASE IF EXISTS ${MIGRATE_TEST_DATABASE} WITH (FORCE)`;

/**
 * Recreates the empty throwaway database `asys_migrate_test` owned by `asys_owner`, and drops it when
 * the scope closes, even on failure. Yields the owner URL of that database. Refuses any other name.
 */
export const migrateDatabase = (database: string = MIGRATE_TEST_DATABASE) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      yield* Effect.sync(() => assertThrowaway(database));
      yield* asSuperuser([
        drop,
        `CREATE DATABASE ${MIGRATE_TEST_DATABASE} OWNER asys_owner`,
        `REVOKE ALL ON DATABASE ${MIGRATE_TEST_DATABASE} FROM PUBLIC`,
        `GRANT CONNECT ON DATABASE ${MIGRATE_TEST_DATABASE} TO asys_owner, asys_app`,
      ]);
      return ownerUrlFor(MIGRATE_TEST_DATABASE);
    }),
    () => asSuperuser([drop]).pipe(Effect.orDie),
  );

export interface MigrationRow {
  readonly hash: string;
  readonly created_at: string;
}

/** The rows of `drizzle.__drizzle_migrations`, oldest first, read through the owner URL of the throwaway database. */
export const migrationRows = (ownerUrl: string) =>
  withConnection(ownerUrl, 'Could not read the migrations table', (sql) =>
    sql
      .unsafe<MigrationRow>(
        'SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id',
      )
      .pipe(Effect.map((rows) => [...rows])),
  );

/** The names of the tables in schema `public` of the throwaway database. */
export const publicTables = (ownerUrl: string) =>
  withConnection(ownerUrl, 'Could not read the tables', (sql) =>
    sql
      .unsafe<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
      .pipe(Effect.map((rows) => rows.map((row) => row.tablename))),
  );
