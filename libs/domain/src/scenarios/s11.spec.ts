// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { effectiveDue, type DateSpec, TaskStatus } from '../index';
import { AMS, aLink, aTask } from '../test/builders';

const DESIGN = 'Design card image';

const ORDER = 'Order card';

const SIGNATURE = 'Get signature';

const SEND = 'Send card';

const chain = (dueOverrides: { readonly order?: DateSpec; readonly send?: DateSpec } = {}) => {
  const tasks = [
    aTask({
      id: DESIGN,
      status: TaskStatus.Delegated,
      due: { date: '2026-10-19', time: '17:00' },
      estimateMinutes: 20,
    }),
    aTask({
      id: ORDER,
      due: dueOverrides.order ?? { date: '2026-10-22', time: '17:00' },
      estimateMinutes: 15,
    }),
    aTask({ id: SIGNATURE, due: { date: '2026-10-27', time: '17:00' }, estimateMinutes: 5 }),
    aTask({
      id: SEND,
      due: dueOverrides.send ?? { date: '2026-10-29', time: '17:00' },
      estimateMinutes: 10,
    }),
  ];
  const links = [aLink(ORDER, DESIGN), aLink(SIGNATURE, ORDER), aLink(SEND, SIGNATURE)];
  const design = tasks[0];
  if (design === undefined) {
    throw new Error('the chain has no Design card image');
  }
  return { tasks, links, design };
};

describe('S11 Employee starts at a new client', () => {
  it.todo(
    "S11.1 [stage 3] Each member of team@company.com matching a Person gets one 'Get signature' copy",
  );
  it.todo('S11.2 [stage 3] Unreadable team@company.com falls back to the Persons kept by hand');
  it.todo('S11.3 [stage 3] A colleague joining after Order card is Done gets no copy');
  it.todo(
    "S11.4 [stage 3] 'Send card' is Blocked before the copies are made and while any is Open or Delegated",
  );
  it.todo(
    'S11.5 [slice 3, stage 5] Check-in on 19 October at 09:30; not mirrored to Google Tasks while Delegated',
  );
  it.todo(
    'S11.6 [slice 3] Not yet on Monday 19 October defaults the next Check-in to Tuesday 20 October',
  );

  it("S11.7 Design card image's Effective due is the earlier of its own Due and Order card's Latest start, also transitively", () => {
    const baseline = chain();
    expect(effectiveDue(baseline.design, baseline.tasks, baseline.links, AMS)).toBe(
      Date.parse('2026-10-19T15:00:00.000Z'), // 17:00, its own Due
    );

    const orderEarly = chain({ order: { date: '2026-10-19', time: '12:00' } });
    expect(effectiveDue(orderEarly.design, orderEarly.tasks, orderEarly.links, AMS)).toBe(
      Date.parse('2026-10-19T09:45:00.000Z'), // 11:45 = 12:00 minus Order card's 15 minutes
    );

    const sendEarly = chain({ send: { date: '2026-10-19', time: '12:00' } });
    expect(effectiveDue(sendEarly.design, sendEarly.tasks, sendEarly.links, AMS)).toBe(
      Date.parse('2026-10-19T09:30:00.000Z'), // 11:30 = 12:00 minus 10, 5 and 15 minutes down the chain
    );
  });

  it.todo(
    'S11.8 [stage 2] Moving the Occasion from 2 to 4 November moves every open item two Working days later',
  );
  it.todo(
    "S11.9 [slice 2, stage 4] On a Silent train ride the Picker leaves 'Call Bram' out and shows it above the ranked list",
  );
});
