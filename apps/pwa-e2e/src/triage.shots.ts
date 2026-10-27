// SPDX-License-Identifier: EUPL-1.2

// Screenshots of the Inbox's Triage card and its sheets. Run: pnpm exec nx run pwa-e2e:shots -- src/triage.shots.ts
import type { Locator, Page } from '@playwright/test';
import {
  PHONE,
  blurActive,
  expect,
  pinClock,
  shoot,
  shootEnds,
  test,
} from './support/screenshots.ts';
import { captureTask, seedTask } from './support/seed.ts';
import { zonedDate } from './support/time.ts';

// A Tuesday at 10:00, so every run shows the same dates.
const AT = zonedDate('2026-10-27', '10:00');

const card = (page: Page): Locator => page.getByRole('region', { name: 'Task to triage' });

const sheet = (page: Page, name: string): Locator =>
  page.getByRole('dialog', { name, exact: true });

const closeSheet = async (page: Page, name: string): Promise<void> => {
  await page.keyboard.press('Escape');
  await expect(sheet(page, name)).toBeHidden();
  await blurActive(page);
};

const seed = async (page: Page): Promise<void> => {
  await pinClock(page, AT);
  await seedTask(page, {
    title: 'Find the boiler model number',
    important: false,
    estimateMinutes: 5,
  });
  await captureTask(page, {
    title: 'Call the dentist about the crown',
    captureText: 'dentist, crown feels loose again',
  });
  await captureTask(page, { title: 'Order new bike lights' });
  await captureTask(page, { title: 'Draft the agenda for the Q4 retro' });
  await page.goto('/inbox');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(
    'Call the dentist about the crown',
  );
  await blurActive(page);
};

test.describe('phone', () => {
  test.use(PHONE);

  test('the Triage card', async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    const triage = page.getByRole('button', { name: /^Triage/ });

    await shootEnds(page, '01-card', 'Card', { group: 'The card' });

    await triage.tap();
    await expect(card(page).locator('.asys-label__need--missing')).toHaveCount(2);
    await blurActive(page);
    await shoot(page, '04-card-early', 'Triage tapped too early', { group: 'The card' });

    await card(page).getByRole('button', { name: 'Important', exact: true }).tap();
    await card(page).getByRole('button', { name: '25 min', exact: true }).tap();
    await expect(triage).toHaveText(/Triage as Plan/);
    await blurActive(page);
    await shootEnds(page, '02-card-ready', 'Ready to triage', { group: 'The card' });

    await card(page).getByRole('button', { name: /^Due/ }).first().tap();
    await expect(sheet(page, 'Due')).toBeVisible();
    await shoot(page, '06-due-sheet', 'Due', { group: 'Sheets' });
    await closeSheet(page, 'Due');

    await card(page).getByRole('button', { name: 'More for this Task' }).tap();
    await expect(sheet(page, 'More')).toBeVisible();
    await shoot(page, '07-more-sheet', 'More', { group: 'Sheets' });
    await sheet(page, 'More').getByRole('button', { name: 'Blocked by' }).tap();
    await expect(sheet(page, 'Blocked by')).toBeVisible();
    await blurActive(page);
    await shoot(page, '08-blocked-by-sheet', 'Blocked by', { group: 'Sheets' });
    await closeSheet(page, 'Blocked by');

    await triage.tap();
    await expect(page.getByText('Triaged as Plan', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Order new bike lights');
    await blurActive(page);
    await shoot(page, '05-undo-triaged', 'After Triage, with Undo', { group: 'After a decision' });

    await page.getByRole('button', { name: 'Drop', exact: true }).tap();
    await expect(page.getByText('Dropped', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Drop', exact: true }).tap();
    await expect(page.getByText('Inbox is empty')).toBeVisible();
    await expect(page.getByText('3 of 3 triaged')).toBeVisible();
    await blurActive(page);
    await shoot(page, '09-empty-after', 'All handled, with Undo', { group: 'After a decision' });
  });

  test('the empty Inbox', async ({ page }) => {
    await pinClock(page, AT);
    await page.goto('/inbox');
    await expect(page.getByText('Inbox is empty')).toBeVisible();
    await shoot(page, '03-empty', 'Empty', { group: 'Empty' });
  });
});
