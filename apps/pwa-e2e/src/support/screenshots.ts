// SPDX-License-Identifier: EUPL-1.2

// Helpers for the on-demand `*.shots.ts` files, run only through playwright.shots.config.mts. Each `shoot` writes the
// screen in light and in dark, each as a PNG plus a JSON sidecar that scripts/pr-screenshots.mts reads.
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test as base } from './fixtures.ts';
import { SHOTS_ROOT } from './shots-setup.ts';
import { addDays, isoWeekdayOf, localToday, zonedDate } from './time.ts';

export { expect };

/**
 * The signed-in `test`, with the tap highlight hidden from the first page on. A phone fades its tap highlight at once,
 * but the emulated one stays painted after `locator.tap()` until the next touch.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '* { -webkit-tap-highlight-color: transparent !important; }';
        document.head.append(style);
      });
    });
    await use(context);
  },
});

export const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
} as const;

export const DESKTOP = { viewport: { width: 1280, height: 800 } } as const;

const NAME = /^\d{2}-[a-z0-9]+(-[a-z0-9]+)*$/;

const SCHEMES = ['light', 'dark'] as const;

/**
 * Pins the PWA's clock and returns its pinned today as `YYYY-MM-DD`. Call it after the sign-up and before the page
 * load that shows the seeded data, and seed dates relative to the returned date. The default is 10:00 on today, or on
 * the next Monday at a weekend: Work is then the Current Area, so the palette is Evergreen, and today cannot flip at
 * midnight mid-run. Dates still follow the run's week; pass `at` for the same dates on every run. The server keeps its
 * real clock.
 */
export const pinClock = async (page: Page, at?: Date): Promise<string> => {
  let instant = at;
  if (instant === undefined) {
    let date = localToday().date;
    while (isoWeekdayOf(date) > 5) date = addDays(date, 1);
    instant = zonedDate(date, '10:00');
  }
  await page.clock.install({ time: instant });
  return localToday(instant).date;
};

export const scrollTo = async (page: Page, end: 'top' | 'end'): Promise<void> => {
  await page.evaluate((to) => {
    const top = to === 'top' ? 0 : document.documentElement.scrollHeight;
    window.scrollTo({ top, behavior: 'instant' });
  }, end);
};

export const blurActive = async (page: Page): Promise<void> => {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
};

/**
 * Writes the screen in light and in dark to `dist/screenshots/<topic>/<name>-<scheme>.png`, each with a JSON sidecar,
 * and leaves the page in light. `name` looks like `01-card-sheet` and sorts into display order. Each image must show
 * the Evergreen palette, which `pinClock` gives.
 */
export const shoot = async (
  page: Page,
  name: string,
  caption: string,
  options?: { group?: string },
): Promise<void> => {
  if (!NAME.test(name)) throw new Error(`shoot: name must look like 01-card-sheet, got ${name}`);
  const dir = join(SHOTS_ROOT, basename(test.info().file, '.shots.ts'));
  await mkdir(dir, { recursive: true });
  const sidecar = {
    caption,
    group: options?.group ?? null,
    ...page.viewportSize(),
    deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
  };
  const html = page.locator('html');
  for (const scheme of SCHEMES) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(html).toHaveAttribute('data-theme', scheme);
    await expect(html).not.toHaveAttribute('data-palette');
    const file = join(dir, `${name}-${scheme}`);
    // Created exclusively: globalSetup empties the folder, so an existing sidecar means another test used this name.
    await writeFile(`${file}.json`, `${JSON.stringify(sidecar, null, 2)}\n`, { flag: 'wx' });
    // The viewport only: a full-page shot would put the editor's fixed footer mid-page.
    await page.screenshot({ path: `${file}.png`, animations: 'disabled' });
  }
  await page.emulateMedia({ colorScheme: 'light' });
};

/**
 * For a screen taller than the viewport: shoots its top as `name` and its end as `<name>-end`, then scrolls back to the
 * top. The bare name sorts first, so the screen as it opens leads its table.
 */
export const shootEnds = async (
  page: Page,
  name: string,
  caption: string,
  options?: { group?: string },
): Promise<void> => {
  await scrollTo(page, 'top');
  await shoot(page, name, caption, options);
  await scrollTo(page, 'end');
  await shoot(page, `${name}-end`, `${caption}, end`, options);
  await scrollTo(page, 'top');
};
