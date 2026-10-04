// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';

test('Capture adds Tasks to the Inbox from Now and from the share route', async ({ page }) => {
  const badge = page.getByRole('navigation', { name: 'Primary' }).locator('.asys-bottomnav__badge');
  const input = page.getByLabel('Capture a Task');
  const titles = ['Water the plants', 'Call the plumber', 'Renew the passport'];

  await page.getByRole('button', { name: 'Capture' }).click();
  for (const [index, title] of titles.entries()) {
    await input.fill(title);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(badge).toHaveText(String(index + 1));
    await expect(input).toHaveValue('');
    if (index === 0) {
      await expect(page.locator('.asys-quickadd__status')).toHaveText(
        'Captured. It waits in the Inbox.',
      );
    }
  }

  await page.goto('/capture?title=a&text=https%3A%2F%2Fx.y&url=');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.capture__status')).toContainText(
    'Captured “a”. It waits in the Inbox until Triage.',
  );
  await expect(page).toHaveURL(/\/capture$/);

  await page.reload();
  await expect(badge).toHaveText('4');

  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: /^Inbox/ })
    .click();
  const card = page.locator('article.asys-triage');
  await expect(card.locator('.asys-triage__progress')).toHaveText('1 of 4');

  const seen: { title: string; raw: string | null }[] = [];
  for (let step = 0; step < 4; step++) {
    const title = (await card.locator('.asys-triage__title').innerText()).trim();
    const rawLocator = card.locator('.asys-triage__raw');
    const raw = (await rawLocator.count()) > 0 ? await rawLocator.innerText() : null;
    seen.push({ title, raw });
    if (step < 3) {
      await card.getByRole('button', { name: 'Later' }).click();
      await expect(card.locator('.asys-triage__title')).not.toHaveText(title);
    }
  }

  expect(new Set(seen.map((entry) => entry.title)).size).toBe(4);
  const matching = seen.filter((entry) => entry.title === 'a');
  expect(matching).toHaveLength(1);
  expect(matching[0].raw).toContain('https://x.y');
});
