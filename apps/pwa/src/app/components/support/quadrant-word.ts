// SPDX-License-Identifier: EUPL-1.2
import { Quadrant } from '@asys/domain';

const QUADRANT_WORDS: Record<Quadrant, string> = {
  [Quadrant.Do]: 'Do',
  [Quadrant.Plan]: 'Plan',
  [Quadrant.Delegate]: 'Delegate',
  [Quadrant.Drop]: 'Drop',
};

/** The word for a Quadrant as the screens show it: Do, Plan, Delegate or Drop. */
export const quadrantWord = (quadrant: Quadrant): string => QUADRANT_WORDS[quadrant];
