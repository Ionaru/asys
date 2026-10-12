// SPDX-License-Identifier: EUPL-1.2

import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { areaId, seedTask } from './support/seed.ts';
import { addDays, nextDate, skipNearMidnight, zonedDate } from './support/time.ts';

const PERSONAL_TASK = 'Personal Current Area Task';

const WORK_TASK = 'Work Current Area Task';

const seedBoth = async (page: Page): Promise<void> => {
  const personal = await areaId(page, 'Personal');
  const work = await areaId(page, 'Work');
  await seedTask(page, {
    title: PERSONAL_TASK,
    areaId: personal,
    important: false,
    estimateMinutes: 25,
  });
  await seedTask(page, { title: WORK_TASK, areaId: work, important: false, estimateMinutes: 25 });
};

/** Pins the PWA's clock and loads the seeded Now. The server's clock stays real. */
const openAt = async (page: Page, time: Date): Promise<void> => {
  await page.clock.install({ time });
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Current Area' })).toBeVisible();
};

const shown = (page: Page, title: string) =>
  page.locator('.asys-top-pick__title, a.asys-picker-row').filter({ hasText: title });

const otherAreas = (page: Page) => page.getByRole('group', { name: 'Other Areas' });

const select = (page: Page) => page.getByRole('combobox', { name: 'Current Area' });

const state = (page: Page) => page.locator('.asys-area-pick__state');

const palette = (page: Page) => page.locator('html');

const paper = (page: Page): Promise<string> =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
  );

/** The content of the theme-color meta whose media matches the page's colour scheme. */
const themeColour = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const match = metas.find((meta) => meta.media !== '' && window.matchMedia(meta.media).matches);
    return (match ?? metas.find((meta) => meta.media === '') ?? null)?.content ?? null;
  });

test('A Saturday pick of Work shows its Tasks until midnight, survives a reload and ends by itself', async ({
  page,
}) => {
  skipNearMidnight(test);
  await seedBoth(page);
  const saturday = nextDate((weekday) => weekday === 6);
  await openAt(page, zonedDate(saturday, '14:00'));

  await expect(shown(page, PERSONAL_TASK)).toBeVisible();
  await expect(shown(page, WORK_TASK)).toHaveCount(0);
  await expect(otherAreas(page).getByRole('button', { name: 'Work 1' })).toBeVisible();
  await expect(state(page)).toHaveText('Automatic');

  // Personal is current and seeded with Harbour: the look follows it.
  await expect(palette(page)).toHaveAttribute('data-palette', 'harbour');
  const harbourPaper = await paper(page);
  expect(harbourPaper).not.toBe('');
  await expect.poll(() => themeColour(page)).toBe(harbourPaper);

  await select(page).selectOption({ label: 'Work' });
  await expect(shown(page, WORK_TASK)).toBeVisible();
  await expect(palette(page)).not.toHaveAttribute('data-palette');
  await expect.poll(() => paper(page)).not.toBe(harbourPaper);
  await expect.poll(() => themeColour(page)).toBe(await paper(page));
  await expect(shown(page, PERSONAL_TASK)).toHaveCount(0);
  await expect(page.locator('.now__status')).toHaveText('Work picked until midnight');
  await expect(state(page)).toHaveText('Picked');

  await page.reload();
  await expect(shown(page, WORK_TASK)).toBeVisible();
  await expect(shown(page, PERSONAL_TASK)).toHaveCount(0);

  // The reload installed no new clock, so the fake one still runs from where the pick was made.
  const now = await page.evaluate(() => Date.now());
  await page.clock.fastForward(zonedDate(addDays(saturday, 1), '00:01').getTime() - now);
  await expect(shown(page, PERSONAL_TASK)).toBeVisible();
  await expect(shown(page, WORK_TASK)).toHaveCount(0);
  await expect(state(page)).toHaveText('Automatic');
});

test('A weekday tap on an Other Areas button picks Personal until 18:00, where its own hours begin', async ({
  page,
}) => {
  skipNearMidnight(test);
  await seedBoth(page);
  const weekday = nextDate((isoWeekday) => isoWeekday <= 5);
  await openAt(page, zonedDate(weekday, '10:00'));

  await expect(shown(page, WORK_TASK)).toBeVisible();
  await expect(shown(page, PERSONAL_TASK)).toHaveCount(0);
  await expect(otherAreas(page).getByRole('button', { name: 'Personal 1' })).toBeVisible();

  // Work has no palette: the default look.
  await expect(palette(page)).not.toHaveAttribute('data-palette');
  const weekdayPaper = await paper(page);
  expect(weekdayPaper).not.toBe('');

  await otherAreas(page).getByRole('button', { name: 'Personal 1' }).click();
  await expect(shown(page, PERSONAL_TASK)).toBeVisible();
  await expect(palette(page)).toHaveAttribute('data-palette', 'harbour');
  await expect.poll(() => paper(page)).not.toBe(weekdayPaper);
  await expect(shown(page, WORK_TASK)).toHaveCount(0);
  await expect(page.locator('.now__status')).toHaveText('Personal picked until 18:00');
  await expect(select(page)).toBeFocused();

  const jump = async (time: string): Promise<void> => {
    const now = await page.evaluate(() => Date.now());
    await page.clock.fastForward(zonedDate(weekday, time).getTime() - now);
  };
  await jump('17:59');
  await expect(state(page)).toHaveText('Picked');
  await jump('18:00');
  await expect(state(page)).toHaveText('Automatic');
  await expect(shown(page, PERSONAL_TASK)).toBeVisible();
  await expect(shown(page, WORK_TASK)).toHaveCount(0);
});
