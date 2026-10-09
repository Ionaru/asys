// SPDX-License-Identifier: EUPL-1.2

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { seedTask, snapshot } from './support/seed.ts';
import { E2E_ZONE, addDays, localToday, skipNearMidnight } from './support/time.ts';

declare global {
  interface Window {
    __nowWatch?: { articleGone: boolean; emptyOrLoading: boolean };
  }
}

const seedNowTasks = async (page: Parameters<typeof seedTask>[0]): Promise<void> => {
  const today = localToday().date;
  await seedTask(page, {
    title: 'Send the report',
    important: false,
    estimateMinutes: 25,
    due: { date: today, time: '23:59' },
  });
  await seedTask(page, {
    title: 'Water the plants',
    important: false,
    estimateMinutes: 25,
    due: { date: addDays(today, 1), time: '12:00' },
  });
  await seedTask(page, {
    title: 'Renew the permit',
    important: false,
    estimateMinutes: 25,
    due: { date: addDays(today, -1) },
  });
  await seedTask(page, { title: 'Plan the year', important: true, estimateMinutes: 25 });
  await page.reload();
};

test(`Now ranks the TopPick and the Tasks after it with a one-line reason (${E2E_ZONE})`, async ({
  page,
}) => {
  skipNearMidnight(test);
  await seedNowTasks(page);

  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Renew the permit');
  await expect(topPick.locator('.asys-top-pick__reason')).toHaveText('Due yesterday');
  await expect(topPick.locator('asys-status-badge')).toHaveText('Overdue');

  const row = (title: string) => page.locator('a.asys-picker-row').filter({ hasText: title });
  await expect(row('Plan the year').locator('.asys-picker-row__reason-text')).toHaveText(
    'No Due · important',
  );
  await expect(row('Send the report').locator('.asys-picker-row__reason-text')).toHaveText(
    'Latest start 23:34',
  );
  await expect(row('Water the plants').locator('.asys-picker-row__reason-text')).toHaveText(
    'Latest start tomorrow 11:35',
  );
});

test('Now rows of ranked Tasks use the ink colour and no underline', async ({ page }) => {
  skipNearMidnight(test);
  await seedNowTasks(page);

  const rows = page.locator('a.asys-picker-row');
  await expect(rows).toHaveCount(3);

  const ink = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--ink)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  for (const row of await rows.all()) {
    const style = await row.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { color: computed.color, decoration: computed.textDecorationLine };
    });
    expect(style.color).toBe(ink);
    expect(style.decoration).toBe('none');
  }
});

