// SPDX-License-Identifier: EUPL-1.2

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { areaId, captureTask, snapshot } from './support/seed.ts';
import { addDays, dayLabel, nextDate, zonedDate } from './support/time.ts';

const RAW_TEXT = 'Invoice 42 is due on Friday\nSee the mail from accounting';

const card = (page: Page): Locator => page.getByRole('region', { name: 'Task to triage' });

const titleField = (page: Page): Locator => card(page).getByRole('textbox', { name: 'Title' });

const actionBar = (page: Page): Locator => page.locator('footer.inbox__actions');

const dropButton = (page: Page): Locator =>
  actionBar(page).getByRole('button', { name: 'Drop', exact: true });

const triageButton = (page: Page): Locator =>
  actionBar(page).getByRole('button', { name: /^Triage/ });

const undoBar = (page: Page): Locator => page.locator('.shell__undo');

const badge = (page: Page): Locator =>
  page.getByRole('navigation', { name: 'Primary' }).locator('.asys-nav-item__icon > .asys-count');

const sheet = (page: Page, name: string): Locator =>
  page.getByRole('dialog', { name, exact: true });

const taskByTitle = async (page: Page, title: string) =>
  (await snapshot(page)).tasks.find((task) => task.title === title);

/** Installs the fake clock on a weekday at 10:00, when Work is the Current Area, and opens the Inbox. */
const openInbox = async (page: Page): Promise<string> => {
  // On a weekday at 10:00 Work is the Current Area, so Triage proposes it.
  const weekday = nextDate((isoWeekday) => isoWeekday <= 5);
  await page.clock.install({ time: zonedDate(weekday, '10:00') });
  await page.reload();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: /^Inbox/ })
    .click();
  await expect(card(page)).toBeVisible();
  return weekday;
};

/** Lets the Undo window end and returns the command that carried what was held. */
const endUndoWindow = async (page: Page): Promise<Record<string, unknown>> => {
  // The Undo bar rises where the pointer just clicked, and a pointer inside it pauses the window.
  await page.mouse.move(0, 0);
  const sent = page.waitForResponse('**/v1/commands');
  await page.clock.fastForward(5_000);
  const response = await sent;
  expect(response.status()).toBe(200);
  return response.request().postDataJSON() as Record<string, unknown>;
};

test('Triage counts through a visit, refuses an unfinished card, and Undo brings a dropped card back', async ({
  page,
}) => {
  await captureTask(page, { title: 'Pay the invoice', captureText: RAW_TEXT });
  await captureTask(page, { title: 'Book the dentist' });
  await captureTask(page, { title: 'Fix the bike' });
  await openInbox(page);

  const commands: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/commands')) {
      commands.push(request.url());
    }
  });
  const progress = card(page).locator('.asys-triage__head .asys-triage__progress');

  await expect(badge(page)).toHaveText('3');
  await expect(progress).toHaveText('1 of 3');
  await expect(titleField(page)).toHaveValue('Pay the invoice');
  await expect(card(page).locator('.asys-triage__captured-text')).toHaveText(RAW_TEXT);

  // Importance and Estimate both say Needed, and a refused Triage turns the markers and the hint red.
  const needed = card(page).locator('.asys-label__need');
  const hint = card(page).locator('p.asys-triage__hint[role="status"]');
  await expect(needed).toHaveCount(2);
  await expect(needed).toHaveText(['Needed', 'Needed']);
  await expect(card(page).locator('.asys-label__need--missing')).toHaveCount(0);
  await expect(hint).toHaveText('Pick an Importance and an Estimate to triage.');
  await expect(hint).not.toHaveClass(/asys-triage__hint--missing/);

  await triageButton(page).click();
  await expect(card(page).locator('.asys-label__need--missing')).toHaveCount(2);
  await expect(hint).toHaveClass(/asys-triage__hint--missing/);
  await page.waitForTimeout(500);
  await expect(badge(page)).toHaveText('3');
  await expect(progress).toHaveText('1 of 3');
  await expect(titleField(page)).toHaveValue('Pay the invoice');
  await expect(undoBar(page)).toHaveCount(0);
  expect(commands).toEqual([]);

  // A Drop moves to the next card at once and drops the badge, and Undo brings the first card back.
  await dropButton(page).click();
  await expect(titleField(page)).toHaveValue('Book the dentist');
  await expect(card(page).locator('.asys-triage__captured-text')).toHaveCount(0);
  await expect(progress).toHaveText('2 of 3');
  await expect(badge(page)).toHaveText('2');
  await expect(undoBar(page)).toContainText('Dropped');
  await expect(undoBar(page)).toContainText('Pay the invoice');
  // A card that has no Importance and Estimate yet is back to its calm state.
  await expect(card(page).locator('.asys-label__need--missing')).toHaveCount(0);

  await undoBar(page).getByRole('button', { name: 'Undo Drop: Pay the invoice' }).click();
  await expect(undoBar(page)).toHaveCount(0);
  await expect(titleField(page)).toHaveValue('Pay the invoice');
  await expect(progress).toHaveText('1 of 3');
  await expect(badge(page)).toHaveText('3');
  await expect(card(page)).toBeFocused();
  await expect(card(page).locator('.asys-triage__captured-text')).toHaveText(RAW_TEXT);

  // Undo sent nothing, and the window ending afterwards sends nothing either.
  await page.clock.fastForward(5_000);
  await page.waitForTimeout(500);
  expect(commands).toEqual([]);
  expect((await snapshot(page)).tasks.map((task) => task.title)).toContain('Pay the invoice');
});

