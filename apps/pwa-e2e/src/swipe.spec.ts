// SPDX-License-Identifier: EUPL-1.2

// Swipe to Done on Now, driven by trusted touch input over CDP (support/touch.ts). What jsdom cannot show is proved
// here: touch pointers reach the swipe, `touch-action: pan-y pinch-zoom` leaves vertical scrolling and pinch zoom to
// the browser, `overflow: clip` stops the page scrolling sideways, and the reveals stay hidden at rest.
import { setTimeout as sleep } from 'node:timers/promises';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { seedTask } from './support/seed.ts';
import { addDays, localToday, skipNearMidnight } from './support/time.ts';
import { touchscreen } from './support/touch.ts';
import type { Point, Touchscreen } from './support/touch.ts';

test.use({ viewport: { width: 412, height: 839 }, hasTouch: true, isMobile: true });

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How far inside the target's edge a swipe starts: clear of the 24px dead zone at the viewport edge. */
const EDGE_INSET = 40;

const PULL_STEPS = 8;

const PULL_STEP_MS = 16;

/** Creates the three Tasks every case uses, then reloads. Returns the id of "Plan the year". */
const seed = async (page: Page): Promise<string> => {
  skipNearMidnight(test);
  await seedTask(page, {
    title: 'Renew the permit',
    important: false,
    estimateMinutes: 25,
    due: { date: addDays(localToday().date, -1) },
  });
  const planId = await seedTask(page, {
    title: 'Plan the year',
    important: true,
    estimateMinutes: 25,
  });
  await seedTask(page, { title: 'Water the plants', important: false, estimateMinutes: 1 });
  await page.reload();
  await expect(page.locator('.asys-top-pick__title')).toHaveText('Renew the permit');
  return planId;
};

/** Twelve more ranked rows, so that Now is taller than the viewport. */
const seedScrollTasks = async (page: Page): Promise<void> => {
  for (let index = 1; index <= 12; index++) {
    await seedTask(page, {
      title: `Scroll Task ${index}`,
      important: false,
      estimateMinutes: 25,
    });
  }
  await page.reload();
  await expect(page.locator('.asys-top-pick__title')).toHaveText('Renew the permit');
  await expect(page.locator('a.asys-picker-row', { hasText: 'Scroll Task 12' })).toBeVisible();
};

const row = (page: Page, title: string): Locator =>
  page.locator('ul.now__list li').filter({
    has: page.locator('a.asys-picker-row', { hasText: title }),
  });

const rowSwipe = (page: Page, title: string): Locator =>
  row(page, title).locator('asys-swipe-actions');

const undoBar = (page: Page): Locator => page.locator('.asys-undo');

const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('the target has no box');
  return box;
};

/** A right swipe starts inside the left edge, at the vertical centre. */
const leftSide = (box: Box): Point => ({ x: box.x + EDGE_INSET, y: box.y + box.height / 2 });

/** A left swipe starts inside the right edge, at the vertical centre. */
const rightSide = (box: Box): Point => ({
  x: box.x + box.width - EDGE_INSET,
  y: box.y + box.height / 2,
});

/** Presses at `from` and moves `dx` sideways in several steps, with no release. */
const pull = async (screen: Touchscreen, from: Point, dx: number): Promise<void> => {
  await screen.down(from);
  for (let step = 1; step <= PULL_STEPS; step++) {
    await screen.move({ x: from.x + (dx * step) / PULL_STEPS, y: from.y });
    await sleep(PULL_STEP_MS);
  }
};

// The Undo ring's fill is a clock, not motion: it runs for the whole 5 s window, so it does not count here.
const settle = async (page: Page): Promise<void> => {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((animation) => {
            const target =
              animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
            const isClock =
              target instanceof Element && target.closest('.asys-undo__timer') !== null;
            return animation.playState === 'running' && !isClock;
          }).length,
      ),
    )
    .toBe(0);
};

const surfaceTranslate = (swipe: Locator): Promise<string> =>
  swipe.locator('.asys-swipe__surface').evaluate((element) => getComputedStyle(element).translate);

const expectNoSidewaysScroll = async (page: Page): Promise<void> => {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  expect(widths.scroll, 'documentElement scrollWidth').toBeLessThanOrEqual(widths.client);
  expect(widths.bodyScroll, 'body scrollWidth').toBeLessThanOrEqual(widths.client);
};

test('A right swipe on the top pick holds it Done, and Undo brings it back', async ({ page }) => {
  await seed(page);
  const screen = await touchscreen(page);
  const title = page.locator('.asys-top-pick__title');
  const swipe = page.locator('asys-swipe-actions.now__top-swipe');
  const reveals = {
    end: swipe.locator('.asys-swipe__reveal--end'),
    start: swipe.locator('.asys-swipe__reveal--start'),
  };

  // Both reveals are hidden at rest.
  await expect(reveals.end).toBeHidden();
  await expect(reveals.start).toBeHidden();

  // The swipe starts on the title, never on a button.
  const titleBox = await boxOf(title);
  await pull(screen, { x: titleBox.x + 20, y: titleBox.y + titleBox.height / 2 }, 200);
  await expect(swipe).toHaveClass(/asys-swipe--armed/);
  await expect(reveals.end).toBeVisible();
  await expect(reveals.end).toHaveText('Done');
  await expect(reveals.start).toBeHidden();

  await screen.up();
  await settle(page);
  await expect(title).toHaveText('Plan the year');
  await expect(undoBar(page)).toContainText('Renew the permit');
  await expect(undoBar(page)).toContainText('Done');
  await expect(page).toHaveURL(/\/now$/);
  await expect(page.locator('.shell__status')).toHaveText(
    '“Renew the permit” is Done. Undo is available for 5 seconds.',
  );

  // The pointer inside the bar holds the 5 s window, so the checks above and below cannot race it.
  const undo = undoBar(page).getByRole('button', { name: /^Undo/ });
  await undo.hover();
  await undo.click();
  await expect(title).toHaveText('Renew the permit');
  await expect(undoBar(page)).toHaveCount(0);
});

