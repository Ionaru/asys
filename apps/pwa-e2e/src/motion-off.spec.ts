// SPDX-License-Identifier: EUPL-1.2

import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { seedTask } from './support/seed.ts';

interface Peak {
  animations: number;
  transition: boolean;
  // The pill and the quick add bar both in the DOM at one rendered frame: a leave that has not finished.
  overlap: boolean;
}

interface Watch {
  peak: Peak;
  started: number;
  settled: number;
  ran: number;
}

declare global {
  interface Window {
    __motionWatch?: Watch;
  }
}

interface MotionState {
  readonly animations: number;
  readonly transition: unknown;
}

// Read at once, in the page: what is animating and which view transition is active right now.
const motionState = (page: Page): Promise<MotionState> =>
  page.evaluate(() => ({
    animations: document.getAnimations().length,
    transition:
      (document as Document & { activeViewTransition?: unknown }).activeViewTransition ?? null,
  }));

// Watches the page from now on, so a step is judged by what any frame showed, not by one late read: the peak count
// of animations, whether a view transition was ever active, whether a leaving node outlived its replacement, and
// how many view transitions were started, settled and not skipped (Angular starts one per navigation and the
// handler skips it when no motion is wanted).
const watchMotion = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const watch: Watch = {
      peak: { animations: 0, transition: false, overlap: false },
      started: 0,
      settled: 0,
      ran: 0,
    };
    window.__motionWatch = watch;

    const sample = (frame: boolean): void => {
      watch.peak.animations = Math.max(watch.peak.animations, document.getAnimations().length);
      if ((document as Document & { activeViewTransition?: unknown }).activeViewTransition)
        watch.peak.transition = true;
      // Only a rendered frame counts: a removal that follows in the same task is not a lingering leave.
      if (
        frame &&
        document.querySelector('button.asys-capture') !== null &&
        document.querySelector('asys-quick-add') !== null
      )
        watch.peak.overlap = true;
    };
    const loop = (): void => {
      sample(true);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    new MutationObserver(() => sample(false)).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    if (typeof Document.prototype.startViewTransition !== 'function') return;
    const original = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = (
      ...args: Parameters<Document['startViewTransition']>
    ): ViewTransition => {
      const transition = original.apply(document, args);
      watch.started += 1;
      transition.ready.then(
        () => {
          watch.ran += 1;
          watch.settled += 1;
        },
        () => {
          watch.settled += 1;
        },
      );
      return transition;
    };
  });

const resetPeak = (page: Page): Promise<void> =>
  page.evaluate(() => {
    if (window.__motionWatch)
      window.__motionWatch.peak = { animations: 0, transition: false, overlap: false };
  });

const readWatch = (page: Page): Promise<Watch> =>
  page.evaluate(() => {
    if (!window.__motionWatch) throw new Error('watchMotion was not called');
    return structuredClone(window.__motionWatch);
  });

const expectNoMotion = async (page: Page): Promise<void> => {
  // A skipped view transition settles within a frame or two, so let every started one settle before judging.
  await expect
    .poll(async () => {
      const { started, settled } = await readWatch(page);
      return started - settled;
    })
    .toBe(0);
  expect(await motionState(page)).toEqual({ animations: 0, transition: null });
  const watch = await readWatch(page);
  expect(watch.peak).toEqual({ animations: 0, transition: false, overlap: false });
  expect(watch.ran).toBe(0);
};

const seedOne = async (page: Page): Promise<void> => {
  await seedTask(page, { title: 'Renew the permit', important: true, estimateMinutes: 25 });
  await page.reload();
  await expect(page.locator('.asys-top-pick__title')).toHaveText('Renew the permit');
};

const done = async (page: Page): Promise<void> => {
  await page
    .locator('article.asys-top-pick')
    .getByRole('button', { name: 'Done', exact: true })
    .click();
  await expect(page.locator('.shell__status')).toHaveText('“Renew the permit” is Done.');
  await expect(page.locator('.asys-undobar')).toBeVisible();
};

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a tab change, quick add and a capture start no animation and no view transition', async ({
    page,
  }, testInfo) => {
    const nav = page.getByRole('navigation', { name: 'Primary' });
    const badge = nav.locator('.asys-bottomnav__badge');

    const kind = await page.evaluate(
      () => typeof (document as Document & { activeViewTransition?: unknown }).activeViewTransition,
    );
    testInfo.annotations.push({
      type: 'fact-12',
      description: `typeof document.activeViewTransition: ${kind}`,
    });
    console.log(`fact 12: typeof document.activeViewTransition is ${kind}`);

    const pill = page.getByRole('button', { name: 'Capture', exact: true });
    const quickAdd = page.locator('asys-quick-add');
    await watchMotion(page);

    await resetPeak(page);
    await nav.getByRole('link', { name: 'Today' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expectNoMotion(page);

    // Each step waits only for what enters, then reads, so a leave that still runs (and its removal) is not waited out.
    await resetPeak(page);
    await pill.click();
    await expect(quickAdd).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('button.asys-capture'))).toBeNull();
    await expectNoMotion(page);
    await expect(pill).toHaveCount(0);

    await resetPeak(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(pill).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('asys-quick-add'))).toBeNull();
    await expectNoMotion(page);
    await expect(quickAdd).toHaveCount(0);

    await pill.click();
    await expect(quickAdd).toBeVisible();
    await resetPeak(page);
    await page.getByLabel('Capture a Task').fill('Water the plants');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.asys-quickadd__status')).toHaveText(
      'Captured. It waits in the Inbox.',
    );
    await expect(badge).toHaveText('1');
    await expectNoMotion(page);
  });

  test('a Done still shows its status and the Undo bar, with no animation', async ({ page }) => {
    await seedOne(page);
    await watchMotion(page);
    await done(page);
    await expectNoMotion(page);
  });
});

test.describe('with motion allowed', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a Done starts animations, so the zero under reduced motion means something', async ({
    page,
  }) => {
    await seedOne(page);
    await watchMotion(page);
    await done(page);

    // The Undo bar rises and the card slides out within a few hundred ms, so the peak is what counts.
    await expect.poll(async () => (await readWatch(page)).peak.animations).toBeGreaterThan(0);
  });

  test('opening and closing quick add start animations', async ({ page }) => {
    const pill = page.getByRole('button', { name: 'Capture', exact: true });
    const quickAdd = page.locator('asys-quick-add');
    await watchMotion(page);

    await resetPeak(page);
    await pill.click();
    await expect(quickAdd).toBeVisible();
    await expect.poll(async () => (await readWatch(page)).peak.animations).toBeGreaterThan(0);
    await expect(pill).toHaveCount(0);

    await resetPeak(page);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(pill).toBeVisible();
    await expect.poll(async () => (await readWatch(page)).peak.animations).toBeGreaterThan(0);
  });
});
