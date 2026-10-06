// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';
import { captureTask } from './support/seed.ts';

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

test('Quick add keeps focus in the field when Add is clicked with the mouse', async ({ page }) => {
  const input = page.getByLabel('Capture a Task');

  await page.getByRole('button', { name: 'Capture' }).click();
  await input.fill('Water the plants');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
});

test('A failed capture stays as a row until Try again sends it', async ({ page }) => {
  const badge = page.getByRole('navigation', { name: 'Primary' }).locator('.asys-bottomnav__badge');
  const input = page.getByLabel('Capture a Task');
  const row = page.locator('.asys-quickadd__failure');

  await page.route('**/v1/commands', (route) => route.abort(), { times: 1 });
  await page.getByRole('button', { name: 'Capture' }).click();
  await input.fill('Water the plants');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(row).toHaveCount(1);
  await expect(row.locator('.asys-quickadd__failure-text')).toHaveText(
    'Not captured: “Water the plants”',
  );
  await expect(input).toHaveValue('');

  // The pill is rendered only while the bar is closed, and it counts what is not captured.
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture 1 not captured' })).toBeVisible();

  await page.getByRole('button', { name: 'Capture 1 not captured' }).click();
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Try again' }).click();

  await expect(badge).toHaveText('1');
  await expect(row).toHaveCount(0);

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Capture', exact: true })).toBeVisible();
});

test('The Inbox badge pops when a capture lands, not when the page loads', async ({ page }) => {
  // Records, one frame after each Inbox badge is inserted, how many animations it runs.
  await page.addInitScript(() => {
    const seen: number[] = [];
    (window as unknown as { badgeAnimations: number[] }).badgeAnimations = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) {
            continue;
          }
          const badges = node.matches('.asys-bottomnav__badge')
            ? [node]
            : Array.from(node.querySelectorAll('.asys-bottomnav__badge'));
          for (const badge of badges) {
            requestAnimationFrame(() => seen.push(badge.getAnimations().length));
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const recorded = () =>
    page.evaluate(() => (window as unknown as { badgeAnimations: number[] }).badgeAnimations);
  const badge = page.getByRole('navigation', { name: 'Primary' }).locator('.asys-bottomnav__badge');

  await captureTask(page, { title: 'Water the plants' });
  await page.reload();
  await expect(badge).toHaveText('1');
  await expect.poll(async () => (await recorded()).length).toBe(1);
  expect(await recorded()).toEqual([0]);

  await page.getByRole('button', { name: 'Capture' }).click();
  await page.getByLabel('Capture a Task').fill('Call the plumber');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(badge).toHaveText('2');
  await expect.poll(async () => (await recorded()).length).toBe(2);
  expect((await recorded())[1]).toBeGreaterThan(0);
});
