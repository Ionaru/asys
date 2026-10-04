// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';
import { seedTask } from './support/seed.ts';
import { addDays, dayLabel, localToday, skipNearMidnight } from './support/time.ts';

test('The Task editor saves Due and Estimate, blocks and unblocks a Task, and logs progress', async ({
  page,
}) => {
  skipNearMidnight(test);
  const alpha = await seedTask(page, {
    title: 'Alpha task',
    important: false,
    estimateMinutes: 30,
  });
  await seedTask(page, { title: 'Bravo task', important: false, estimateMinutes: 30 });
  await page.reload();

  const topPick = page.locator('article.asys-top-pick');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const row = (title: string) => page.locator('a.asys-picker-row').filter({ hasText: title });

  // Edit Due and Estimate of Alpha.
  const today = localToday().date;
  const dueDate = addDays(today, 3);
  await page.goto(`/tasks/${alpha}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha task' })).toBeVisible();
  const due = page.getByRole('group', { name: 'Due' });
  await due.getByLabel('Date').fill(dueDate);
  await due.getByLabel('Time').fill('12:00');
  await page
    .getByRole('group', { name: 'Estimate' })
    .getByRole('button', { name: '45 min', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible();

  await nav.getByRole('link', { name: 'Now' }).click();
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await expect(topPick.locator('.asys-top-pick__reason')).toHaveText(
    `Latest start ${dayLabel(dueDate, today)} 11:15`,
  );
  await expect(topPick.locator('.asys-top-pick__estimate')).toHaveText('45 min');

  // Block Alpha by Bravo.
  await topPick
    .getByRole('link', { name: 'Open' })
    .or(topPick.getByRole('button', { name: 'Open' }))
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha task' })).toBeVisible();
  await expect(due.getByLabel('Date')).toHaveValue(dueDate);
  await expect(due.getByLabel('Time')).toHaveValue('12:00');
  await page.getByRole('button', { name: 'Add a blocker' }).click();
  await page.getByRole('button', { name: 'Bravo task', exact: true }).click();
  await expect(page.locator('li.task-editor__row .task-editor__row-title')).toHaveText(
    'Bravo task',
  );
  await expect(page.getByLabel('Find a Task')).toHaveCount(0);

  await nav.getByRole('link', { name: 'Now' }).click();
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Bravo task');
  const waiting = page.getByRole('button', { name: /^Waiting/ });
  await waiting.click();
  await expect(waiting).toHaveAttribute('aria-expanded', 'true');
  await expect(row('Alpha task').locator('.asys-picker-row__reason-text')).toHaveText(
    'Blocked by Bravo task',
  );

  // Bravo's blocker picker cannot offer Alpha, which already waits for it.
  await topPick
    .getByRole('link', { name: 'Open' })
    .or(topPick.getByRole('button', { name: 'Open' }))
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bravo task' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a blocker' }).click();
  await page.getByLabel('Find a Task').fill('Alpha task');
  await expect(page.getByText('No Task matches.')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  // Done on Bravo releases Alpha.
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await expect(page.getByRole('button', { name: /^Waiting/ })).toHaveCount(0);

  // Log progress on the TopPick.
  await topPick.getByRole('button', { name: 'Log progress' }).click();
  await topPick.getByLabel('Time still needed').fill('15');
  await topPick.locator('form').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.now__status')).toHaveText('Estimate is now 15 min.');
  await expect(topPick.locator('.asys-top-pick__estimate')).toHaveText('15 min');
});
