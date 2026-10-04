// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import { ConfigProvider, Effect, Exit, Layer } from 'effect';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  COMMITTED_MIGRATION_COUNT,
  migrateDatabase,
  migrationRows,
  publicTables,
} from '../test/migrate-database';
import { Db, ownerDatabase } from './database';
import {
  checkMigrationsFolder,
  MigrationsFolderInvalid,
  migrationsFolderConfig,
  runMigrations,
} from './migrate';

const COMMITTED_FOLDER = resolve(import.meta.dirname, '../../drizzle');

const DB_TIMEOUT = 60_000;

/** A temp directory, removed when the scope closes. */
const tempFolder = Effect.acquireRelease(
  Effect.sync(() => mkdtempSync(join(tmpdir(), 'asys-migrate-'))),
  (folder) => Effect.sync(() => rmSync(folder, { recursive: true, force: true })),
);

const validMigration = (folder: string, name: string) => {
  mkdirSync(join(folder, name), { recursive: true });
  writeFileSync(join(folder, name, 'migration.sql'), 'SELECT 1;\n');
};

const legacyJournal = (folder: string) => {
  mkdirSync(join(folder, 'meta'), { recursive: true });
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    '{"version":"7","dialect":"postgresql","entries":[]}',
  );
};

const emptyFolder = tempFolder;

const legacyFolder = Effect.map(tempFolder, (folder) => {
  validMigration(folder, '20260101000000_first');
  legacyJournal(folder);
  return folder;
});

const missingFolder = Effect.map(tempFolder, (folder) => join(folder, 'does-not-exist'));

/** A `Db` whose every property access throws: any query or access fails the test. */
const throwingDb = Layer.succeed(Db)(
  new Proxy(
    {},
    {
      get: () => {
        throw new Error('The database was accessed');
      },
    },
  ) as never,
);

const failureOf = <A, E>(exit: Exit.Exit<A, E>) => {
  if (!Exit.isFailure(exit)) {
    return undefined;
  }
  for (const reason of exit.cause.reasons) {
    if (reason._tag === 'Fail') {
      return reason.error;
    }
  }
  return undefined;
};

const ownerDatabaseAt = (url: string) =>
  ownerDatabase().pipe(
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord({ DATABASE_URL_OWNER: url }))),
  );

describe('checkMigrationsFolder', () => {
  it.effect('succeeds for the committed apps/server/drizzle folder', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(checkMigrationsFolder(COMMITTED_FOLDER));

      assert.isTrue(Exit.isSuccess(exit));
    }),
  );

  it.effect('succeeds for a folder with one migration', () =>
    Effect.gen(function* () {
      const folder = yield* tempFolder;
      validMigration(folder, '20260101000000_first');

      const exit = yield* Effect.exit(checkMigrationsFolder(folder));

      assert.isTrue(Exit.isSuccess(exit));
    }),
  );

  it.effect('fails with MigrationsFolderInvalid for a missing folder', () =>
    Effect.gen(function* () {
      const folder = yield* missingFolder;

      const exit = yield* Effect.exit(checkMigrationsFolder(folder));

      assert.isTrue(failureOf(exit) instanceof MigrationsFolderInvalid);
    }),
  );

  it.effect('fails with MigrationsFolderInvalid for a folder holding meta/_journal.json', () =>
    Effect.gen(function* () {
      const folder = yield* legacyFolder;

      const exit = yield* Effect.exit(checkMigrationsFolder(folder));

      assert.isTrue(failureOf(exit) instanceof MigrationsFolderInvalid);
    }),
  );

  it.effect('fails with MigrationsFolderInvalid for an empty folder', () =>
    Effect.gen(function* () {
      const folder = yield* emptyFolder;

      const exit = yield* Effect.exit(checkMigrationsFolder(folder));

      assert.isTrue(failureOf(exit) instanceof MigrationsFolderInvalid);
    }),
  );

  it.effect(
    'fails with MigrationsFolderInvalid when the only subdirectory has no migration.sql',
    () =>
      Effect.gen(function* () {
        const folder = yield* tempFolder;
        mkdirSync(join(folder, '20260101000000_hollow'));

        const exit = yield* Effect.exit(checkMigrationsFolder(folder));

        assert.isTrue(failureOf(exit) instanceof MigrationsFolderInvalid);
      }),
  );
});

describe('runMigrations with an invalid folder', () => {
  const cases = [
    ['missing', missingFolder],
    ['legacy', legacyFolder],
    ['empty', emptyFolder],
  ] as const;

  for (const [name, makeFolder] of cases) {
    it.effect(
      `fails with MigrationsFolderInvalid for a ${name} folder before touching the database`,
      () =>
        Effect.gen(function* () {
          const folder = yield* makeFolder;

          const exit = yield* Effect.exit(runMigrations(folder).pipe(Effect.provide(throwingDb)));

          assert.isTrue(failureOf(exit) instanceof MigrationsFolderInvalid);
        }),
    );
  }
});

describe('runMigrations on a fresh database', () => {
  it.effect(
    'records every migration once and a second run changes nothing',
    () =>
      Effect.gen(function* () {
        const ownerUrl = yield* migrateDatabase();
        const migrate = runMigrations(COMMITTED_FOLDER).pipe(
          Effect.provide(ownerDatabaseAt(ownerUrl)),
        );

        yield* migrate;
        const first = yield* migrationRows(ownerUrl);
        const tables = yield* publicTables(ownerUrl);

        yield* migrate;
        const second = yield* migrationRows(ownerUrl);

        assert.strictEqual(first.length, COMMITTED_MIGRATION_COUNT);
        for (const table of ['users', 'tasks', 'jobs', 'sessions', 'passkeys']) {
          assert.isTrue(tables.includes(table), `public.${table} exists`);
        }
        assert.deepStrictEqual(second, first);
      }).pipe(Effect.scoped),
    DB_TIMEOUT,
  );
});

describe('migrationsFolderConfig', () => {
  const read = (record: Record<string, string>) =>
    migrationsFolderConfig.pipe(
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(record))),
    );

  it.effect('defaults to apps/server/drizzle', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* read({}), 'apps/server/drizzle');
    }),
  );

  it.effect('reads ASYS_MIGRATIONS_FOLDER', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* read({ ASYS_MIGRATIONS_FOLDER: '/app/drizzle' }), '/app/drizzle');
    }),
  );
});