test('Done on the TopPick shows the next Task with no gap', async ({ page }) => {
  skipNearMidnight(test);
  await seedNowTasks(page);

  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Renew the permit');

  await page.evaluate(() => {
    const watch = { articleGone: false, emptyOrLoading: false };
    window.__nowWatch = watch;
    const check = (): void => {
      if (document.querySelector('article.asys-top-pick') === null) watch.articleGone = true;
      const text = document.querySelector('main')?.textContent ?? '';
      if (text.includes('Nothing to do right now.') || text.includes('Loading…'))
        watch.emptyOrLoading = true;
    };
    new MutationObserver(check).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

  await topPick.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Plan the year');
  await expect(page.locator('.shell__status')).toHaveText(
    '“Renew the permit” is Done. Undo is available for 5 seconds.',
  );

  const watch = await page.evaluate(() => window.__nowWatch);
  expect(watch).toEqual({ articleGone: false, emptyOrLoading: false });
});

const undoBar = (page: Page): Locator => page.locator('.asys-undo');

const doneOnTopPick = (page: Page): Locator =>
  page.locator('article.asys-top-pick').getByRole('button', { name: 'Done', exact: true });

const titles = async (page: Page): Promise<string[]> =>
  (await snapshot(page)).tasks.map((task) => task.title);

// Installs the fake clock before the page loads its timers, then loads the seeded Now.
const seedWithClock = async (page: Page): Promise<void> => {
  await seedNowTasks(page);
  await page.clock.install();
  await page.reload();
  await expect(page.locator('.asys-top-pick__title')).toHaveText('Renew the permit');
};

test('Undo brings the Task back and sends nothing', async ({ page }) => {
  skipNearMidnight(test);
  await seedWithClock(page);

  const commands: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/v1/commands')) commands.push(request.method());
  });

  await doneOnTopPick(page).click();
  await expect(page.locator('.asys-top-pick__title')).toHaveText('Plan the year');
  await expect(undoBar(page)).toBeVisible();

  await undoBar(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.asys-top-pick__title')).toHaveText('Renew the permit');
  await expect(undoBar(page)).toHaveCount(0);

  await page.clock.fastForward(5_000);
  // Nothing is awaited that could prove a request absent, so give a send time to show itself.
  await page.waitForTimeout(500);
  expect(commands).toEqual([]);
  expect(await titles(page)).toContain('Renew the permit');
});

test('Done is sent when the window ends', async ({ page }) => {
  skipNearMidnight(test);
  await seedWithClock(page);

  await doneOnTopPick(page).click();
  await expect(page.locator('.asys-top-pick__title')).toHaveText('Plan the year');
  await expect(undoBar(page)).toBeVisible();
  expect(await titles(page)).toContain('Renew the permit');

  const sent = page.waitForResponse('**/v1/commands');
  await page.clock.fastForward(5_000);
  const response = await sent;
  expect(response.status()).toBe(200);

  await expect.poll(() => titles(page)).not.toContain('Renew the permit');
});

test('Done survives an immediate reload', async ({ page }, testInfo) => {
  skipNearMidnight(test);
  // Records which page-lifecycle events fire on the reload, in the page being unloaded.
  await page.addInitScript(() => {
    const record = (name: string): void => {
      try {
        const seen = JSON.parse(sessionStorage.getItem('e2e-lifecycle') ?? '[]') as string[];
        seen.push(name);
        sessionStorage.setItem('e2e-lifecycle', JSON.stringify(seen));
      } catch {
        // Nothing to record without storage.
      }
    };
    addEventListener('pagehide', () => record('pagehide'));
    document.addEventListener('visibilitychange', () =>
      record(`visibilitychange:${document.visibilityState}`),
    );
  });
  await seedNowTasks(page);

  // The keepalive request is made while the page unloads, so listen on the context, not the page.
  const commands: string[] = [];
  page.context().on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/commands'))
      commands.push(request.url());
  });
  const seqBefore = (await snapshot(page)).seq;

  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Renew the permit');
  await doneOnTopPick(page).click();
  await expect(undoBar(page)).toBeVisible();
  await page.reload();

  // Read what the one reload produced before any second reload adds its own events and requests.
  const lifecycle = await page.evaluate(() => sessionStorage.getItem('e2e-lifecycle'));

  await expect.poll(() => titles(page)).not.toContain('Renew the permit');
  const posts = commands.length;
  // The keepalive POST and the reloaded page's snapshot may race, so the reloaded page can still show the Task.
  // Reload once more if it does.
  await expect(topPick.locator('.asys-top-pick__title')).not.toHaveText('');
  let reloadedTwice = false;
  if ((await topPick.locator('.asys-top-pick__title').innerText()) === 'Renew the permit') {
    reloadedTwice = true;
    await page.reload();
  }
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Plan the year');

  const applied = (await snapshot(page)).seq - seqBefore;
  const fact = `lifecycle events seen while reloading once: ${lifecycle}; POSTs to /v1/commands seen by Playwright after that reload: ${posts}; Commands the server applied: ${applied}; a second reload was needed: ${reloadedTwice}`;
  testInfo.annotations.push({ type: 'fact-14', description: fact });
  console.log(`fact 14: ${fact}`);
});

test('Enter on Done moves focus to Undo, and Escape to the next title', async ({ page }) => {
  skipNearMidnight(test);
  await seedNowTasks(page);

  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Renew the permit');

  await doneOnTopPick(page).focus();
  await page.keyboard.press('Enter');
  const undo = undoBar(page).getByRole('button', { name: 'Undo' });
  await expect(undo).toBeFocused();
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Plan the year');

  // Now moves focus after the card exit, so Undo must still hold it once every animation has ended. Otherwise
  // Escape would be pressed outside the bar and the focused title would not come from Escape at all. The Undo
  // ring's fill stays paused while Undo holds focus, so only running animations count.
  await expect
    .poll(() =>
      page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length),
    )
    .toBe(0);
  await expect(undo).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(topPick.locator('a.asys-top-pick__link')).toBeFocused();
});
