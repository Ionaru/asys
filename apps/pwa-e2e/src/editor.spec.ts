// SPDX-License-Identifier: EUPL-1.2

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { seedTask, snapshot } from './support/seed.ts';
import { addDays, dayLabel, localToday, skipNearMidnight } from './support/time.ts';

const topPick = (page: Page): Locator => page.locator('article.asys-top-pick');

const editorTitle = (page: Page): Locator => page.getByRole('textbox', { name: 'Title' });

const saved = (page: Page): Locator => page.getByRole('status').filter({ hasText: 'Saved' });

const sheet = (page: Page, name: string): Locator =>
  page.getByRole('dialog', { name, exact: true });

// The Due row, not the button beside it that sets the time ('Due at 12:00, change time').
const dueRow = (page: Page): Locator => page.getByRole('button', { name: /^Due (?!at )/ });

const areaRow = (page: Page): Locator => page.getByRole('button', { name: /^Area/ });

interface SentCommand {
  readonly tag: string;
  readonly patch: Record<string, unknown>;
  readonly status: number;
}

// The Commands the page sends from now on. A Done removes the Task from the snapshot, so the server's side of an
// edit saved before it is read off the EditTask that carried it.
const recordCommands = (page: Page): SentCommand[] => {
  const sent: SentCommand[] = [];
  page.on('response', (response) => {
    const request = response.request();
    if (request.method() !== 'POST' || !response.url().endsWith('/v1/commands')) return;
    const body = request.postDataJSON() as { _tag: string; patch?: Record<string, unknown> };
    sent.push({ tag: body._tag, patch: body.patch ?? {}, status: response.status() });
  });
  return sent;
};

const openFromNow = async (page: Page): Promise<void> => {
  await topPick(page).locator('a.asys-top-pick__link').click();
  await expect(editorTitle(page)).toBeVisible();
};

test('The editor has no bottom nav, and Back returns to Now', async ({ page }) => {
  const taskId = await seedTask(page, {
    title: 'Alpha task',
    important: false,
    estimateMinutes: 30,
  });
  await page.reload();
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();

  // From Now, Back goes back in history.
  await openFromNow(page);
  await expect(page).toHaveURL(new RegExp(`/tasks/${taskId}$`));
  await expect(nav).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  await expect(nav).toBeVisible();

  // On a fresh load there is no history to go back to, so Back goes to Now.
  await page.goto(`/tasks/${taskId}`);
  await expect(editorTitle(page)).toHaveValue('Alpha task');
  await expect(nav).toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  await expect(nav).toBeVisible();
});

