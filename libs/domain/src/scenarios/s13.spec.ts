// SPDX-License-Identifier: MPL-2.0

import { describe, it } from 'vitest';

describe('S13 Calls on the drive home', () => {
  it.todo(
    "S13.1 [slice 2, slice 3] During a Voice only drive the Picker ranks only Tasks that need a Voice and keeps urgent 'Approve expense claims' off the top",
  );
  it.todo(
    'S13.2 [slice 2, slice 3] A first Check-in delegated by message needs no Voice and is listed under Not here during the drive',
  );
  it.todo(
    'S13.3 [slice 2, slice 3] Voice only picked in Now ranks the same Tasks when the drive is not in the calendar',
  );
  it.todo(
    "S13.4 [slice 2, stage 6] The Subtask 'Phone the venue' is ranked during the drive and its sibling without a Voice is not",
  );
});
