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
  // Boxes mid-animation say nothing about where the elements settle. The Undo ring's fill, paused while the
  // bar holds focus or the pointer, is a clock rather than motion, so only running animations count.
  await expect
    .poll(() =>
      target
        .page()
        .evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length),
    )
    .toBe(0);
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
    [`/tasks/${urlTaskId}`, page.getByRole('textbox', { name: 'Title' })],
  ];
  for (const [path, ready] of screens) {
    await expectNoSidewaysScroll(page, path, ready);
    if (path === '/inbox') await expect(ready).toHaveText(URL_TITLE);
    if (path.startsWith('/tasks/')) await expect(ready).toHaveValue(TRIAGED_URL_TITLE);
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

test('The bottom nav centres its destinations when Capture is not shown', async ({ page }) => {
  await seedTask(page, { title: 'Centred nav Task', important: false, estimateMinutes: 25 });
  await page.reload();
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const capture = page.getByRole('button', { name: 'Capture' });
  // The free space between the bar's padding edges and its first and last child.
  const gaps = (): Promise<{ start: number; end: number }> =>
    nav.evaluate((element) => {
      const bar = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const first = element.firstElementChild?.getBoundingClientRect();
      const last = element.lastElementChild?.getBoundingClientRect();
      if (!first || !last) throw new Error('the bar is empty');
      return {
        start: first.left - bar.left - parseFloat(style.paddingLeft),
        end: bar.right - parseFloat(style.paddingRight) - last.right,
      };
    });

  // On a tab the destinations start the bar and Capture ends it.
  await expect(capture).toBeVisible();
  const tab = await gaps();
  expect(tab.start, JSON.stringify(tab)).toBeCloseTo(0, 0);
  expect(tab.end, JSON.stringify(tab)).toBeCloseTo(0, 0);

  // Settings has the nav but no Capture.
  await page.goto('/settings');
  await expect(page.getByLabel('Time zone')).toBeVisible();
  await expect(nav).toBeVisible();
  await expect(capture).toHaveCount(0);
  const settings = await gaps();
  expect(settings.start, JSON.stringify(settings)).toBeGreaterThan(1);
  expect(Math.abs(settings.start - settings.end), JSON.stringify(settings)).toBeLessThan(1);
});

test('The Task editor has no nav, its footer clears the card and nothing scrolls sideways', async ({
  page,
}) => {
  const taskId = await seedTask(page, {
    title: 'Editor phone Task',
    important: false,
    estimateMinutes: 25,
    captureText: 'Some notes captured with the Task',
  });
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Editor phone Task');
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);

  const done = page.getByRole('button', { name: 'Done', exact: true });
  await expect(done).toBeVisible();

  await scrollToBottom(page);
  const card = page.locator('section.task-editor__card');
  await expectClearOf(done, [card]);
  const cardBox = await card.boundingBox();
  const doneBox = await done.boundingBox();
  if (cardBox === null || doneBox === null) throw new Error('no box');
  expect(doneBox.y, JSON.stringify({ cardBox, doneBox })).toBeGreaterThanOrEqual(
    cardBox.y + cardBox.height,
  );

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  expect(widths.scroll, 'documentElement scrollWidth').toBeLessThanOrEqual(widths.client);
  expect(widths.bodyScroll, 'body scrollWidth').toBeLessThanOrEqual(widths.client);
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

  // A Done by keyboard puts focus on Undo, which pauses the 5 s window, so the bar stays up for the checks.
  await quickAdd.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(pill).toBeVisible();
  const done = page
    .locator('article.asys-top-pick')
    .getByRole('button', { name: 'Done', exact: true });
  await done.focus();
  await done.press('Enter');
  const undoBar = page.locator('.asys-undo');
  await expect(undoBar.getByRole('button', { name: 'Undo' })).toBeFocused();
  await scrollToBottom(page);
  await expectClearOf(lastRow, [undoBar, pill, nav]);

  // The pointer keeps the bar paused while focus moves to the pill and opens quick add.
  await undoBar.hover();
  await pill.press('Enter');
  await expect(quickAdd).toBeVisible();
  await scrollToBottom(page);
  await expectClearOf(lastRow, [undoBar, quickAdd, nav]);
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

for (const width of [320, 375]) {
  test.describe(`The Current Area control at ${width} wide`, () => {
    test.use({ viewport: { width, height: 812 } });

    test('The control and the More link fit beside the heading without sideways scroll', async ({
      page,
    }) => {
      await seedTask(page, { title: 'Header width Task', important: false, estimateMinutes: 25 });
      await page.goto('/now');
      const control = page.getByRole('combobox', { name: 'Current Area' });
      const more = page.getByRole('link', { name: 'More: Settings' });
      await expect(control).toBeVisible();
      await expect(more).toBeVisible();
      await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);

      // expectClearOf first waits for running animations, so the boxes below have settled.
      await expectClearOf(page.getByRole('heading', { level: 1 }), [control, more]);

      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll, 'documentElement scrollWidth').toBeLessThanOrEqual(widths.client);

      const boxes = [];
      for (const target of [control, more]) {
        const box = await target.boundingBox();
        if (box === null) throw new Error('target has no box');
        expect(box.x, JSON.stringify(box)).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, JSON.stringify(box)).toBeLessThanOrEqual(width);
        boxes.push(box);
      }

      // The control and More wrap as one group, so they always share a line.
      const [controlBox, moreBox] = boxes;
      const middle = (box: { y: number; height: number }): number => box.y + box.height / 2;
      expect(Math.abs(middle(controlBox) - middle(moreBox)), JSON.stringify(boxes)).toBeLessThan(4);
    });
  });
}
