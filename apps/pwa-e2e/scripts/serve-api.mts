// SPDX-License-Identifier: EUPL-1.2

// Runs the copied server bundle (dist/pwa-e2e/server) on :3100 against asys_e2e, for Playwright's webServer.
// Usage: `node apps/pwa-e2e/scripts/serve-api.mts` after `node apps/pwa-e2e/scripts/reset-db.mts`.
import { spawn } from 'node:child_process';
import {
  assertE2eDatabase,
  childEnv,
  loadE2eEnv,
  workspaceRootFrom,
} from '../src/support/e2e-env.ts';

const root = workspaceRootFrom(import.meta.dirname);

const { env } = loadE2eEnv(root);

assertE2eDatabase(env);

const child = spawn('node', ['dist/pwa-e2e/server/main.js', 'serve'], {
  cwd: root,
  env: childEnv(env),
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on('error', (error) => {
  console.error(`serve-api failed: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
