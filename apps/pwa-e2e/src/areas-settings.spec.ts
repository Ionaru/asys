// SPDX-License-Identifier: EUPL-1.2

import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { areaId, seedTask } from './support/seed.ts';
import { addDays, localToday, skipNearMidnight } from './support/time.ts';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Records the `_tag` of every `POST /v1/commands` the page sends, in order. */
const recordCommands = (page: Page): string[] => {
  const tags: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/v1/commands')) return;
    const body = request.postDataJSON() as { _tag?: string } | null;
    tags.push(body?._tag ?? '?');
  });
  return tags;
};

const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });

test('Work gets Active hours for the whole day, then none now, and its Task leaves Now', async ({
  page,
}) => {
  skipNearMidnight(test);
  const work = await areaId(page, 'Work');
  const today = localToday();
  const dayGroup = () => page.getByRole('group', { name: DAY_NAMES[today.isoWeekday - 1] });
  const save = () => page.getByRole('button', { name: 'Save', exact: true });

  await page.goto(`/settings/areas/${work}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Work' })).toBeVisible();
  if ((await dayGroup().getByLabel('From').count()) === 0) {
    await dayGroup().getByRole('button', { name: 'Add hours' }).click();
  }
  await dayGroup().getByLabel('From').first().fill('00:00');
  await dayGroup().getByLabel('To').first().fill('00:00');
  await save().click();
  await expect(page.getByText('Area saved.', { exact: true })).toBeVisible();

  await seedTask(page, {
    title: 'Work task in hours',
    important: false,
    estimateMinutes: 25,
    areaId: work,
  });
  await page.goto('/now');
  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Work task in hours');

  await page.goto(`/settings/areas/${work}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Work' })).toBeVisible();
  const [from, to] = today.hour < 12 ? ['20:00', '21:00'] : ['02:00', '03:00'];
  await dayGroup().getByLabel('From').first().fill(from);
  await dayGroup().getByLabel('To').first().fill(to);
  await save().click();
  await expect(page.getByText('Area saved.', { exact: true })).toBeVisible();

  await nav(page).getByRole('link', { name: 'Now' }).click();
  await expect(page.getByText('Nothing to do right now.')).toBeVisible();
  await expect(page.getByText('Work task in hours')).toHaveCount(0);
  await expect(topPick).toHaveCount(0);
});

test('An unchanged Personal Area keeps Save disabled and sends no command', async ({ page }) => {
  const personal = await areaId(page, 'Personal');
  const commands = recordCommands(page);

  await page.goto(`/settings/areas/${personal}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Personal' })).toBeVisible();
  const name = page.getByLabel('Name');
  const save = page.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();

  await name.fill('Personal changed');
  await expect(save).toBeEnabled();
  await name.fill('Personal');
  await expect(save).toBeDisabled();

  expect(commands).toEqual([]);
});

test('The Urgency window moves an important Task between Plan and Do', async ({ page }) => {
  skipNearMidnight(test);
  await seedTask(page, {
    title: 'Window task',
    important: true,
    estimateMinutes: 25,
    due: { date: addDays(localToday().date, 3), time: '12:00' },
  });
  await page.reload();
  // The quadrant word follows a visually hidden "Quadrant: " for screen readers.
  const chip = page.locator('article.asys-top-pick .asys-quadrant');
  const status = (text: string) => page.getByText(text, { exact: true });
  await expect(page.locator('article.asys-top-pick .asys-top-pick__title')).toHaveText(
    'Window task',
  );
  await expect(chip).toHaveText('Quadrant: Plan');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Urgency window').selectOption('7');
  await expect(status('Urgency window saved.')).toBeVisible();
  await nav(page).getByRole('link', { name: 'Now' }).click();
  await expect(chip).toHaveText('Quadrant: Do');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByLabel('Urgency window').selectOption('1');
  await expect(status('Urgency window saved.')).toBeVisible();
  await nav(page).getByRole('link', { name: 'Now' }).click();
  await expect(chip).toHaveText('Quadrant: Plan');
});

test('A chosen time zone is not switched back to the device zone on focus', async ({ page }) => {
  const commands: { _tag?: string }[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/v1/commands')) return;
    commands.push((request.postDataJSON() as { _tag?: string } | null) ?? {});
  });
  const sentAfterTokyo = (): number => {
    const tokyo = commands.findIndex((command) => {
      const zone = (command as { timeZone?: string }).timeZone;
      return command._tag === 'SetTimeZone' && zone === 'Asia/Tokyo';
    });
    expect(tokyo).toBeGreaterThanOrEqual(0);
    return commands.slice(tokyo + 1).filter((command) => command._tag === 'SetTimeZone').length;
  };
  const zoneShown = async (): Promise<void> => {
    await expect(page.getByText('Current time zone: Asia/Tokyo')).toBeVisible();
    await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Tokyo');
  };

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(
    page.getByText('Current time zone: Europe/Amsterdam', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => localStorage.removeItem('asys.timeZone.lastReported'));

  await page.getByLabel('Time zone').selectOption('Asia/Tokyo');
  await expect(page.getByText('Time zone saved.', { exact: true })).toBeVisible();

  const focusTwice = async (): Promise<void> => {
    for (let i = 0; i < 2; i += 1) {
      const changes = page.waitForResponse((response) => response.url().includes('/v1/changes'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await changes;
    }
  };
  await focusTwice();
  expect(sentAfterTokyo()).toBe(0);
  await zoneShown();

  await page.reload();
  await zoneShown();
  await focusTwice();
  expect(sentAfterTokyo()).toBe(0);
  await zoneShown();
});
