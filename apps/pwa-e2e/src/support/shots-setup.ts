// SPDX-License-Identifier: EUPL-1.2

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRootFrom } from './e2e-env.ts';

export const SHOTS_ROOT = join(workspaceRootFrom(__dirname), 'dist', 'screenshots');

/** Empties the screenshots folder once per run, before the parallel workers start. */
const globalSetup = async (): Promise<void> => {
  await rm(SHOTS_ROOT, { recursive: true, force: true });
};

export default globalSetup;
