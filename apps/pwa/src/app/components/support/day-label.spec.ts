// SPDX-License-Identifier: EUPL-1.2
import { dayLabel } from './day-label';

describe('dayLabel', () => {
  const today = '2026-10-13';

  it.each([
    ['2026-10-13', 'Today'],
    ['2026-10-14', 'Tomorrow'],
    ['2026-10-12', 'Yesterday'],
    ['2026-10-19', 'Mon 19 Oct'],
  ])('labels %s as %j', (date, expected) => {
    expect(dayLabel(date, today)).toBe(expected);
  });
});
