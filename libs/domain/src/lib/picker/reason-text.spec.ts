// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { reasonText } from './reason-text';
import { Quadrant } from '../task/priority';

const AMS = 'Europe/Amsterdam';

const at = (iso: string) => Date.parse(iso);

describe('reasonText', () => {
  it('puts Overdue, the quadrant and the latest start in that order', () => {
    expect(
      reasonText(
        {
          overdue: true,
          quadrant: Quadrant.Do,
          urgent: true,
          latestStart: at('2026-10-16T07:45:00.000Z'),
        },
        AMS,
      ),
    ).toBe('Overdue · Do · start by 2026-10-16 09:45');
  });

  it('is only the quadrant label when not overdue and without a latest start', () => {
    expect(
      reasonText(
        { overdue: false, quadrant: Quadrant.Plan, urgent: false, latestStart: null },
        AMS,
      ),
    ).toBe('Plan');
  });

  it('omits the start part but keeps Overdue when latestStart is null', () => {
    expect(
      reasonText(
        { overdue: true, quadrant: Quadrant.Delegate, urgent: true, latestStart: null },
        AMS,
      ),
    ).toBe('Overdue · Delegate');
  });

  it('renders the last minute of a local day as 23:59', () => {
    expect(
      reasonText(
        {
          overdue: false,
          quadrant: Quadrant.Delegate,
          urgent: true,
          latestStart: at('2026-12-15T22:59:59.999Z'),
        },
        AMS,
      ),
    ).toBe('Delegate · start by 2026-12-15 23:59');
  });

  it('renders the latest start in the given time zone', () => {
    expect(
      reasonText(
        {
          overdue: false,
          quadrant: Quadrant.Drop,
          urgent: false,
          latestStart: at('2026-10-26T09:00:00.000Z'),
        },
        'UTC',
      ),
    ).toBe('Drop · start by 2026-10-26 09:00');
  });
});
