// SPDX-License-Identifier: EUPL-1.2
import type { AnimationCallbackEvent } from '@angular/core';

import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';

/** Plays a row's height between two values; `animationComplete` is called once, also when it fails. */
const playHeight = async (
  motion: Motion,
  event: AnimationCallbackEvent,
  from: string,
  to: string,
): Promise<void> => {
  try {
    await motion.play(
      event.target as HTMLElement,
      [
        { height: from, overflow: 'clip' },
        { height: to, overflow: 'clip' },
      ],
      { duration: MotionDuration.Moderate, easing: MotionEasing.Out },
    );
  } catch {
    // Leaving or entering is decoration, so a failed animation still lets the row go on.
  } finally {
    event.animationComplete();
  }
};

/**
 * Collapses a leaving row to no height. It marks the row with `data-leaving` first, so focus lookups
 * skip it, and always calls `animationComplete`, or Angular would keep the row for 4000 ms.
 */
export const collapseRow = async (motion: Motion, event: AnimationCallbackEvent): Promise<void> => {
  const target = event.target as HTMLElement;

  target.setAttribute('data-leaving', '');

  await playHeight(motion, event, `${target.offsetHeight}px`, '0px');
};

/** Expands an entering row from no height to its own height. */
export const expandRow = async (motion: Motion, event: AnimationCallbackEvent): Promise<void> => {
  const height = (event.target as HTMLElement).offsetHeight;

  await playHeight(motion, event, '0px', `${height}px`);
};
