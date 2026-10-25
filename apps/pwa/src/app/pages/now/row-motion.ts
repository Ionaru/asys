// SPDX-License-Identifier: EUPL-1.2
import type { AnimationCallbackEvent } from '@angular/core';

import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';

/**
 * Collapses a leaving row to no height through `Motion.leave`, which marks the row with `data-leaving`
 * first, so focus lookups skip it, and always calls `animationComplete`, or Angular would keep the row
 * for 4000 ms.
 */
export const collapseRow = (motion: Motion, event: AnimationCallbackEvent): Promise<void> => {
  const height = (event.target as HTMLElement).offsetHeight;

  return motion.leave(
    event,
    [
      { height: `${height}px`, overflow: 'clip' },
      { height: '0px', overflow: 'clip' },
    ],
    { duration: MotionDuration.Moderate, easing: MotionEasing.Out },
  );
};

/** Expands an entering row from no height to its own height; `animationComplete` is called once. */
export const expandRow = async (motion: Motion, event: AnimationCallbackEvent): Promise<void> => {
  const height = (event.target as HTMLElement).offsetHeight;

  try {
    await motion.play(
      event.target,
      [
        { height: '0px', overflow: 'clip' },
        { height: `${height}px`, overflow: 'clip' },
      ],
      { duration: MotionDuration.Moderate, easing: MotionEasing.Out },
    );
  } finally {
    event.animationComplete();
  }
};