test('A right swipe on a row holds it Done without opening it, and Undo brings it back', async ({
  page,
}) => {
  await seed(page);
  const screen = await touchscreen(page);
  const plan = row(page, 'Plan the year');

  const box = await boxOf(rowSwipe(page, 'Plan the year'));
  const from = leftSide(box);
  await screen.drag(from, { x: from.x + 260, y: from.y });
  await settle(page);

  await expect(page).toHaveURL(/\/now$/);
  await expect(plan).toHaveCount(0);
  await expect(undoBar(page)).toContainText('Plan the year');
  await expect(undoBar(page)).toContainText('Done');

  const undo = undoBar(page).getByRole('button', { name: /^Undo/ });
  await undo.hover();
  await undo.click();
  await expect(plan).toHaveCount(1);
  await expect(undoBar(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/now$/);
});

test('A short, slow right swipe springs back and does nothing', async ({ page }) => {
  await seed(page);
  const screen = await touchscreen(page);
  const swipe = rowSwipe(page, 'Plan the year');

  const box = await boxOf(swipe);
  const from = leftSide(box);
  // Held still for 150 ms before the release, so there is no fling either.
  await screen.drag(from, { x: from.x + 100, y: from.y }, { holdMs: 150 });
  await settle(page);

  await expect(row(page, 'Plan the year')).toHaveCount(1);
  expect(await surfaceTranslate(swipe)).toBe('none');
  await expect(swipe.locator('.asys-swipe__reveal--end')).toBeHidden();
  await expect(undoBar(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/now$/);
});

test('A vertical drag on a row scrolls the page and swipes nothing', async ({ page }) => {
  await seed(page);
  await seedScrollTasks(page);
  const screen = await touchscreen(page);

  const box = await boxOf(page.locator('ul.now__list li').nth(3));
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await screen.drag(from, { x: from.x, y: from.y - 300 });

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await settle(page);
  await expect(undoBar(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/now$/);
});

test('A tap on a row opens the Task', async ({ page }) => {
  const planId = await seed(page);

  const box = await boxOf(rowSwipe(page, 'Plan the year'));
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  await expect(page).toHaveURL(new RegExp(`/tasks/${planId}$`));
});

test('A pinch on a row zooms the page', async ({ page }) => {
  await seed(page);
  const screen = await touchscreen(page);

  const box = await boxOf(rowSwipe(page, 'Plan the year'));
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const before = await page.evaluate(() => window.visualViewport?.scale ?? 1);
  await screen.pinch(centre, 40, 240);

  await expect
    .poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1))
    .toBeGreaterThan(before);
  await expect(undoBar(page)).toHaveCount(0);
});

test('A swipe in progress cannot scroll the page sideways', async ({ page }) => {
  await seed(page);
  const screen = await touchscreen(page);
  const swipe = rowSwipe(page, 'Plan the year');

  const box = await boxOf(swipe);
  // 300px is well past the right edge of the row, so an unclipped surface would widen the page.
  await pull(screen, leftSide(box), 300);
  await expect(swipe).toHaveClass(/asys-swipe--armed/);
  await expectNoSidewaysScroll(page);

  await screen.cancel();
  await settle(page);
  await expect(row(page, 'Plan the year')).toHaveCount(1);
  expect(await surfaceTranslate(swipe)).toBe('none');
  await expect(undoBar(page)).toHaveCount(0);
});

test('A left swipe on a row opens Log progress under it', async ({ page }) => {
  await seed(page);
  const screen = await touchscreen(page);

  const box = await boxOf(rowSwipe(page, 'Plan the year'));
  const from = rightSide(box);
  await screen.drag(from, { x: from.x - 260, y: from.y });

  const field = row(page, 'Plan the year').getByLabel('Time still needed');
  await expect(field).toBeVisible();
  await expect(field).toBeFocused();
  await expect(page.locator('article.asys-top-pick asys-log-progress-form')).toHaveCount(0);

  // The form sits on the row's ground: no strip of page background between the row and the form.
  await settle(page);
  const rowBox = await boxOf(rowSwipe(page, 'Plan the year'));
  const formBox = await boxOf(row(page, 'Plan the year').locator('.now__row-form'));
  expect(formBox.y).toBeCloseTo(rowBox.y + rowBox.height, 0);
  await expect(undoBar(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/now$/);
});

test('A left swipe on a Task with an Estimate under 2 only says why it cannot log', async ({
  page,
}) => {
  await seed(page);
  const screen = await touchscreen(page);
  const swipe = rowSwipe(page, 'Water the plants');
  const reveal = swipe.locator('.asys-swipe__reveal--start');

  await expect(reveal).toBeHidden();
  const box = await boxOf(swipe);
  const from = rightSide(box);
  await pull(screen, from, -120);
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveText('Needs an Estimate');

  await screen.up();
  await settle(page);
  await expect(reveal).toBeHidden();
  await expect(page.getByLabel('Time still needed')).toHaveCount(0);
  await expect(undoBar(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/now$/);
});
