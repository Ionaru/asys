// SPDX-License-Identifier: EUPL-1.2

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { areaId, captureTask, seedTask } from './support/seed.ts';

test.use({ viewport: { width: 375, height: 812 } });

const URL_TITLE = 'https://example.com/a/very/long/path/12345';

const TRIAGED_URL_TITLE = `${URL_TITLE}/triaged`;

const seedPhoneTasks = async (page: Page): Promise<string> => {
  // The untriaged Task is captured first, so it is the oldest and the Inbox card.
  await captureTask(page, { title: URL_TITLE });
  let urlTaskId = '';
  for (let index = 1; index <= 12; index++) {
    // The oldest triaged Task is the TopPick, the newest is the last Now row: both carry a long unbroken title.
    const title =
      index === 1
        ? `${URL_TITLE}/top`
        : index === 12
          ? TRIAGED_URL_TITLE
          : `Phone width Task ${index}`;
    const id = await seedTask(page, { title, important: false, estimateMinutes: 25 });
    if (index === 12) urlTaskId = id;
  }
  await page.reload();
  return urlTaskId;
};

const expectNoSidewaysScroll = async (page: Page, path: string, ready: Locator): Promise<void> => {
  await page.goto(path);
  await expect(ready).toBeVisible();
  await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  expect(widths.scroll, `${path} documentElement scrollWidth`).toBeLessThanOrEqual(widths.client);
  expect(widths.bodyScroll, `${path} body scrollWidth`).toBeLessThanOrEqual(widths.client);
};

const scrollToBottom = async (page: Page): Promise<void> => {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.ceil(window.scrollY + window.innerHeight) >=
          document.documentElement.scrollHeight - 1,
      ),
    )
    .toBe(true);
};

const expectClearOf = async (target: Locator, covers: readonly Locator[]): Promise<void> => {
  const box = await target.boundingBox();
  if (box === null) throw new Error('target has no box');
  for (const cover of covers) {
    await expect(cover).toBeVisible();
    const other = await cover.boundingBox();
    if (other === null) throw new Error('cover has no box');
    const intersects =
      box.x < other.x + other.width &&
      other.x < box.x + box.width &&
      box.y < other.y + other.height &&
      other.y < box.y + box.height;
    expect(intersects, `box ${JSON.stringify(box)} vs ${JSON.stringify(other)}`).toBe(false);
  }
};

test('No sideways scroll on the Task screens at phone width', async ({ page }) => {
  const urlTaskId = await seedPhoneTasks(page);
  const heading = (name: string): Locator => page.getByRole('heading', { level: 1, name });
  const screens: readonly (readonly [string, Locator])[] = [
    ['/now', page.locator('a.asys-picker-row').filter({ hasText: TRIAGED_URL_TITLE })],
    ['/today', heading('Today')],
    ['/inbox', page.locator('article.asys-triage .asys-triage__title')],
    ['/capture', heading('Capture')],
    [`/tasks/${urlTaskId}`, heading(TRIAGED_URL_TITLE)],
  ];
  for (const [path, ready] of screens) {
    await expectNoSidewaysScroll(page, path, ready);
    if (path === '/inbox') await expect(ready).toHaveText(URL_TITLE);
  }
});

test('No sideways scroll on Settings, Areas and the account at phone width', async ({ page }) => {
  await seedPhoneTasks(page);
  const work = await areaId(page, 'Work');
  const screens: readonly (readonly [string, Locator])[] = [
    ['/settings', page.getByLabel('Time zone')],
    ['/settings/areas', page.locator('a.area-list__link').first()],
    ['/settings/areas/new', page.getByLabel('Name')],
    [`/settings/areas/${work}`, page.getByRole('heading', { level: 1, name: 'Work' })],
    ['/account', page.locator('li.account__row').first()],
  ];
  for (const [path, ready] of screens) {
    await expectNoSidewaysScroll(page, path, ready);
  }
});

test('Nothing covers the last Now row, with the pill or the open quick add', async ({ page }) => {
  await seedPhoneTasks(page);
  await page.goto('/now');
  const lastRow = page.locator('ul.now__list li').last();
  await expect(lastRow).toBeVisible();
  await expect(lastRow).toContainText(TRIAGED_URL_TITLE);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const pill = page.getByRole('button', { name: 'Capture' });

  await scrollToBottom(page);
  await expectClearOf(lastRow, [pill, nav]);

  await pill.click();
  const quickAdd = page.locator('asys-quick-add');
  await expect(quickAdd).toBeVisible();
  await scrollToBottom(page);
  await expectClearOf(lastRow, [quickAdd, nav]);

  // A label broken over two lines makes its button taller than the input.
  const inputBox = await page.getByLabel('Capture a Task').boundingBox();
  if (inputBox === null) throw new Error('input has no box');
  for (const name of ['Add', 'Close']) {
    const buttonBox = await quickAdd.getByRole('button', { name, exact: true }).boundingBox();
    if (buttonBox === null) throw new Error(`${name} has no box`);
    expect(buttonBox.height, `${name} button height`).toBeLessThanOrEqual(inputBox.height);
  }

  await page.getByLabel('Capture a Task').fill('Status line Task');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.asys-quickadd__status')).toHaveText(
    'Captured. It waits in the Inbox.',
  );
  await scrollToBottom(page);
  await expectClearOf(lastRow, [quickAdd, nav]);
});

test('Nothing covers the Inbox Triage card footer or its open Drop confirmation', async ({
  page,
}) => {
  await seedPhoneTasks(page);
  await page.goto('/inbox');
  const card = page.locator('article.asys-triage');
  await expect(card).toBeVisible();
  const footer = card.locator('.asys-triage__footer');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const pill = page.getByRole('button', { name: 'Capture' });

  await scrollToBottom(page);
  await expectClearOf(footer, [pill, nav]);

  await card.locator('.asys-triage__drop').click();
  const confirm = card.getByRole('group', { name: /^Drop “/ });
  await expect(confirm).toBeVisible();
  await scrollToBottom(page);
  await expectClearOf(footer, [pill, nav]);
  await expectClearOf(confirm, [pill, nav]);
});
