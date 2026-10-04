// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';
import { seedTask } from './support/seed.ts';
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
  await expect(page.locator('.now__status')).toHaveText('“Renew the permit” is Done.');

  const watch = await page.evaluate(() => window.__nowWatch);
  expect(watch).toEqual({ articleGone: false, emptyOrLoading: false });
});
