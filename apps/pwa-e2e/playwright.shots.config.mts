// SPDX-License-Identifier: EUPL-1.2

// On-demand screenshots, never part of CI. Run only through `pnpm exec nx run pwa-e2e:shots -- src/<topic>.shots.ts`.
// The default testMatch of playwright.config.mts never matches `*.shots.ts`, so `nx e2e pwa-e2e` and CI never run shots,
// and the Nx plugin infers targets only from `playwright.config.*`. `base` is spread into a single defineConfig argument
// so its webServer is kept; a relative globalSetup resolves against this file's folder. No retries: a retry would find
// its sidecars already written.
import { defineConfig } from '@playwright/test';
import base from './playwright.config.mts';

export default defineConfig({
  ...base,
  testMatch: ['**/*.shots.ts'],
  retries: 0,
  globalSetup: './src/support/shots-setup.ts',
  use: { ...base.use, reducedMotion: 'reduce' },
});
