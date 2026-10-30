// SPDX-License-Identifier: EUPL-1.2

// Screenshots of the one-line text fields, typed into. Run: pnpm exec nx run pwa-e2e:shots -- src/text-fields.shots.ts
import type { Locator, Page } from '@playwright/test';
import { PHONE, expect, pinClock, shoot, test } from './support/screenshots.ts';
import { areaId, captureTask, seedTask } from './support/seed.ts';
import { zonedDate } from './support/time.ts';

const LONG_TITLE = 'Ring Van Dijk about the boiler service and ask for a morning slot next week';

interface Seeded {
  readonly main: string;
  readonly personal: string;
}

// A fixed Monday at 10:00, so a before and an after run show the same screens.
const seed = async (page: Page): Promise<Seeded> => {
  await pinClock(page, zonedDate('2026-10-19', '10:00'));
  const personal = await areaId(page, 'Personal');
  const main = await seedTask(page, {
    title: 'Book the boiler service',
    important: true,
    estimateMinutes: 60,
    areaId: personal,
  });
  await seedTask(page, {
    title: 'Find the boiler model number',
    important: false,
    estimateMinutes: 5,
    areaId: personal,
  });
  await captureTask(page, { title: 'Call the dentist about the crown' });
  return { main, personal };
};

const sheet = (page: Page, name: string): Locator =>
  page.getByRole('dialog', { name, exact: true });

/** Fills the field and moves the caret to the end, so a long value shows its end. */
const typeInto = async (field: Locator, text: string): Promise<void> => {
  await field.fill(text);
  await field.press('End');
};

const openEditor = async (page: Page, taskId: string): Promise<void> => {
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Book the boiler service');
};

test.describe('phone', () => {
  test.use(PHONE);

  test('the one-line text fields', async ({ page }) => {
    test.setTimeout(120_000);
    const seeded = await seed(page);

    await page.goto(`/capture?title=${encodeURIComponent(LONG_TITLE)}&text=&url=`);
    const title = page.getByLabel('Title');
    await expect(title).toHaveValue(LONG_TITLE);
    await title.focus();
    await title.press('End');
    await shoot(page, '01-capture-title', 'Share screen, Title', { group: 'Free text' });

    await openEditor(page, seeded.main);
    await page.getByRole('button', { name: /^Blocked by/ }).tap();
    const find = sheet(page, 'Blocked by').getByLabel('Find a Task');
    await typeInto(find, 'boiler');
    await expect(
      sheet(page, 'Blocked by').getByRole('button', { name: 'Find the boiler model number' }),
    ).toBeVisible();
    await shoot(page, '02-find-a-task', 'Blocked by, Find a Task', { group: 'Free text' });
    await page.keyboard.press('Escape');
    await expect(sheet(page, 'Blocked by')).toBeHidden();

    await page.getByRole('button', { name: 'Log progress', exact: true }).tap();
    const needed = sheet(page, 'Log progress').getByLabel('Time still needed');
    await expect(needed).toBeFocused();
    await typeInto(needed, '20');
    await shoot(page, '05-log-progress', 'Log progress', { group: 'Minutes' });
    await typeInto(needed, '999');
    await sheet(page, 'Log progress').getByRole('button', { name: 'Save' }).tap();
    await expect(sheet(page, 'Log progress').getByText('Use whole minutes')).toBeVisible();
    await shoot(page, '06-log-progress-error', 'Log progress, error', { group: 'Minutes' });
    await page.keyboard.press('Escape');
    await expect(sheet(page, 'Log progress')).toBeHidden();

    await page
      .getByRole('group', { name: 'Estimate' })
      .getByRole('button', { name: 'Other', exact: true })
      .tap();
    const rulerMinutes = page.getByLabel('Minutes');
    await expect(rulerMinutes).toBeFocused();
    await typeInto(rulerMinutes, '40');
    await shoot(page, '07-estimate-ruler', 'Task editor, Estimate, Other', { group: 'Minutes' });

    await page.goto('/inbox');
    const card = page.getByRole('region', { name: 'Task to triage' });
    await expect(card).toBeVisible();
    await card
      .getByRole('group', { name: 'Estimate' })
      .getByRole('button', { name: 'Other', exact: true })
      .tap();
    const cardMinutes = card.getByLabel('Minutes');
    await expect(cardMinutes).toBeFocused();
    await typeInto(cardMinutes, '40');
    await shoot(page, '08-estimate-triage', 'Triage, Estimate, Other', { group: 'Minutes' });
    await typeInto(cardMinutes, 'abc');
    await cardMinutes.blur();
    await expect(card.locator('p.asys-field__error')).toBeVisible();
    await shoot(page, '09-estimate-triage-error', 'Triage, Estimate, error', { group: 'Minutes' });

    await page.goto(`/settings/areas/${seeded.personal}`);
    const name = page.getByLabel('Name', { exact: true });
    await expect(name).toHaveValue('Personal');
    await typeInto(name, 'Personal errands, chores and everything at home');
    await shoot(page, '03-area-name', 'Area editor, Name', { group: 'Free text' });

    await page.goto('/account');
    const passkey = page.getByLabel('Name for the new passkey');
    await passkey.scrollIntoViewIfNeeded();
    await typeInto(passkey, 'Pixel in the kitchen drawer');
    await shoot(page, '04-passkey-name', 'Account, passkey name', { group: 'Free text' });
  });

  test('the recovery code, which stays a text input', async ({ browser }) => {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    await page.goto('/recover');
    const code = page.getByLabel('Recovery code');
    await typeInto(code, 'ABCD-EFGH-JKLM');
    await shoot(page, '10-recovery-code', 'Recovery code', { group: 'Unchanged' });
    await context.close();
  });
});
