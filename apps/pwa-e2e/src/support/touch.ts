// SPDX-License-Identifier: EUPL-1.2

// Trusted touch input over the Chrome DevTools Protocol. Playwright's own `page.touchscreen` can only tap, so a
// swipe, a drag-scroll and a pinch go through `Input.dispatchTouchEvent`, which the page sees as Pointer Events with
// `pointerType: 'touch'`. The context needs `hasTouch: true` (and `isMobile: true` for pinch zoom).
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from '@playwright/test';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface DragOptions {
  /** How many moves the line is cut into. Default 10. */
  readonly steps?: number;
  /** The pause after each move, in milliseconds. Default 16, one frame. */
  readonly stepMs?: number;
  /** A pause with no movement before the release, in milliseconds. Default 0. */
  readonly holdMs?: number;
}

export interface Touchscreen {
  readonly down: (point: Point) => Promise<void>;
  readonly move: (point: Point) => Promise<void>;
  readonly up: () => Promise<void>;
  readonly cancel: () => Promise<void>;
  readonly drag: (from: Point, to: Point, options?: DragOptions) => Promise<void>;
  readonly pinch: (
    centre: Point,
    fromGap: number,
    toGap: number,
    options?: DragOptions,
  ) => Promise<void>;
}

const TouchType = {
  Start: 'touchStart',
  Move: 'touchMove',
  End: 'touchEnd',
  Cancel: 'touchCancel',
} as const;

type TouchEventType = (typeof TouchType)[keyof typeof TouchType];

interface TouchPoint extends Point {
  readonly id: number;
}

const DEFAULT_STEPS = 10;

const DEFAULT_STEP_MS = 16;

const between = (from: number, to: number, fraction: number): number =>
  from + (to - from) * fraction;

/**
 * Opens a CDP session for `page` and returns a touch screen on it. In Chromium the session still dispatches touch
 * after a same-origin `page.reload()`, but a test opens it after its last reload anyway, so nothing relies on that.
 */
export const touchscreen = async (page: Page): Promise<Touchscreen> => {
  const cdp = await page.context().newCDPSession(page);

  const dispatch = async (
    type: TouchEventType,
    touchPoints: readonly TouchPoint[],
  ): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touchPoints] });
  };

  const down = (point: Point): Promise<void> =>
    dispatch(TouchType.Start, [{ x: point.x, y: point.y, id: 0 }]);

  const move = (point: Point): Promise<void> =>
    dispatch(TouchType.Move, [{ x: point.x, y: point.y, id: 0 }]);

  // The protocol wants touchEnd and touchCancel to carry no points.
  const up = (): Promise<void> => dispatch(TouchType.End, []);

  const cancel = (): Promise<void> => dispatch(TouchType.Cancel, []);

  const drag = async (from: Point, to: Point, options: DragOptions = {}): Promise<void> => {
    const { steps = DEFAULT_STEPS, stepMs = DEFAULT_STEP_MS, holdMs = 0 } = options;
    await down(from);
    for (let step = 1; step <= steps; step++) {
      const fraction = step / steps;
      await move({ x: between(from.x, to.x, fraction), y: between(from.y, to.y, fraction) });
      await sleep(stepMs);
    }
    if (holdMs > 0) await sleep(holdMs);
    await up();
  };

  // Two touch points moving apart or together. With `isMobile` Chromium zooms the visual viewport for them, so
  // Input.synthesizePinchGesture is not needed. The points are released together by one touchEnd.
  const pinch = async (
    centre: Point,
    fromGap: number,
    toGap: number,
    options: DragOptions = {},
  ): Promise<void> => {
    const { steps = DEFAULT_STEPS, stepMs = DEFAULT_STEP_MS, holdMs = 0 } = options;
    const pair = (gap: number): TouchPoint[] => [
      { x: centre.x - gap / 2, y: centre.y, id: 0 },
      { x: centre.x + gap / 2, y: centre.y, id: 1 },
    ];
    await dispatch(TouchType.Start, pair(fromGap));
    for (let step = 1; step <= steps; step++) {
      await dispatch(TouchType.Move, pair(between(fromGap, toGap, step / steps)));
      await sleep(stepMs);
    }
    if (holdMs > 0) await sleep(holdMs);
    await up();
  };

  return { down, move, up, cancel, drag, pinch };
};
