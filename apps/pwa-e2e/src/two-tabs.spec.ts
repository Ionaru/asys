// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';
import { seedTask } from './support/seed.ts';

test('A Done Task closed in another tab leaves a Review item in the Inbox', async ({
  page,
  context,
}) => {
  await seedTask(page, { title: 'Pay the invoice', important: true, estimateMinutes: 25 });
  // page2 shares page's browser context, and so its clock. The clock is installed before the first reload.
  await page.clock.install();
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
  await expect(page.locator('.shell__status')).toHaveText(
    '“Pay the invoice” is Done. Undo is available for 5 seconds.',
  );
  // The Done is held for 5 s. Sending it is the window ending.
  const firstSent = page.waitForResponse('**/v1/commands');
  await page.clock.fastForward(5_000);
  expect((await firstSent).status()).toBe(200);

  // The answer is read in the route, not with response.text(): under CPU load Chromium can hold no
  // body for the XHR by the time DevTools asks ("No data found for resource with given identifier").
  let answer: (text: string) => void = () => undefined;
  const commandAnswer = new Promise<string>((resolve) => {
    answer = resolve;
  });
  await page2.route('**/v1/commands', async (route) => {
    const response = await route.fetch();
    answer(await response.text());
    await route.fulfill({ response });
  });
  await page2.getByRole('button', { name: 'Done', exact: true }).click();
  await page2.clock.fastForward(5_000);
  expect(await commandAnswer).toContain('NotApplicable');
  // The bar shows the notice once the send has settled, and settling waits for the gated sync.
  release();
  await expect(page2.locator('.asys-undo')).toContainText(
    'That no longer applied, so it waits in the Inbox as a Review item.',
  );

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
