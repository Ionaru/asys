// SPDX-License-Identifier: EUPL-1.2

// Needs the stack from deploy/compose.e2e.yaml running (see the README recipe). `base` is spread into a single
// defineConfig argument on purpose: the multi-argument form concatenates webServer and would keep the dev servers.
import { defineConfig } from '@playwright/test';
import base from './playwright.config.mts';
import { E2E_IMAGE_ORIGIN, Stack } from './src/support/e2e-env.ts';
import type { StackName } from './src/support/e2e-env.ts';

export default defineConfig<{ stack: StackName }>({
  ...base,
  testIgnore: [],
  webServer: [],
  use: {
    ...base.use,
    baseURL: E2E_IMAGE_ORIGIN,
    serviceWorkers: 'block',
    stack: Stack.Image,
  },
});
