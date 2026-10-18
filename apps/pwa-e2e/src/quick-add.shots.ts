// SPDX-License-Identifier: EUPL-1.2

// Screenshots of the quick-add bar over Now. Run: pnpm exec nx run pwa-e2e:shots -- src/quick-add.shots.ts
import type { Locator, Page } from '@playwright/test';
import { DESKTOP, PHONE, expect, pinClock, shoot, test } from './support/screenshots.ts';
import { areaId, seedTask } from './support/seed.ts';
import { zonedDate } from './support/time.ts';

const LONG_TITLE = 'Ring Van Dijk about the boiler service and ask for a morning slot next week';

const field = (page: Page): Locator => page.getByLabel('Capture a Task');

// A fixed Monday at 10:00, so a before and an after run show the same screen.
const seed = async (page: Page): Promise<void> => {
  await pinClock(page, zonedDate('2026-10-19', '10:00'));
  const work = await areaId(page, 'Work');
  await seedTask(page, {
    title: 'Send the quarterly report',
    important: true,
    estimateMinutes: 120,
    areaId: work,
  });
  await seedTask(page, {
    title: 'Reply to the venue about the dates',
    important: false,
    estimateMinutes: 15,
    areaId: work,
  });
  await page.goto('/now');
  await expect(page.getByText('Send the quarterly report')).toBeVisible();
};

test.describe('phone', () => {
  test.use(PHONE);

  test('the quick-add bar', async ({ page }) => {
    await seed(page);

    await page.getByRole('button', { name: 'Capture' }).tap();
    await expect(field(page)).toBeFocused();
    await shoot(page, '01-empty', 'Empty', { group: 'Phone' });

    await field(page).fill('Call the plumber');
    await shoot(page, '02-short', 'Short title', { group: 'Phone' });

    await field(page).fill(LONG_TITLE);
    await shoot(page, '03-long', 'Long title', { group: 'Phone' });
  });
});

test.describe('desktop', () => {
  test.use(DESKTOP);

  test('the quick-add bar on a wide screen', async ({ page }) => {
    await seed(page);

    await page.getByRole('button', { name: 'Capture' }).click();
    await field(page).fill('Call the plumber');
    await page.mouse.move(0, 0);
    await shoot(page, '04-desktop', 'At 1280 px', { group: 'Desktop' });
  });
});
