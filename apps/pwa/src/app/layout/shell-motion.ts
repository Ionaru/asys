// SPDX-License-Identifier: EUPL-1.2
import type { AnimationCallbackEvent } from '@angular/core';

import { Motion, MotionDuration, MotionEasing } from '../core/platform/motion';

/**
 * Fades a leaving node out through `Motion.leave`, which marks it with `data-leaving` first, so view
 * transitions never see two `shell-capture` elements, and calls `animationComplete` once.
 */
export const leaveMarked = (motion: Motion, event: AnimationCallbackEvent): Promise<void> =>
  motion.leave(event, [{ opacity: 1 }, { opacity: 0 }], {
    duration: MotionDuration.Quick,
    easing: MotionEasing.Out,
  });
