// SPDX-License-Identifier: EUPL-1.2

/** How a button was activated: `keyboard` is true for Enter or Space, false for a pointer. */
export interface Activation {
  readonly keyboard: boolean;
}

/**
 * Reads how a `click` was made. A click from Enter or Space has no pointer, so its `detail` is 0; a mouse
 * click or a tap has a click count of 1 or more.
 */
export const activationOf = (event: MouseEvent): Activation => ({ keyboard: event.detail === 0 });