test('Due, its time and the Estimate are saved and change the Now reason', async ({ page }) => {
  skipNearMidnight(test);
  await seedTask(page, { title: 'Alpha task', important: false, estimateMinutes: 30 });
  await page.reload();

  const today = localToday().date;
  const dueDate = addDays(today, 3);
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await openFromNow(page);

  await dueRow(page).click();
  const dueSheet = sheet(page, 'Due');
  await expect(dueSheet).toBeVisible();
  await dueSheet
    .getByRole('group', { name: /^Days from/ })
    .getByRole('button', { name: dayLabel(dueDate, today), exact: true })
    .click();
  await expect(dueSheet).toBeHidden();
  await expect(dueRow(page)).toContainText(dayLabel(dueDate, today));

  await page.getByRole('button', { name: 'Add a time to Due' }).click();
  await sheet(page, 'Time').getByRole('button', { name: '12:00', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Due at 12:00, change time' })).toBeVisible();

  await page
    .getByRole('group', { name: 'Estimate' })
    .getByRole('button', { name: '45 min', exact: true })
    .click();
  await expect(saved(page)).toBeVisible();

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await expect(topPick(page).locator('.asys-top-pick__reason')).toHaveText(
    `Latest start ${dayLabel(dueDate, today)} 11:15`,
  );
  await expect(topPick(page).locator('.asys-fact--strong .asys-num')).toHaveText('45 min');

  // The saved Due and Estimate are what the editor shows when it is opened again.
  await openFromNow(page);
  await expect(dueRow(page)).toContainText(dayLabel(dueDate, today));
  await expect(page.getByRole('button', { name: 'Due at 12:00, change time' })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Estimate' }).getByRole('button', { name: '45 min' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

// The one-line fields are textareas, which keep Chrome's autofill bar off the Android keyboard, so they handle Enter
// themselves and must leave Escape to the sheet.
test('Enter saves Other minutes, and Escape in a text field closes its sheet', async ({ page }) => {
  const taskId = await seedTask(page, {
    title: 'Alpha task',
    important: false,
    estimateMinutes: 30,
  });
  await page.goto(`/tasks/${taskId}`);
  await expect(editorTitle(page)).toHaveValue('Alpha task');

  await page
    .getByRole('group', { name: 'Estimate' })
    .getByRole('button', { name: 'Other', exact: true })
    .click();
  const minutes = page.getByLabel('Minutes');
  await minutes.fill('40');
  await minutes.press('Enter');
  await expect(saved(page)).toBeVisible();
  await expect(minutes).toHaveValue('40');
  await expect(minutes).toBeFocused();

  await page.getByRole('button', { name: /^Blocked by/ }).click();
  const find = sheet(page, 'Blocked by').getByLabel('Find a Task');
  await find.fill('Nothing like this');
  await expect(find).toHaveValue('Nothing like this');
  await find.press('Escape');
  await expect(sheet(page, 'Blocked by')).toBeHidden();

  await page.reload();
  await expect(page.getByLabel('Minutes')).toHaveValue('40');
});

test('A new Title is saved when the field loses focus', async ({ page }) => {
  const taskId = await seedTask(page, {
    title: 'Alpha task',
    important: false,
    estimateMinutes: 30,
  });
  await page.reload();
  await openFromNow(page);

  await editorTitle(page).fill('Alpha task renamed');
  await editorTitle(page).press('Tab');
  await expect(saved(page)).toBeVisible();
  await expect(page.locator('h1.task-editor__heading')).toHaveText('Alpha task renamed');

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Alpha task renamed');
  await expect
    .poll(async () => (await snapshot(page)).tasks.find((task) => task.id === taskId)?.title)
    .toBe('Alpha task renamed');
});

test('One tap on Done after typing Notes leaves and saves the Notes', async ({ page }) => {
  skipNearMidnight(test);
  await seedTask(page, { title: 'Alpha task', important: false, estimateMinutes: 30 });
  await page.clock.install();
  await page.reload();
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await openFromNow(page);
  const sent = recordCommands(page);

  await page.getByRole('button', { name: 'Add notes' }).click();
  await page.getByRole('textbox', { name: 'Notes' }).fill('Ring the supplier first');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);

  // The Done itself is held for the Undo window; the Notes are saved before it.
  await page.clock.fastForward(5_000);
  await expect
    .poll(() => sent.map((command) => [command.tag, command.patch['notes'], command.status]))
    .toEqual(
      expect.arrayContaining([
        ['EditTask', 'Ring the supplier first', 200],
        ['CompleteTask', undefined, 200],
      ]),
    );
});

test('One tap on Done right after a tap on Important saves the Importance', async ({ page }) => {
  skipNearMidnight(test);
  await seedTask(page, { title: 'Alpha task', important: false, estimateMinutes: 30 });
  await page.clock.install();
  await page.reload();
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await openFromNow(page);
  const sent = recordCommands(page);

  await page.getByRole('button', { name: 'Important', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);

  await page.clock.fastForward(5_000);
  await expect
    .poll(() => sent.map((command) => [command.tag, command.patch['important'], command.status]))
    .toEqual(
      expect.arrayContaining([
        ['EditTask', true, 200],
        ['CompleteTask', undefined, 200],
      ]),
    );
});

test('The editor blocks and unblocks a Task through the Blocked by sheet', async ({ page }) => {
  await seedTask(page, { title: 'Alpha task', important: false, estimateMinutes: 30 });
  await seedTask(page, { title: 'Bravo task', important: false, estimateMinutes: 30 });
  await page.reload();

  const row = (title: string) => page.locator('a.asys-picker-row').filter({ hasText: title });

  // Block Alpha by Bravo.
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await openFromNow(page);
  await page.getByRole('button', { name: /^Blocked by/ }).click();
  const blockers = sheet(page, 'Blocked by');
  await expect(blockers).toBeVisible();
  await blockers.getByRole('button', { name: 'Bravo task', exact: true }).click();
  // The sheet stays open, and Waits for now lists Bravo.
  await expect(blockers).toBeVisible();
  const waitsFor = blockers.locator('li.task-blockers__row');
  await expect(waitsFor).toHaveCount(1);
  await expect(waitsFor).toContainText('Bravo task');
  await expect(waitsFor.getByRole('button', { name: 'Remove' })).toBeVisible();

  await blockers.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(blockers).toBeHidden();

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Bravo task');
  const waiting = page.getByRole('button', { name: /^Waiting/ });
  await waiting.click();
  await expect(waiting).toHaveAttribute('aria-expanded', 'true');
  await expect(row('Alpha task').locator('.asys-picker-row__reason-text')).toHaveText(
    'Blocked by Bravo task',
  );

  // Bravo's blocker picker cannot offer Alpha, which already waits for it.
  await openFromNow(page);
  await expect(editorTitle(page)).toHaveValue('Bravo task');
  await page.getByRole('button', { name: /^Blocked by/ }).click();
  const bravoBlockers = sheet(page, 'Blocked by');
  await bravoBlockers.getByLabel('Find a Task').fill('Alpha task');
  await expect(bravoBlockers.getByText('No Task matches.')).toBeVisible();
  await expect(bravoBlockers.getByRole('button', { name: 'Alpha task', exact: true })).toHaveCount(
    0,
  );
  await bravoBlockers.getByRole('button', { name: 'Close', exact: true }).click();

  // Done on Bravo releases Alpha.
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await expect(page.getByRole('button', { name: /^Waiting/ })).toHaveCount(0);
});

test('Drop in the More sheet removes the Task from Now', async ({ page }) => {
  await seedTask(page, { title: 'Alpha task', important: false, estimateMinutes: 30 });
  await seedTask(page, { title: 'Bravo task', important: false, estimateMinutes: 30 });
  await page.reload();
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Alpha task');
  await openFromNow(page);

  await page.getByRole('button', { name: 'More actions' }).click();
  const more = sheet(page, 'More');
  await more.getByRole('button', { name: 'Drop', exact: true }).click();
  await more
    .getByRole('group', { name: /^Drop “/ })
    .getByRole('button', { name: 'Drop' })
    .click();

  await expect(page).toHaveURL(/\/now$/);
  await expect(topPick(page).locator('.asys-top-pick__title')).toHaveText('Bravo task');
  await expect(page.getByText('Alpha task')).toHaveCount(0);
});

test('A sheet closes with Escape or a tap on the backdrop and returns focus to its row', async ({
  page,
}) => {
  const taskId = await seedTask(page, {
    title: 'Alpha task',
    important: false,
    estimateMinutes: 30,
  });
  await page.goto(`/tasks/${taskId}`);
  await expect(editorTitle(page)).toHaveValue('Alpha task');

  await dueRow(page).click();
  await expect(sheet(page, 'Due')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet(page, 'Due')).toBeHidden();
  await expect(dueRow(page)).toBeFocused();

  await areaRow(page).click();
  await expect(sheet(page, 'Area')).toBeVisible();
  // The sheet sits at the bottom, so the top-left corner is the backdrop.
  await page.mouse.click(5, 5);
  await expect(sheet(page, 'Area')).toBeHidden();
  await expect(areaRow(page)).toBeFocused();
});

test('Log progress on the TopPick and in the editor lowers the Estimate', async ({ page }) => {
  await seedTask(page, { title: 'Alpha task', important: false, estimateMinutes: 30 });
  await page.reload();

  // Log progress on the TopPick.
  await topPick(page).getByRole('button', { name: 'Log progress' }).click();
  await topPick(page).getByLabel('Time still needed').fill('20');
  await topPick(page).locator('form').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.now__status')).toHaveText('Estimate is now 20 min.');
  await expect(topPick(page).locator('.asys-fact--strong .asys-num')).toHaveText('20 min');

  // Log progress in the editor.
  await openFromNow(page);
  await page.getByRole('button', { name: 'Log progress', exact: true }).click();
  const log = sheet(page, 'Log progress');
  await log.getByLabel('Time still needed').fill('15');
  await log.getByLabel('Time still needed').press('Enter');
  await expect(log).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: 'Estimate is now 15 min.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/now$/);
  await expect(topPick(page).locator('.asys-fact--strong .asys-num')).toHaveText('15 min');
});
