// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { isBlocked, TaskStatus } from '../index';
import { aLink, aTask } from '../test/builders';

const ENGRAVING = "Order engraving of present with baby's name";

const NAME = "Get baby's name from Lotte";

const PRESENT = "Buy present for Lotte's baby";

describe('S7 Birth leave', () => {
  it.todo(
    'S7.1 [stage 2] Moving the Occasion from 15 to 9 November moves every open anchored item once',
  );
  it.todo(
    'S7.2 [stage 1, stage 2] The Detached present keeps its Due and the Done leave check keeps its dates',
  );

  it('S7.3 Order engraving is Blocked while the name Task or the present Task is Open or Delegated', () => {
    const engraving = aTask({ id: ENGRAVING });
    const links = [aLink(ENGRAVING, NAME), aLink(ENGRAVING, PRESENT)];
    const blockedWith = (name: TaskStatus, present: TaskStatus) =>
      isBlocked(
        engraving,
        [engraving, aTask({ id: NAME, status: name }), aTask({ id: PRESENT, status: present })],
        links,
      );

    for (const status of [TaskStatus.Open, TaskStatus.Delegated] as const) {
      expect(blockedWith(status, TaskStatus.Done)).toBe(true);
      expect(blockedWith(TaskStatus.Done, status)).toBe(true);
    }
    expect(blockedWith(TaskStatus.Done, TaskStatus.Done)).toBe(false);
  });

  it.todo(
    'S7.4 [stage 3] Signature Tasks are made from all@company.com, leaving out Lotte; unmatched members raise a Review item',
  );
  it.todo('S7.5 [stage 3] The Visit has Guests, so never Hidden; moving it sends Google updates');
  it.todo(
    'S7.6 [stage 2, stage 3] Moving only the Visit moves the engraving and signature Tasks one Working day later',
  );
});
