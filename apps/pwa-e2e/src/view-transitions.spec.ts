// SPDX-License-Identifier: EUPL-1.2

import type { Page } from '@playwright/test';

import { expect, test } from './support/fixtures.ts';
import { seedTask } from './support/seed.ts';

interface Named {
  name: string;
  tag: string;
  classes: string;
}

interface TransitionRecord {
  kind: string | null;
  oldNames: Named[];
  newNames: Named[];
  skipped: boolean;
  settled: boolean;
  navMarkZ: string | null;
  shellNavZ: string | null;
}

declare global {
  interface Window {
    __viewTransitions?: TransitionRecord[];
  }
}

// Runs in the page before its own scripts. Records each view transition: the kind and the names on the old side
// (read just after the router's handler), and the names and the group ladder on the new side (read on `ready`).
const recordViewTransitions = (): void => {
  if (typeof Document.prototype.startViewTransition !== 'function') return;

  const records: TransitionRecord[] = [];
  window.__viewTransitions = records;

  const named = (): Named[] =>
    [...document.body.querySelectorAll('*')].flatMap((element) => {
      const name = getComputedStyle(element).getPropertyValue('view-transition-name');
      return name === 'none' || name === ''
        ? []
        : [
            {
              name,
              tag: element.tagName.toLowerCase(),
              classes: element.getAttribute('class') ?? '',
            },
          ];
    });

  const groupZ = (name: string): string =>
    getComputedStyle(document.documentElement, `::view-transition-group(${name})`).zIndex;

  const original = Document.prototype.startViewTransition;

  Document.prototype.startViewTransition = (
    ...args: Parameters<Document['startViewTransition']>
  ): ViewTransition => {
    const transition = original.apply(document, args);
    const record: TransitionRecord = {
      kind: null,
      oldNames: [],
      newNames: [],
      skipped: false,
      settled: false,
      navMarkZ: null,
      shellNavZ: null,
    };
    records.push(record);

    // Angular calls its handler synchronously once startViewTransition returns, so this runs after it.
    queueMicrotask(() => {
      record.kind = document.documentElement.getAttribute('data-transition');
      record.oldNames = named();
    });

    transition.ready.then(
      () => {
        record.newNames = named();
        record.navMarkZ = groupZ('nav-mark');
        record.shellNavZ = groupZ('shell-nav');
        record.settled = true;
      },
      () => {
        record.skipped = true;
        record.settled = true;
      },
    );

    return transition;
  };
};

const recordCount = (page: Page): Promise<number> =>
  page.evaluate(() => window.__viewTransitions?.length ?? 0);

// The newest record once a transition started after `before` records has settled.
const lastSettled = async (page: Page, before: number): Promise<TransitionRecord> => {
  await expect
    .poll(() =>
      page.evaluate((count) => {
        const records = window.__viewTransitions ?? [];
        return records.length > count && records[records.length - 1]?.settled === true;
      }, before),
    )
    .toBe(true);

  return page.evaluate(() => {
    const records = window.__viewTransitions ?? [];
    const last = records[records.length - 1];
    if (last === undefined) throw new Error('no view transition was recorded');
    return last;
  });
};

const withName = (names: Named[], name: string): Named[] =>
  names.filter((named) => named.name === name);

const namesOf = (names: Named[]): string[] => names.map((named) => named.name);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(recordViewTransitions);
  await page.reload();
});

test('switches tabs with a fade-through and keeps the mark above the nav', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const steps = [
    { link: 'Inbox', heading: 'Inbox', kind: 'tab-forward' },
    { link: 'Today', heading: 'Today', kind: 'tab-back' },
    { link: 'Now', heading: 'Now', kind: 'tab-back' },
  ];
  const records: TransitionRecord[] = [];

  for (const step of steps) {
    const before = await recordCount(page);
    await nav.getByRole('link', { name: step.link }).click();
    await expect(page.getByRole('heading', { level: 1, name: step.heading })).toBeVisible();
    records.push(await lastSettled(page, before));
  }

  expect(records.map((record) => record.kind)).toEqual(steps.map((step) => step.kind));

  for (const record of records) {
    expect(record.skipped).toBe(false);
    expect(namesOf(record.oldNames)).toEqual(
      expect.arrayContaining(['page', 'shell-nav', 'nav-mark']),
    );
    expect(withName(record.newNames, 'nav-mark')).toHaveLength(1);
  }

  expect(records[0]?.navMarkZ).toBe('3');
  expect(records[0]?.shellNavZ).toBe('2');
});

test('opens the top pick with Push and moves its title, then goes back with Pop', async ({
  page,
}) => {
  await seedTask(page, { title: 'Send the report', important: false, estimateMinutes: 25 });
  await page.reload();

  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Send the report');

  let before = await recordCount(page);
  await topPick.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('h1.task-editor__title')).toBeVisible();
  const push = await lastSettled(page, before);

  expect(push.kind).toBe('push');
  expect(withName(push.oldNames, 'task-title')).toEqual([
    { name: 'task-title', tag: 'h2', classes: 'asys-top-pick__title' },
  ]);
  expect(withName(push.newNames, 'task-title')).toEqual([
    { name: 'task-title', tag: 'h1', classes: 'task-editor__title' },
  ]);

  before = await recordCount(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/now$/);
  const pop = await lastSettled(page, before);

  expect(pop.kind).toBe('pop');
  expect(withName(pop.oldNames, 'task-title')).toEqual([
    { name: 'task-title', tag: 'h1', classes: 'task-editor__title' },
  ]);
  expect(withName(pop.newNames, 'task-title')).toEqual([
    { name: 'task-title', tag: 'h2', classes: 'asys-top-pick__title' },
  ]);
});

test("moves a ranked row's title into the editor", async ({ page }) => {
  await seedTask(page, { title: 'Plan the year', important: true, estimateMinutes: 25 });
  await seedTask(page, { title: 'Water the plants', important: false, estimateMinutes: 25 });
  await page.reload();

  const row = page.locator('a.asys-picker-row');
  await expect(row).toHaveCount(1);

  const before = await recordCount(page);
  await row.click();
  await expect(page.locator('h1.task-editor__title')).toBeVisible();
  const push = await lastSettled(page, before);

  expect(push.kind).toBe('push');
  expect(withName(push.oldNames, 'task-title')).toEqual([
    { name: 'task-title', tag: 'span', classes: 'asys-picker-row__title' },
  ]);
  expect(withName(push.newNames, 'task-title')).toEqual([
    { name: 'task-title', tag: 'h1', classes: 'task-editor__title' },
  ]);
});

test("goes back from the editor's Done without a morph", async ({ page }) => {
  await seedTask(page, { title: 'Send the report', important: false, estimateMinutes: 25 });
  await page.reload();

  const topPick = page.locator('article.asys-top-pick');
  let before = await recordCount(page);
  await topPick.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('h1.task-editor__title')).toBeVisible();
  await lastSettled(page, before);

  before = await recordCount(page);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  const pop = await lastSettled(page, before);

  expect(pop.kind).toBe('pop');
  expect(withName(pop.oldNames, 'task-title')).toEqual([]);
  expect(withName(pop.newNames, 'task-title')).toEqual([]);
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('skips every transition under reduced motion', async ({ page }) => {
    const before = await recordCount(page);
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('link', { name: 'Inbox' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
    const record = await lastSettled(page, before);

    expect(record.skipped).toBe(true);
    expect(record.kind).toBeNull();
    await expect(page.locator('html')).not.toHaveAttribute('data-transition');
  });
});
