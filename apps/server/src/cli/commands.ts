// SPDX-License-Identifier: EUPL-1.2
import { Api } from '@asys/contract';
import { PasskeyChallenges } from '@ionaru/effect-passkeys/server';
import { Console, Data, Effect, Layer } from 'effect';
import { Command, Flag } from 'effect/cli';
import { OpenApi } from 'effect/http-api';
import { createSignUpLink, MAX_LINK_DAYS } from '../auth/sign-up-links';
import { PasskeyStoreLive } from '../auth/passkey-store';
import { PasskeyUnitOfWorkLive } from '../auth/unit-of-work';
import { ServerConfig, passkeyConfigLayer } from '../config';
import { appDatabase, ownerDatabase } from '../db/database';
import { checkMigrationsFolder, migrationsFolderConfig, runMigrations } from '../db/migrate';
import { HealthReader } from '../http/health';
import { telemetryLayer } from '../telemetry/layer';
import { serverLayer } from '../server';
import { workerLayer } from '../worker-layer';

/** `--expires-in-days` is not a whole number from 1 to `MAX_LINK_DAYS`. */
export class ExpiresInDaysOutOfRange extends Data.TaggedError('ExpiresInDaysOutOfRange')<
  Record<never, never>
> {}

/**
 * `signup-link`: prints a Sign-up link for a new Owner on one line and its expiry on the next.
 * An out-of-range `--expires-in-days` fails before any Config is read or the database is touched.
 */
export const signupLinkCommand = Command.make(
  'signup-link',
  {
    expiresInDays: Flag.Int('expires-in-days').pipe(
      Flag.withDefault(7),
      Flag.withDescription(`Days until the link expires, from 1 to ${MAX_LINK_DAYS}`),
    ),
  },
  Effect.fnUntraced(function* ({ expiresInDays }) {
    if (expiresInDays < 1 || expiresInDays > MAX_LINK_DAYS) {
      return yield* new ExpiresInDaysOutOfRange();
    }
    yield* Effect.gen(function* () {
      const { token, expiresAt } = yield* createSignUpLink({ expiresInDays });
      const { publicOrigin } = yield* ServerConfig;
      yield* Console.log(`${publicOrigin}/signup#token=${token}`);
      yield* Console.log(`Expires ${new Date(expiresAt).toISOString()}`);
    }).pipe(Effect.provide(Layer.mergeAll(appDatabase(), ServerConfig.layer)));
  }),
).pipe(Command.withDescription('Print a Sign-up link for a new Owner'));

/** `openapi`: prints the OpenAPI document of the contract's `Api`. Reads no Config. */
export const openapiCommand = Command.make('openapi', {}, () =>
  Console.log(JSON.stringify(OpenApi.fromApi(Api), null, 2)),
).pipe(Command.withDescription('Print the OpenAPI document'));

/**
 * `serve`: runs the HTTP server and the job worker until interrupted, on one shared pool. When
 * `OTEL_EXPORTER_OTLP_ENDPOINT` is set it exports traces and logs through the scrubber.
 */
export const serveCommand = Command.make('serve', {}, () => {
  const database = appDatabase();
  const services = Layer.mergeAll(
    ServerConfig.layer,
    passkeyConfigLayer.pipe(Layer.provide(ServerConfig.layer)),
    PasskeyChallenges.memory(),
    PasskeyStoreLive,
    PasskeyUnitOfWorkLive,
    HealthReader.layer,
  ).pipe(Layer.provideMerge(database));
  return Layer.launch(
    Layer.mergeAll(serverLayer, workerLayer).pipe(Layer.provide(telemetryLayer)),
  ).pipe(Effect.provide(services));
}).pipe(Command.withDescription('Run the HTTP server and the job worker'));

/**
 * `migrate`: applies the committed database migrations as `asys_owner`. An invalid migrations
 * folder fails before any database connection is made.
 */
export const migrateCommand = Command.make(
  'migrate',
  {},
  Effect.fnUntraced(function* () {
    const folder = yield* migrationsFolderConfig;
    yield* checkMigrationsFolder(folder);
    yield* runMigrations(folder).pipe(Effect.provide(ownerDatabase()));
    yield* Effect.logInfo('Migrations are up to date');
  }),
).pipe(Command.withDescription('Apply the database migrations'));

/** The root: no handler, the four subcommands. */
export const asys = Command.make('asys').pipe(
  Command.withDescription('ASYS server'),
  Command.withSubcommands([serveCommand, signupLinkCommand, openapiCommand, migrateCommand]),
);

/** Runs the CLI on the process arguments. */
export const run = Command.run(asys, { version: '0.0.1' });
