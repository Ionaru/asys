// SPDX-License-Identifier: EUPL-1.2
import { Quadrant } from '@asys/domain';

import { quadrantWord } from './quadrant-word';

describe('quadrantWord', () => {
  it.each([
    [Quadrant.Do, 'Do'],
    [Quadrant.Plan, 'Plan'],
    [Quadrant.Delegate, 'Delegate'],
    [Quadrant.Drop, 'Drop'],
  ])('names %s as %s', (quadrant, word) => {
    expect(quadrantWord(quadrant)).toBe(word);
  });
});
