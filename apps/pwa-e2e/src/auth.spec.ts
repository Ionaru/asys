// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';
import { captureTask } from './support/seed.ts';

test('Sign-up reaches Now and a reload stays signed in', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Now' })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/now$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Now' })).toBeVisible();
});

test('The session cookie travels with API requests', async ({ page }) => {
  const response = await page.context().request.get('/v1/snapshot');
  expect(response.status()).toBe(200);
});

test('A seeded Capture is Applied', async ({ page }) => {
  await captureTask(page, { title: 'Smoke Task' });
  await page.reload();
  const badge = page.getByRole('navigation', { name: 'Primary' }).locator('.asys-bottomnav__badge');
  await expect(badge).toHaveText('1');
});
