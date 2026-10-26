// SPDX-License-Identifier: EUPL-1.2

import { expect, test } from './support/fixtures.ts';
import { areaId, captureTask, snapshot } from './support/seed.ts';
import { nextDate, zonedDate } from './support/time.ts';

test('Triage defers, drops and triages Inbox Tasks while the badge counts down', async ({
  page,
}) => {
  const rawText = 'Invoice 42 is due on Friday\nSee the mail from accounting';
  await captureTask(page, { title: 'Pay the invoice', captureText: rawText });
  await captureTask(page, { title: 'Book the dentist' });
  await captureTask(page, { title: 'Fix the bike' });
  // On a weekday at 10:00 Work is the Current Area, so Triage proposes it.
  const weekday = nextDate((isoWeekday) => isoWeekday <= 5);
  await page.clock.install({ time: zonedDate(weekday, '10:00') });
  await page.reload();

  const nav = page.getByRole('navigation', { name: 'Primary' });
  const badge = nav.locator('.asys-nav-item__icon > .asys-count');
  await expect(badge).toHaveText('3');
  await nav.getByRole('link', { name: /^Inbox/ }).click();

  const card = page.locator('article.asys-triage');
  const title = card.locator('.asys-triage__title');
  const progress = card.locator('.asys-triage__progress');

  await expect(title).toHaveText('Pay the invoice');
  await expect(progress).toHaveText('1 of 3');
  await expect(card.locator('.asys-triage__raw')).toHaveText(rawText);

  await card.getByRole('button', { name: 'Later' }).click();
  await expect(title).toHaveText('Book the dentist');
  await expect(card.locator('.asys-triage__raw')).toHaveCount(0);
  await expect(progress).toHaveText('1 of 3');
  await expect(badge).toHaveText('3');

  await card.locator('.asys-triage__drop').click();
  const confirm = page.getByRole('group', { name: /^Drop “/ });
  await expect(confirm).toContainText('Drop “Book the dentist”? This cannot be undone.');
  await confirm.getByRole('button', { name: 'Drop', exact: true }).click();
  await expect(badge).toHaveText('2');
  await expect(title).toHaveText('Fix the bike');
  await expect(progress).toHaveText('2 of 3');

  await expect(card.locator('.asys-triage__area strong')).toHaveText('Work');

  const triage = card.getByRole('button', { name: 'Triage', exact: true });
  await expect(triage).toBeDisabled();
  await card.getByRole('button', { name: 'Important', exact: true }).click();
  await card.getByRole('button', { name: '25 min', exact: true }).click();
  await expect(triage).toBeEnabled();
  await triage.click();
  await expect(badge).toHaveText('1');
  await expect(title).toHaveText('Pay the invoice');
  // The proposed Area reached the server, not only the card.
  const work = await areaId(page, 'Work');
  await expect
    .poll(async () => (await snapshot(page)).tasks.find((task) => task.title === 'Fix the bike'))
    .toMatchObject({ areaId: work });
  await expect(card.locator('.asys-triage__raw')).toHaveText(rawText);

  await page.reload();
  await expect(badge).toHaveText('1');

  await nav.getByRole('link', { name: 'Now' }).click();
  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Fix the bike');
  await expect(topPick.locator('.asys-top-pick__reason')).toHaveText('No Due \u00b7 important');
  await expect(topPick.locator('.asys-fact--strong .asys-num')).toHaveText('25 min');
  await expect(page.locator('a.asys-task-row')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Waiting/ })).toHaveCount(0);
  await expect(page.getByText('Book the dentist')).toHaveCount(0);
});
