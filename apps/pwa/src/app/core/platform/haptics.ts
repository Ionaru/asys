// SPDX-License-Identifier: EUPL-1.2
import { Service } from '@angular/core';

/** Length of the confirming tick, in milliseconds. */
export const HAPTIC_TICK_MS = 15;

/** A guarded `navigator.vibrate`; does nothing where the device or browser cannot vibrate. */
@Service()
export class Haptics {
  /** A short tick that confirms a gesture. It ignores reduced motion on purpose, as a tick is not movement. */
  tick(): void {
    if (typeof navigator.vibrate !== 'function') {
      return;
    }

    try {
      navigator.vibrate(HAPTIC_TICK_MS);
    } catch {
      // A tick is a courtesy, so a refusal from the browser is not worth surfacing.
    }
  }
}