test('Triage carries the card edits, names the edited Title in the Undo bar and reaches the server and Now', async ({
  page,
}) => {
  const invoice = await captureTask(page, { title: 'Pay the invoice', captureText: RAW_TEXT });
  await captureTask(page, { title: 'Book the dentist' });
  const weekday = await openInbox(page);
  const dueDate = addDays(weekday, 3);

  await expect(titleField(page)).toHaveValue('Pay the invoice');
  await titleField(page).fill('Pay the Acme invoice');

  const triage = triageButton(page);
  await expect(triage).toHaveText('Triage');
  const group = (name: string): Locator => card(page).getByRole('group', { name });
  await group('Importance').getByRole('button', { name: 'Important', exact: true }).click();
  await group('Estimate').getByRole('button', { name: '25 min', exact: true }).click();

  await card(page)
    .getByRole('button', { name: /^Due (?!at )/ })
    .click();
  const dueSheet = sheet(page, 'Due');
  await expect(dueSheet).toBeVisible();
  await dueSheet
    .getByRole('group', { name: /^Days from/ })
    .getByRole('button', { name: dayLabel(dueDate, weekday), exact: true })
    .click();
  await expect(dueSheet).toBeHidden();
  await card(page).getByRole('button', { name: 'Add a time to Due' }).click();
  await sheet(page, 'Time').getByRole('button', { name: '17:00', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Due at 17:00, change time' })).toBeVisible();

  // The reason line replaces the hint, and the action bar names the Quadrant.
  const reason = card(page).locator('.asys-triage__reason');
  await expect(reason).toBeVisible();
  await expect(card(page).locator('.asys-triage__hint')).toHaveCount(0);
  await expect(card(page).locator('.asys-label__need--missing')).toHaveCount(0);
  await expect(triage).toHaveText(/^\s*Triage as \w+\s*$/);
  const quadrant = (await triage.innerText()).trim().replace(/^Triage as /, '');

  await triage.click();
  await expect(undoBar(page)).toContainText(`Triaged as ${quadrant}`);
  await expect(undoBar(page)).toContainText('Pay the Acme invoice');
  await expect(
    undoBar(page).getByRole('button', { name: 'Undo Triage: Pay the Acme invoice' }),
  ).toBeVisible();
  await expect(titleField(page)).toHaveValue('Book the dentist');
  await expect(badge(page)).toHaveText('1');
  expect(await taskByTitle(page, 'Pay the Acme invoice')).toBeUndefined();

  // Undo brings the card back with the edits, and Triage holds it again.
  await undoBar(page).getByRole('button', { name: 'Undo Triage: Pay the Acme invoice' }).click();
  await expect(titleField(page)).toHaveValue('Pay the Acme invoice');
  await expect(badge(page)).toHaveText('2');
  await expect(card(page).getByRole('button', { name: 'Due at 17:00, change time' })).toBeVisible();
  await expect(
    group('Importance').getByRole('button', { name: 'Important', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    group('Estimate').getByRole('button', { name: '25 min', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(card(page).locator('.asys-triage__captured-text')).toHaveText(RAW_TEXT);
  await triage.click();
  await expect(undoBar(page)).toContainText('Pay the Acme invoice');

  expect(await endUndoWindow(page)).toMatchObject({
    _tag: 'TriageTask',
    taskId: invoice,
    title: 'Pay the Acme invoice',
    important: true,
    estimateMinutes: 25,
  });
  const work = await areaId(page, 'Work');
  // The edited Title, the Due, the answers and the proposed Area all reached the server.
  await expect
    .poll(() => taskByTitle(page, 'Pay the Acme invoice'))
    .toMatchObject({
      title: 'Pay the Acme invoice',
      important: true,
      estimateMinutes: 25,
      areaId: work,
      due: { date: dueDate, time: '17:00' },
    });
  expect(await taskByTitle(page, 'Pay the invoice')).toBeUndefined();

  await page.reload();
  await expect(badge(page)).toHaveText('1');
  await expect(titleField(page)).toHaveValue('Book the dentist');

  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Now' })
    .click();
  const topPick = page.locator('article.asys-top-pick');
  await expect(topPick.locator('.asys-top-pick__title')).toHaveText('Pay the Acme invoice');
  await expect(topPick.locator('.asys-fact--strong .asys-num')).toHaveText('25 min');
  await expect(page.locator('a.asys-task-row')).toHaveCount(0);
  await expect(page.getByText('Book the dentist')).toHaveCount(0);
});

test('A Drop reaches the server as Dropped after the window, and the empty card counts the Tasks', async ({
  page,
}) => {
  const dentist = await captureTask(page, { title: 'Book the dentist' });
  const bike = await captureTask(page, { title: 'Fix the bike' });
  await openInbox(page);

  await dropButton(page).click();
  await expect(undoBar(page)).toContainText('Dropped');
  await expect(undoBar(page)).toContainText('Book the dentist');
  await expect(titleField(page)).toHaveValue('Fix the bike');
  await expect(badge(page)).toHaveText('1');
  expect(await taskByTitle(page, 'Book the dentist')).toMatchObject({ status: 'open' });

  expect(await endUndoWindow(page)).toMatchObject({ _tag: 'DropTask', taskId: dentist });
  await expect.poll(() => taskByTitle(page, 'Book the dentist')).toBeUndefined();
  await expect(undoBar(page)).toHaveCount(0);

  await dropButton(page).click();
  const empty = page.locator('section.inbox__empty');
  await expect(empty).toContainText('Inbox is empty');
  await expect(empty.locator('.inbox__progress')).toHaveText('2 of 2 triaged');
  await expect(card(page)).toHaveCount(0);
  await expect(actionBar(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);

  expect(await endUndoWindow(page)).toMatchObject({ _tag: 'DropTask', taskId: bike });
  await expect.poll(() => taskByTitle(page, 'Fix the bike')).toBeUndefined();
});

test('More opens Blocked by and gives focus back, and Open in the editor saves the card edits first', async ({
  page,
}) => {
  const taskId = await captureTask(page, { title: 'Pay the invoice' });
  await captureTask(page, { title: 'Book the dentist' });
  await openInbox(page);

  const more = card(page).getByRole('button', { name: 'More for this Task' });
  await more.click();
  await expect(sheet(page, 'More')).toBeVisible();
  await sheet(page, 'More').getByRole('button', { name: 'Blocked by' }).click();
  await expect(sheet(page, 'Blocked by')).toBeVisible();
  await expect(sheet(page, 'More')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'Blocked by')).toBeHidden();
  await expect(more).toBeFocused();

  await titleField(page).fill('Pay the Acme invoice');
  await more.click();
  await sheet(page, 'More').getByRole('button', { name: 'Open in the editor' }).click();
  await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}$`));
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Pay the Acme invoice');
  await expect.poll(async () => (await taskByTitle(page, 'Pay the Acme invoice'))?.id).toBe(taskId);
});
