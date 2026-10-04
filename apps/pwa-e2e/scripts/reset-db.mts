// SPDX-License-Identifier: EUPL-1.2

// Recreates the e2e database asys_e2e (never the dev one), migrates it, and copies the built server bundle
// to dist/pwa-e2e/server so a rebuild of dist/apps/server cannot change the API under a running test.
// Usage: `node apps/pwa-e2e/scripts/reset-db.mts` after `nx build server` (the Nx target reset-db does both).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import {
  assertE2eDatabase,
  childEnv,
  loadE2eEnv,
  workspaceRootFrom,
} from '../src/support/e2e-env.ts';

const listening = (host: string, port: number): Promise<boolean> =>
  new Promise<boolean>((done) => {
    const socket = connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });

const main = async (): Promise<void> => {
  const root = workspaceRootFrom(import.meta.dirname);
  const { env, postgresUrl } = loadE2eEnv(root);
  assertE2eDatabase(env);

  for (const port of [3100, 4300]) {
    for (const host of ['127.0.0.1', '::1']) {
      if (await listening(host, port)) {
        throw new Error(
          `port ${port} is in use: an e2e run or server is already live; stop it first`,
        );
      }
    }
  }

  const client = new pg.Client({ connectionString: postgresUrl });
  await client.connect();
  try {
    await client.query('DROP DATABASE IF EXISTS asys_e2e WITH (FORCE)');
    await client.query('CREATE DATABASE asys_e2e OWNER asys_owner');
    await client.query('REVOKE ALL ON DATABASE asys_e2e FROM PUBLIC');
    await client.query('GRANT CONNECT ON DATABASE asys_e2e TO asys_owner, asys_app');
  } finally {
    await client.end();
  }

  const migrate = spawnSync(
    'pnpm',
    ['exec', 'drizzle-kit', 'migrate', '--config', 'apps/server/drizzle.config.ts'],
    { cwd: root, env: childEnv(env), stdio: 'inherit' },
  );
  if (migrate.status !== 0) throw new Error('drizzle-kit migrate failed');

  const source = resolve(root, 'dist/apps/server');
  if (!existsSync(resolve(source, 'main.js'))) {
    throw new Error('dist/apps/server/main.js is missing (run `nx build server`)');
  }
  const target = resolve(root, 'dist/pwa-e2e/server');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
};

main().catch((error: unknown) => {
  console.error(`reset-db failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});
