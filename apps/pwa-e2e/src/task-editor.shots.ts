// SPDX-License-Identifier: EUPL-1.2

// Screenshots of the Task editor and its sheets. Run: pnpm exec nx run pwa-e2e:shots -- src/task-editor.shots.ts
import type { Locator, Page } from '@playwright/test';
import {
  DESKTOP,
  PHONE,
  blurActive,
  expect,
  pinClock,
  scrollTo,
  shoot,
  shootEnds,
  test,
} from './support/screenshots.ts';
import { addBlocker, areaId, captureTask, editTask, seedTask, triageTask } from './support/seed.ts';
import { addDays } from './support/time.ts';

interface Seeded {
  readonly main: string;
  readonly overdue: string;
  readonly inbox: string;
}

const editorTitle = (page: Page): Locator => page.getByRole('textbox', { name: 'Title' });

const sheet = (page: Page, name: string): Locator =>
  page.getByRole('dialog', { name, exact: true });

const dueRow = (page: Page): Locator => page.getByRole('button', { name: /^Due (?!at )/ });

const areaRow = (page: Page): Locator => page.getByRole('button', { name: /^Area/ });

// The pinned clock is a weekday at 10:00, so Work is the Current Area and its palette is Evergreen.
const seed = async (page: Page): Promise<Seeded> => {
  const today = await pinClock(page);
  const personal = await areaId(page, 'Personal');
  const work = await areaId(page, 'Work');

  const main = await captureTask(page, {
    title: 'Book the boiler service',
    captureText: 'boiler service before winter, ring Van Dijk',
    areaId: personal,
  });
  await triageTask(page, main, { important: true, estimateMinutes: 25, areaId: personal });
  await editTask(page, main, {
    notes: 'Ask for a morning slot. The gate code is on the last invoice.',
    availableFrom: { date: today },
    due: { date: addDays(today, 4), time: '17:00' },
  });
  await seedTask(page, {
    title: 'Find the boiler model number',
    important: false,
    estimateMinutes: 5,
    areaId: personal,
  });
  const radiators = await seedTask(page, {
    title: 'Bleed the radiators',
    important: false,
    estimateMinutes: 25,
    areaId: personal,
  });
  await addBlocker(page, radiators, main);
  const overdue = await seedTask(page, {
    title: 'Renew the parking permit',
    important: true,
    estimateMinutes: 15,
    areaId: personal,
    due: { date: addDays(today, -1), time: '09:00' },
  });
  await seedTask(page, {
    title: 'Send the quarterly report',
    important: true,
    estimateMinutes: 120,
    areaId: work,
  });
  const inbox = await captureTask(page, {
    title: 'Call the dentist about the crown',
    captureText: 'dentist, crown feels loose again',
  });
  // The next `goto` loads the seeded data.
  return { main, overdue, inbox };
};

const openEditor = async (page: Page, taskId: string, title: string): Promise<void> => {
  await page.goto(`/tasks/${taskId}`);
  await expect(editorTitle(page)).toHaveValue(title);
};

const closeSheet = async (page: Page, name: string): Promise<void> => {
  await page.keyboard.press('Escape');
  await expect(sheet(page, name)).toBeHidden();
  await blurActive(page);
};

// Seeded values show as picked. A pick closes its sheet, so a state picked during the test is shot on a second open.
const shootSheet = async (
  page: Page,
  opener: Locator,
  name: string,
  shot: string,
): Promise<void> => {
  await opener.tap();
  await expect(sheet(page, name)).toBeVisible();
  await shoot(page, shot, name, { group: 'Sheets' });
  await closeSheet(page, name);
};

