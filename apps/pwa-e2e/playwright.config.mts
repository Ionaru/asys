// SPDX-License-Identifier: EUPL-1.2

// Static values only: the Nx plugin loads this file for the project graph, so it must work with no .env, no database and no build.
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';
import { workspaceRootFrom } from './src/support/e2e-env.ts';
import { E2E_ZONE } from './src/support/time.ts';

const workspaceRoot = workspaceRootFrom(import.meta.dirname);

export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src', openHtmlReport: 'never' }),
  fullyParallel: true,
  workers: process.env['CI'] ? 2 : 4,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4300',
    colorScheme: 'light',
    timezoneId: E2E_ZONE,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node apps/pwa-e2e/scripts/serve-api.mts',
      url: 'http://localhost:3100/health',
      cwd: workspaceRoot,
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: 'pnpm exec nx run pwa:serve:e2e --exclude-task-dependencies',
      url: 'http://localhost:4300',
      cwd: workspaceRoot,
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
  ],
});
