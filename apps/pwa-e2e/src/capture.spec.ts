// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';
import { captureTask } from './support/seed.ts';

test('Capture adds Tasks to the Inbox from Now and from the share route', async ({ page }) => {
  const badge = page
    .getByRole('navigation', { name: 'Primary' })
    .locator('.asys-nav-item__icon > .asys-count');
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
  const card = page.getByRole('region', { name: 'Task to triage' });
  const title = card.getByRole('textbox', { name: 'Title' });
  await expect(card.locator('.asys-triage__progress')).toHaveText('1 of 4');

  // Drop moves to the next card at once, so each card is read before it goes.
  const seen: { title: string; captured: string | null }[] = [];
  for (let step = 0; step < 4; step++) {
    const current = await title.inputValue();
    const capturedLocator = card.locator('.asys-triage__captured-text');
    const captured = (await capturedLocator.count()) > 0 ? await capturedLocator.innerText() : null;
    seen.push({ title: current, captured });
    if (step < 3) {
      await page
        .locator('footer.inbox__actions')
        .getByRole('button', { name: 'Drop', exact: true })
        .click();
      await expect(title).not.toHaveValue(current);
      await expect(card.locator('.asys-triage__progress')).toHaveText(`${step + 2} of 4`);
    }
  }

  expect(new Set(seen.map((entry) => entry.title)).size).toBe(4);
  const matching = seen.filter((entry) => entry.title === 'a');
  expect(matching).toHaveLength(1);
  expect(matching[0].captured).toContain('https://x.y');
  expect(
    seen.filter((entry) => entry.title !== 'a').every((entry) => entry.captured === null),
  ).toBe(true);
});

test('Quick add keeps focus in the field when Add is clicked with the mouse', async ({ page }) => {
  const input = page.getByLabel('Capture a Task');

  await page.getByRole('button', { name: 'Capture' }).click();
  await input.fill('Water the plants');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();
});

// The field is a textarea, which keeps Chrome's autofill bar off the Android keyboard, so it keeps to one line itself.
test('Enter in quick add captures the Task, and the field keeps to one line', async ({ page }) => {
  const badge = page
    .getByRole('navigation', { name: 'Primary' })
    .locator('.asys-nav-item__icon > .asys-count');
  const input = page.getByLabel('Capture a Task');

  await page.getByRole('button', { name: 'Capture' }).click();
  const empty = await input.boundingBox();
  await input.fill('Ring Van Dijk about the boiler service and ask for a morning slot next week');
  expect((await input.boundingBox())?.height).toBe(empty?.height);

  await input.press('Enter');
  await expect(badge).toHaveText('1');
  await expect(input).toHaveValue('');
  await expect(input).toBeFocused();

  await input.fill('Water\nthe plants');
  await expect(input).toHaveValue('Water the plants');
});

test('A failed capture stays as a row until Try again sends it', async ({ page }) => {
  const badge = page
    .getByRole('navigation', { name: 'Primary' })
    .locator('.asys-nav-item__icon > .asys-count');
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
  // Records, one frame after each Inbox badge is inserted, how many animations it runs. A badge is recorded once,
  // also when it arrives inside a nav that is inserted with it.
  await page.addInitScript(() => {
    const seen: number[] = [];
    const recordedBadges = new WeakSet<Element>();
    (window as unknown as { badgeAnimations: number[] }).badgeAnimations = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (!(node instanceof Element)) {
            continue;
          }
          const badges = node.matches('.asys-nav-item__icon > .asys-count')
            ? [node]
            : Array.from(node.querySelectorAll('.asys-nav-item__icon > .asys-count'));
          for (const badge of badges) {
            if (recordedBadges.has(badge)) {
              continue;
            }
            recordedBadges.add(badge);
            requestAnimationFrame(() => seen.push(badge.getAnimations().length));
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const recorded = () =>
    page.evaluate(() => (window as unknown as { badgeAnimations: number[] }).badgeAnimations);
  const badge = page
    .getByRole('navigation', { name: 'Primary' })
    .locator('.asys-nav-item__icon > .asys-count');

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
