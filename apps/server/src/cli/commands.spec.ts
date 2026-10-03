// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { ConfigProvider, Effect, Exit } from 'effect';
import { CliError, Command } from 'effect/cli';
import { TestConsole } from 'effect/testing';
import { lookupSignUpLink } from '../auth/lookups';
import { hashToken } from '../auth/tokens';
import { appDatabase, Db } from '../db/database';
import { signUpLinks } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { removeOwner } from '../test/owners';
import { asys, ExpiresInDaysOutOfRange } from './commands';

// The signup-link tests run against the real database (docker compose), on the live clock.

const DAY_MS = 24 * 60 * 60 * 1000;

const LINK_PATTERN = /^http:\/\/localhost:4200\/signup#token=[A-Za-z0-9_-]{43}$/;

const EXPIRES_PATTERN = /^Expires \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const TOKEN_LENIENT = /token=([A-Za-z0-9_-]+)/;

const FULL_RECORD = {
  DATABASE_URL_APP: process.env['DATABASE_URL_APP'] ?? '',
  DATABASE_URL_OWNER: process.env['DATABASE_URL_OWNER'] ?? '',
  ASYS_PUBLIC_ORIGIN: 'http://localhost:4200',
  ASYS_RP_ID: 'localhost',
};

/** Runs the CLI on `argv` and returns its exit and the lines it printed. */
const runCli = (argv: ReadonlyArray<string>, record: Record<string, string>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(Command.runWith(asys, { version: '0.0.1' })(argv));
    const lines = yield* TestConsole.logLines;
    return { exit, lines };
  }).pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(record))),
    Effect.provide(NodeServices.layer),
    Effect.provide(TestConsole.layer),
  );

/** The token of a printed link line, found leniently, or an empty string. Never asserted on or printed. */
const tokenOf = (line: unknown) => TOKEN_LENIENT.exec(String(line))?.[1] ?? '';

/**
 * Registers the removal of the owner of the printed link line, if one is stored, when the scope
 * closes. Call it before any assertion on the output, so a failing assertion leaves no owner.
 */
const registerLinkOwnerRemoval = (line: unknown) =>
  Effect.gen(function* () {
    const token = tokenOf(line);
    if (token === '') {
      return;
    }
    const found = yield* lookupSignUpLink(hashToken(token)).pipe(Effect.provide(appDatabase()));
    if (found === undefined) {
      return;
    }
    yield* Effect.addFinalizer(() => removeOwner(found.ownerId).pipe(Effect.orDie));
  });

/** The stored link of a printed link line. Fails the test, without printing the token, if none exists. */
const storedLinkOf = (line: unknown) =>
  Effect.gen(function* () {
    const found = yield* lookupSignUpLink(hashToken(tokenOf(line))).pipe(
      Effect.provide(appDatabase()),
    );
    if (found === undefined) {
      return yield* Effect.die('No stored Sign-up link matches the printed one');
    }

    const rows = yield* withOwner(
      found.ownerId,
      Effect.gen(function* () {
        const db = yield* Db;
        return yield* db.select().from(signUpLinks);
      }),
    ).pipe(Effect.provide(appDatabase()));

    assert.strictEqual(rows.length, 1);
    return rows[0];
  });

/** The typed failure of an exit, if it has one. */
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

describe('asys signup-link', () => {
  it.live('prints the link and its expiry, 3 days out, and stores the link', () =>
    Effect.gen(function* () {
      const { exit, lines } = yield* runCli(['signup-link', '--expires-in-days', '3'], FULL_RECORD);
      yield* registerLinkOwnerRemoval(lines[0]);

      assert.isTrue(Exit.isSuccess(exit));
      assert.strictEqual(lines.length, 2);
      const [linkLine, expiresLine] = lines;
      assert.isTrue(LINK_PATTERN.test(String(linkLine)));
      assert.isTrue(EXPIRES_PATTERN.test(String(expiresLine)));

      const row = yield* storedLinkOf(linkLine);

      assert.strictEqual(row.expiresAt.getTime() - row.createdAt.getTime(), 3 * DAY_MS);
      assert.strictEqual(`Expires ${row.expiresAt.toISOString()}`, String(expiresLine));
      assert.strictEqual(row.usedAt, null);
    }),
  );

  it.live('defaults to 7 days', () =>
    Effect.gen(function* () {
      const { exit, lines } = yield* runCli(['signup-link'], FULL_RECORD);
      yield* registerLinkOwnerRemoval(lines[0]);

      assert.isTrue(Exit.isSuccess(exit));
      assert.strictEqual(lines.length, 2);
      assert.isTrue(LINK_PATTERN.test(String(lines[0])));

      const row = yield* storedLinkOf(lines[0]);

      assert.strictEqual(row.expiresAt.getTime() - row.createdAt.getTime(), 7 * DAY_MS);
    }),
  );

  for (const days of ['0', '31', '-1']) {
    it.live(
      `fails with ExpiresInDaysOutOfRange for ${days} days before any Config or database access and prints nothing`,
      () =>
        Effect.gen(function* () {
          const { exit, lines } = yield* runCli(['signup-link', '--expires-in-days', days], {});

          assert.isTrue(failureOf(exit) instanceof ExpiresInDaysOutOfRange);
          assert.deepStrictEqual(lines, []);
        }),
    );
  }
});

describe('asys openapi', () => {
  it.live('prints one JSON document with the 16 paths, without any Config', () =>
    Effect.gen(function* () {
      const { exit, lines } = yield* runCli(['openapi'], {});

      assert.isTrue(Exit.isSuccess(exit));
      assert.strictEqual(lines.length, 1);
      const document = JSON.parse(String(lines[0])) as { paths: Record<string, unknown> };

      assert.deepStrictEqual(
        Object.keys(document.paths).sort(),
        [
          '/v1/commands',
          '/v1/snapshot',
          '/v1/changes',
          '/v1/meta',
          '/v1/auth/register/options',
          '/v1/auth/register',
          '/v1/auth/authenticate/options',
          '/v1/auth/authenticate',
          '/v1/auth/passkeys/options',
          '/v1/auth/passkeys',
          '/v1/auth/passkeys/{credentialId}',
          '/v1/auth/recover',
          '/v1/auth/signout',
          '/v1/auth/me',
          '/v1/auth/recovery-codes',
          '/health',
        ].sort(),
      );
    }),
  );
});

describe('asys', () => {
  it.live('without a subcommand fails with ShowHelp and prints the subcommands', () =>
    Effect.gen(function* () {
      const { exit, lines } = yield* runCli([], {});
      const help = lines.map(String).join('\n');

      assert.isTrue(failureOf(exit) instanceof CliError.ShowHelp);
      assert.isTrue(help.includes('serve'));
      assert.isTrue(help.includes('signup-link'));
      assert.isTrue(help.includes('openapi'));
    }),
  );
});
