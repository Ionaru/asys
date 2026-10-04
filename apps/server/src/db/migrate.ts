// SPDX-License-Identifier: EUPL-1.2
import { Config, Data, Effect } from 'effect';
import type { EffectDrizzleQueryError, MigratorInitError } from 'drizzle-orm/effect-core/errors';
import { migrate } from 'drizzle-orm/effect-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { SqlError } from 'effect/sql/SqlError';
import { Db } from './database';

/**
 * The migrations folder is missing, unreadable, in drizzle-kit's legacy layout, or holds no
 * migration. Carries no path.
 */
export class MigrationsFolderInvalid extends Data.TaggedError('MigrationsFolderInvalid')<
  Record<never, never>
> {}

/**
 * Where the committed migrations live: `ASYS_MIGRATIONS_FOLDER`, default `apps/server/drizzle`,
 * relative to the working directory (the workspace root in development).
 */
export const migrationsFolderConfig: Config.Config<string> = Config.String(
  'ASYS_MIGRATIONS_FOLDER',
).pipe(Config.withDefault('apps/server/drizzle'));

/**
 * Fails with `MigrationsFolderInvalid` when the folder cannot be read, is in the legacy layout or
 * holds no migration. Needs no service and touches no database.
 */
export const checkMigrationsFolder = (
  folder: string,
): Effect.Effect<void, MigrationsFolderInvalid> =>
  Effect.try({
    try: () => readMigrationFiles({ migrationsFolder: folder }),
    catch: () => new MigrationsFolderInvalid(),
  }).pipe(
    Effect.flatMap((migrations) =>
      migrations.length === 0 ? Effect.fail(new MigrationsFolderInvalid()) : Effect.void,
    ),
  );

/**
 * Applies the committed migrations the way `drizzle-kit migrate` records them, after checking the
 * folder. Running it again on a migrated database applies nothing.
 */
export const runMigrations = (
  folder: string,
): Effect.Effect<
  void,
  MigrationsFolderInvalid | SqlError | EffectDrizzleQueryError | MigratorInitError,
  Db
> =>
  Effect.gen(function* () {
    yield* checkMigrationsFolder(folder);
    const db = yield* Db;
    yield* migrate(db, { migrationsFolder: folder });
  });
