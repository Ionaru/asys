// SPDX-License-Identifier: EUPL-1.2

// Every test gets a page signed in as a brand-new Owner (a fresh Sign-up link, a virtual passkey) and sitting on /now.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import { E2E_ORIGIN, childEnv, loadE2eEnv, workspaceRootFrom } from './e2e-env.ts';

export { expect } from '@playwright/test';

export interface Owner {
  readonly name: string;
}

const run = promisify(execFile);

const OWNER_NAME = 'E2E Owner';

/** Prints a Sign-up link from the e2e server bundle against asys_e2e. */
const signupLink = async (): Promise<string> => {
  const root = workspaceRootFrom(__dirname);
  const { env } = loadE2eEnv(root);
  const { stdout } = await run('node', ['dist/pwa-e2e/server/main.js', 'signup-link'], {
    cwd: root,
    env: childEnv(env),
  });
  const link = stdout
    .split('\n')
    .find((line) => /\/signup#token=/.test(line))
    ?.trim();
  if (!link?.startsWith(`${E2E_ORIGIN}/`))
    throw new Error('signup-link printed no Sign-up link for the e2e origin');
  return link;
};

/** Gives the page's context a virtual passkey that always approves; call it again for a second page. */
export const addAuthenticator = async (page: Page): Promise<void> => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable', { enableUI: false });
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
};

export const test = base.extend<{ owner: Owner }>({
  owner: { name: OWNER_NAME },
  page: [
    async ({ page, owner }, use) => {
      const link = await signupLink();
      await addAuthenticator(page);
      await page.goto(link);
      await page.getByLabel('Name').fill(owner.name);
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Create passkey' }).click();
      await page.locator('ol.sign-up__codes').waitFor();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.waitForURL('**/now');
      await use(page);
    },
    { scope: 'test', timeout: 45_000 },
  ],
});
