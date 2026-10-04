// SPDX-License-Identifier: EUPL-1.2

// Every test gets a page signed in as a brand-new Owner (a fresh Sign-up link, a virtual passkey) and sitting on /now.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { StackName } from './e2e-env.ts';
import {
  E2E_IMAGE_COMPOSE_FILES,
  E2E_IMAGE_PROJECT,
  Stack,
  childEnv,
  loadE2eEnv,
  workspaceRootFrom,
} from './e2e-env.ts';

export { expect } from '@playwright/test';

export interface Owner {
  readonly name: string;
}

const run = promisify(execFile);

const OWNER_NAME = 'E2E Owner';

/** Prints a Sign-up link: from the e2e server bundle against asys_e2e, or from the running image. */
const signupLink = async (stack: StackName, baseURL: string): Promise<string> => {
  const root = workspaceRootFrom(__dirname);
  let stdout: string;
  if (stack === Stack.Image) {
    const pending = run(
      'docker',
      [
        'compose',
        '-p',
        E2E_IMAGE_PROJECT,
        ...E2E_IMAGE_COMPOSE_FILES.flatMap((file) => ['-f', file]),
        'exec',
        '-T',
        'asys',
        'node',
        '/app/main.js',
        'signup-link',
      ],
      { cwd: root },
    );
    // compose exec attaches the stdin pipe execFile opens, so close it at once.
    pending.child.stdin?.end();
    ({ stdout } = await pending);
  } else {
    const { env } = loadE2eEnv(root);
    ({ stdout } = await run('node', ['dist/pwa-e2e/server/main.js', 'signup-link'], {
      cwd: root,
      env: childEnv(env),
    }));
  }
  const link = stdout
    .split('\n')
    .find((line) => /\/signup#token=/.test(line))
    ?.trim();
  if (!link?.startsWith(`${baseURL}/`))
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

export const test = base.extend<{ owner: Owner; stack: StackName }>({
  owner: { name: OWNER_NAME },
  stack: [Stack.Dev, { option: true }],
  page: [
    async ({ page, owner, stack, baseURL }, use) => {
      if (baseURL === undefined) throw new Error('the e2e config sets no baseURL');
      const link = await signupLink(stack, baseURL);
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
