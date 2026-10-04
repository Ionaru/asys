// SPDX-License-Identifier: EUPL-1.2

// These tests RECORD two candidate limits. Each assertion pins what Chromium did when the test was written. Known
// limits bullet: docs/slice-1-plan.md, Piece 6 ("DateSpecField writes '' back into a date input ..."). When the app is
// fixed a pinned assertion flips, and the bullet is rewritten with it.
import type { Locator } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import { seedTask } from './support/seed.ts';

const observe = async (due: Locator) => ({
  date: await due.getByLabel('Date').inputValue(),
  time: await due.getByLabel('Time').inputValue(),
  timeEnabled: await due.getByLabel('Time').isEnabled(),
  clearVisible: await due.getByRole('button', { name: 'Clear' }).isVisible(),
});

test('A Due date typed segment by segment from empty is kept and enables the Time input', async ({
  page,
}) => {
  const taskId = await seedTask(page, {
    title: 'Segment Task',
    important: true,
    estimateMinutes: 15,
  });
  await page.goto(`/tasks/${taskId}`);
  const due = page.getByRole('group', { name: 'Due' });
  const before = await observe(due);
  console.log('From empty, before', JSON.stringify(before));
  expect(before).toEqual({ date: '', time: '', timeEnabled: false, clearVisible: false });

  await due.getByLabel('Date').focus();
  await page.keyboard.type('05062026');

  await expect(due.getByLabel('Time')).toBeEnabled();
  const after = await observe(due);
  console.log('From empty, after', JSON.stringify(after));
  console.log(
    'Chromium read the typed digits',
    after.date === '2026-06-05' ? 'day first' : 'month first',
  );
  // Order-agnostic: day-month or month-day both give a valid date. The limit is refuted for this path.
  expect(['2026-06-05', '2026-05-06']).toContain(after.date);
  expect(after.timeEnabled).toBe(true);
  expect(after.clearVisible).toBe(true);
});

test('Editing one segment of a filled Due date empties the Due, its Time and Clear', async ({
  page,
}) => {
  const taskId = await seedTask(page, {
    title: 'Filled Task',
    important: true,
    estimateMinutes: 15,
    due: { date: '2026-06-05', time: '14:30' },
  });
  await page.goto(`/tasks/${taskId}`);
  const due = page.getByRole('group', { name: 'Due' });
  const before = await observe(due);
  console.log('Filled, before', JSON.stringify(before));
  expect(before).toEqual({
    date: '2026-06-05',
    time: '14:30',
    timeEnabled: true,
    clearVisible: true,
  });

  await due.getByLabel('Date').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Backspace');

  // Pinned: the limit is confirmed. The whole date goes, the model becomes null, Time is disabled and Clear vanishes.
  await expect(due.getByLabel('Date')).toHaveValue('');
  await expect(due.getByLabel('Time')).toBeDisabled();
  await expect(due.getByRole('button', { name: 'Clear' })).toHaveCount(0);
  const after = await observe(due);
  console.log('Filled, after', JSON.stringify(after));
  // The Time text is wiped as well: the null Due rebinds both inputs to ''.
  expect(after).toEqual({ date: '', time: '', timeEnabled: false, clearVisible: false });
});

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