test.describe('phone', () => {
  test.use(PHONE);

  test('the Task editor and its sheets', async ({ page }) => {
    test.setTimeout(120_000);
    const seeded = await seed(page);

    await openEditor(page, seeded.main, 'Book the boiler service');
    await page
      .getByRole('group', { name: 'Estimate' })
      .getByRole('button', { name: '45 min', exact: true })
      .tap();
    // Saved shows only after an Applied edit.
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    await blurActive(page);
    await shootEnds(page, '01-card', 'Card', { group: 'The card' });

    await shootSheet(page, areaRow(page), 'Area', '03-area-sheet');
    await shootSheet(page, dueRow(page), 'Due', '04-due-sheet');
    const time = page.getByRole('button', { name: 'Due at 17:00, change time' });
    await shootSheet(page, time, 'Time', '05-time-sheet');

    // The sheet focuses its field once open, so wait for that before shooting.
    await page.getByRole('button', { name: 'Log progress', exact: true }).tap();
    await expect(sheet(page, 'Log progress').getByLabel('Time still needed')).toBeFocused();
    await shoot(page, '06-log-progress-sheet', 'Log progress', { group: 'Sheets' });
    await closeSheet(page, 'Log progress');

    await page.getByRole('button', { name: 'More actions' }).tap();
    const more = sheet(page, 'More');
    await expect(more).toBeVisible();
    await shoot(page, '07-more-sheet', 'More', { group: 'Sheets' });
    await more.getByRole('button', { name: 'Drop', exact: true }).tap();
    const confirm = more.getByRole('group', { name: /^Drop “/ });
    // After a tap, a focused Cancel shows no focus ring, which is true to a phone.
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await shoot(page, '08-more-sheet-drop', 'Drop, confirming', { group: 'Sheets' });
    await confirm.getByRole('button', { name: 'Cancel' }).tap();
    await closeSheet(page, 'More');

    await page.getByRole('button', { name: /^Blocked by/ }).tap();
    const blockers = sheet(page, 'Blocked by');
    await expect(blockers).toBeVisible();
    await blockers.getByRole('button', { name: 'Find the boiler model number', exact: true }).tap();
    await expect(blockers.locator('li.task-blockers__row')).toHaveCount(1);
    await blurActive(page);
    await shoot(page, '09-blocked-by-sheet', 'Blocked by', { group: 'Blocked by' });
    await closeSheet(page, 'Blocked by');

    await expect(page.getByRole('button', { name: /^Blocked by Waits for Find/ })).toBeVisible();
    await blurActive(page);
    await scrollTo(page, 'end');
    await shoot(page, '10-card-blocked-end', 'Blocked, end', { group: 'Blocked by' });
    await scrollTo(page, 'top');

    await editorTitle(page).fill('');
    await editorTitle(page).blur();
    // The error's text is "Error: Needs a title" (a visually hidden prefix), so match by substring.
    await expect(page.getByText('Needs a title')).toBeVisible();
    await shoot(page, '02-card-empty-title', 'Empty Title', { group: 'The card' });

    await openEditor(page, seeded.overdue, 'Renew the parking permit');
    await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
    await scrollTo(page, 'end');
    await shoot(page, '11-card-overdue-end', 'Overdue, end', { group: 'Other states' });

    await openEditor(page, seeded.inbox, 'Call the dentist about the crown');
    await expect(page.getByText('In the Inbox until Triage')).toBeVisible();
    await shootEnds(page, '12-card-inbox', 'Inbox', { group: 'Other states' });
  });
});

test.describe('desktop', () => {
  test.use(DESKTOP);

  test('the Task editor on a wide screen', async ({ page }) => {
    const seeded = await seed(page);
    await openEditor(page, seeded.main, 'Book the boiler service');
    await expect(dueRow(page)).toBeVisible();
    await shoot(page, '13-desktop-card', 'Card at 1280 px', { group: 'Desktop' });
    await dueRow(page).click();
    await expect(sheet(page, 'Due')).toBeVisible();
    await page.mouse.move(0, 0);
    await shoot(page, '14-desktop-due-sheet', 'Due sheet at 1280 px', { group: 'Desktop' });
  });
});
