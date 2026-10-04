// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';
import { seedTask } from './support/seed.ts';

test('A Done Task closed in another tab leaves a Review item in the Inbox', async ({
  page,
  context,
}) => {
  await seedTask(page, { title: 'Pay the invoice', important: true, estimateMinutes: 25 });
  await page.reload();

  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const page2 = await context.newPage();
  await page2.route('**/v1/changes**', async (route) => {
    await gate;
    await route.continue();
  });
  await page2.goto('/now');

  for (const tab of [page, page2]) {
    await expect(tab.locator('.asys-top-pick__title')).toHaveText('Pay the invoice');
  }

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.now__status')).toHaveText('“Pay the invoice” is Done.');

  const commandResponse = page2.waitForResponse(
    (response) => response.url().includes('/v1/commands') && response.request().method() === 'POST',
  );
  await page2.getByRole('button', { name: 'Done', exact: true }).click();
  const response = await commandResponse;
  expect(await response.text()).toContain('NotApplicable');
  release();

  await page2
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: /Inbox/ })
    .click();
  await expect(page2.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();

  const review = page2.locator('.asys-review');
  await expect(review).toHaveCount(1);
  await expect(review.locator('.asys-review__question')).toHaveText(
    'Marking a Task Done no longer applies.',
  );
  await expect(review.locator('.asys-review__reason')).toHaveText(
    'It was closed or changed elsewhere first.',
  );
  await expect(review.getByRole('link', { name: 'Open Task' })).toHaveCount(0);

  await review.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page2.locator('.asys-review')).toHaveCount(0);
  await expect(page2.getByRole('heading', { level: 1, name: 'Inbox' })).toBeFocused();
});
