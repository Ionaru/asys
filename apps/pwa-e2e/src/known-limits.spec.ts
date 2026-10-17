// SPDX-License-Identifier: EUPL-1.2

// This test RECORDS a candidate limit. Its assertions pin what Chromium did when the test was written. When the app is
// fixed a pinned assertion flips, and its Known limits bullet is rewritten with it.
import { expect, test } from './support/fixtures.ts';

test('Clearing the hour of an Active hours From empties the whole time and shows Enter a time', async ({
  page,
}) => {
  await page.goto('/settings/areas/new');
  const monday = page.getByRole('group', { name: 'Monday' });
  await monday.getByRole('button', { name: 'Add hours' }).click();
  const from = monday.getByLabel('From');
  const before = await from.inputValue();
  console.log('Area From, before', before);
  expect(before).toBe('09:00');

  await from.focus();
  await page.keyboard.press('Backspace');

  // Pinned: the limit is confirmed. The row error shows and the minutes segment goes too (no partial input remains).
  await expect(monday.getByText('Error: Enter a time')).toBeVisible();
  await expect(from).toHaveValue('');
  expect(await from.evaluate((el) => (el as HTMLInputElement).validity.badInput)).toBe(false);
  await expect(monday.getByLabel('To')).toHaveValue('17:00');
  console.log('Area From, after: value "", error shown, To 17:00');
  await expect(page.getByRole('button', { name: /^(Create|Save)$/ })).toBeDisabled();
});
