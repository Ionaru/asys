// SPDX-License-Identifier: EUPL-1.2
import type { AnimationCallbackEvent } from '@angular/core';

import { Motion, MotionDuration, MotionEasing } from '../core/platform/motion';

/**
 * Fades a leaving node out and marks it with `data-leaving` first, so view transitions never see two
 * `shell-capture` elements. `animationComplete` is called once, also when the animation fails.
 */
export const leaveMarked = async (motion: Motion, event: AnimationCallbackEvent): Promise<void> => {
  const target = event.target as HTMLElement;

  target.setAttribute('data-leaving', '');

  try {
    await motion.play(target, [{ opacity: 1 }, { opacity: 0 }], {
      duration: MotionDuration.Quick,
      easing: MotionEasing.Out,
    });
  } catch {
    // Leaving is decoration, so a failed animation still lets the node go.
  } finally {
    event.animationComplete();
  }
};
