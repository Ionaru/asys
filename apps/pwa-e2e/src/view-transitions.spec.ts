// SPDX-License-Identifier: EUPL-1.2

import type { Page } from '@playwright/test';

import { expect, test } from './support/fixtures.ts';
import { captureTask, seedTask } from './support/seed.ts';

interface Named {
  name: string;
  tag: string;
  classes: string;
}

interface Box {
  left: number;
  top: number;
}

interface TransitionRecord {
  kind: string | null;
  oldNames: Named[];
  newNames: Named[];
  oldNavBoxes: Record<string, Box>;
  newNavBoxes: Record<string, Box>;
  skipped: boolean;
  settled: boolean;
  navMarkZ: string | null;
  shellNavZ: string | null;
  navZ: Record<string, string>;
  pageNewAnimation: string | null;
}

// The bottom nav's names that must not move between tabs: its glyphs and the Inbox count.
const NAV_STILL = ['nav-glyph-1', 'nav-glyph-2', 'nav-glyph-3', 'nav-badge'];

declare global {
  interface Window {
    __viewTransitions?: TransitionRecord[];
  }
}

// Runs in the page before its own scripts. Records each view transition: the kind, the names and the bottom nav's
// boxes on the old side (read just after the router's handler), and the same plus the group ladder on the new side
// (read on `ready`).
const recordViewTransitions = (): void => {
  if (typeof Document.prototype.startViewTransition !== 'function') return;

  const records: TransitionRecord[] = [];
  window.__viewTransitions = records;

  const nameOf = (element: Element): string | null => {
    const name = getComputedStyle(element).getPropertyValue('view-transition-name');
    return name === 'none' || name === '' ? null : name;
  };

  const named = (): Named[] =>
    [...document.body.querySelectorAll('*')].flatMap((element) => {
      const name = nameOf(element);
      return name === null
        ? []
        : [
            {
              name,
              tag: element.tagName.toLowerCase(),
              classes: element.getAttribute('class') ?? '',
            },
          ];
    });

  const navBoxes = (): Record<string, Box> =>
    Object.fromEntries(
      [...document.body.querySelectorAll('*')].flatMap((element) => {
        const name = nameOf(element);
        if (name === null || !name.startsWith('nav-')) return [];
        const rect = element.getBoundingClientRect();
        return [[name, { left: Math.round(rect.left), top: Math.round(rect.top) }]];
      }),
    );

  const groupZ = (name: string): string =>
    getComputedStyle(document.documentElement, `::view-transition-group(${name})`).zIndex;

  const pageNewAnimation = (): string =>
    getComputedStyle(document.documentElement, '::view-transition-new(page)').animationName;

  const original = Document.prototype.startViewTransition;

  Document.prototype.startViewTransition = (
    ...args: Parameters<Document['startViewTransition']>
  ): ViewTransition => {
    const transition = original.apply(document, args);
    const record: TransitionRecord = {
      kind: null,
      oldNames: [],
      newNames: [],
      oldNavBoxes: {},
      newNavBoxes: {},
      skipped: false,
      settled: false,
      navMarkZ: null,
      shellNavZ: null,
      navZ: {},
      pageNewAnimation: null,
    };
    records.push(record);

    // Angular calls its handler synchronously once startViewTransition returns, so this runs after it.
    queueMicrotask(() => {
      record.kind = document.documentElement.getAttribute('data-transition');
      record.oldNames = named();
      record.oldNavBoxes = navBoxes();
    });

    transition.ready.then(
      () => {
        record.newNames = named();
        record.newNavBoxes = navBoxes();
        record.navMarkZ = groupZ('nav-mark');
        record.shellNavZ = groupZ('shell-nav');
        record.navZ = Object.fromEntries(
          Object.keys(record.newNavBoxes).map((name) => [name, groupZ(name)]),
        );
        record.pageNewAnimation = pageNewAnimation();
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

test('moves only the mark between tabs, leaving the glyphs and the Inbox count in place', async ({
  page,
}) => {
  await captureTask(page, { title: 'Call the bank' });
  await page.reload();

  const inbox = page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Inbox, 1 waiting' });
  await expect(inbox).toBeVisible();

  const before = await recordCount(page);
  await inbox.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
  const record = await lastSettled(page, before);

  expect(record.kind).toBe('tab-forward');
  expect(record.skipped).toBe(false);

  for (const name of NAV_STILL) {
    expect(record.oldNavBoxes[name], name).toBeDefined();
    expect(record.newNavBoxes[name], name).toEqual(record.oldNavBoxes[name]);
    expect(record.navZ[name], name).toBe('4');
  }

  expect(record.navZ['nav-mark']).toBe('3');
  expect(record.newNavBoxes['nav-mark']?.left).toBeGreaterThan(
    record.oldNavBoxes['nav-mark']?.left ?? Infinity,
  );
});

test('opens the top pick with Push and moves its title, then goes back with Pop', async ({
  page,
}) => {
  await seedTask(page, { title: 'Send the report', important: false, estimateMinutes: 25 });
  await page.reload();

  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Send the report');

  let before = await recordCount(page);
  await topPick.locator('a.asys-top-pick__link').click();
  await expect(page.locator('h1.task-editor__title')).toBeVisible();
  const push = await lastSettled(page, before);

  expect(push.kind).toBe('push');
  expect(withName(push.oldNames, 'task-title')).toEqual([
    { name: 'task-title', tag: 'span', classes: 'asys-top-pick__title-text' },
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
    { name: 'task-title', tag: 'span', classes: 'asys-top-pick__title-text' },
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
  await topPick.locator('a.asys-top-pick__link').click();
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

test("captures the Undo bar on the editor's Done Pop", async ({ page }) => {
  await seedTask(page, { title: 'Send the report', important: false, estimateMinutes: 25 });
  await page.reload();

  let before = await recordCount(page);
  await page.locator('article.asys-top-pick a.asys-top-pick__link').click();
  await expect(page.locator('h1.task-editor__title')).toBeVisible();
  await lastSettled(page, before);

  before = await recordCount(page);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  const pop = await lastSettled(page, before);

  expect(pop.kind).toBe('pop');
  expect(withName(pop.newNames, 'shell-undo')).toHaveLength(1);
});

// Capture is a screen of its own at the tabs' level but not a tab, so leaving it for Now is a Swap.
test("swaps from Capture to Now with the browser's own cross-fade", async ({ page }) => {
  await page.goto('/capture');
  await expect(page.getByRole('heading', { level: 1, name: 'Capture' })).toBeVisible();

  const before = await recordCount(page);
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Now', exact: true })
    .click();
  await expect(page).toHaveURL(/\/now$/);
  const swap = await lastSettled(page, before);

  expect(swap.kind).toBe('swap');
  // The UA's plus-lighter blend keeps what both screens share at full opacity through the cross-fade.
  expect(swap.pageNewAnimation).toContain('-ua-mix-blend-mode-plus-lighter');
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
