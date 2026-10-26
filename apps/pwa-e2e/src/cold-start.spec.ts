// SPDX-License-Identifier: EUPL-1.2

// A cold start asks for GET /v1/snapshot beside GET /v1/auth/me, and the data store adopts that request once signed in.
// A launch on a device that was signed in shows Now without waiting for the server, so it works offline.
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { captureTask } from './support/seed.ts';

const ME = '/v1/auth/me';

const SNAPSHOT = '/v1/snapshot';

const UNREACHABLE = 'ASYS cannot reach the server.';

const nowHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Now' });

/** Counts the requests the page sends to `path` from now on. */
const countRequests = (page: Page, path: string): { readonly count: () => number } => {
  let count = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === path) count += 1;
  });
  return { count: () => count };
};

const inboxBadge = (page: Page) =>
  page.getByRole('navigation', { name: 'Primary' }).locator('.asys-nav-item__icon > .asys-count');

test('A signed-in launch requests the snapshot while GET /v1/auth/me is unanswered, and uses it', async ({
  page,
}) => {
  await captureTask(page, { title: 'Cold start Task' });
  let releaseMe = (): void => undefined;
  const meHeld = new Promise<void>((resolve) => {
    releaseMe = resolve;
  });
  await page.route(`**${ME}`, async (route) => {
    await meHeld;
    await route.continue();
  });
  const snapshots = countRequests(page, SNAPSHOT);

  await page.reload();

  // Well inside the 10 s session check timeout, so the held answer never turns into Unreachable.
  await expect.poll(snapshots.count, { timeout: 5_000 }).toBe(1);

  releaseMe();
  await expect(nowHeading(page)).toBeVisible();
  await expect(inboxBadge(page)).toHaveText('1');
  expect(snapshots.count()).toBe(1);
});

test('A launch without the session cookie lands on sign-in, and a sign-in loads a fresh snapshot', async ({
  page,
}) => {
  await captureTask(page, { title: 'Signed out Task' });
  await page.context().clearCookies();
  const snapshots = countRequests(page, SNAPSHOT);

  let me = page.waitForResponse(`**${ME}`);
  await page.reload();

  expect((await me).status()).toBe(401);
  await expect(page).toHaveURL(/\/signin\?returnUrl=%2Fnow$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  expect(snapshots.count()).toBe(1);

  me = page.waitForResponse(`**${ME}`);
  await page.reload();

  expect((await me).status()).toBe(401);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  expect(snapshots.count()).toBe(1);

  await page.getByRole('button', { name: 'Sign in with passkey' }).click();
  await page.waitForURL('**/now');
  await expect(inboxBadge(page)).toHaveText('1');
  expect(snapshots.count()).toBe(2);
});

test('A signed-in launch shows Now while the server does not answer, then says it cannot reach it', async ({
  page,
}) => {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // A network that swallows requests, as a phone on Wi-Fi without internet does.
  await page.route('**/v1/**', async (route) => {
    await held;
    await route.abort('internetdisconnected');
  });
  await page.clock.install();

  await page.reload();

  // Well inside the 10 s session check timeout: the launch does not wait for GET /v1/auth/me.
  await expect(nowHeading(page)).toBeVisible({ timeout: 3_000 });
  await expect(page.getByText(UNREACHABLE)).toBeHidden();

  await page.clock.fastForward(10_000);

  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(nowHeading(page)).toBeVisible();
  release();
});

test('A signed-in launch without a network shows Now and says it cannot reach the server', async ({
  page,
}) => {
  await page.route('**/v1/**', (route) => route.abort('internetdisconnected'));

  await page.reload();

  await expect(nowHeading(page)).toBeVisible();
  await expect(page.getByText(UNREACHABLE)).toBeVisible();
  await expect(page).toHaveURL(/\/now$/);
});
