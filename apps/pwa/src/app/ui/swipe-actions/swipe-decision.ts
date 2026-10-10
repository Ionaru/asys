// SPDX-License-Identifier: EUPL-1.2

/** What a pointer movement means for a swipe, as far as it is known. */
export enum SwipeOutcome {
  Pending = 'pending',
  Scroll = 'scroll',
  Track = 'track',
  CommitEnd = 'commit-end',
  CommitStart = 'commit-start',
  SpringBack = 'spring-back',
}

/** What `swipeDecision` needs to know about a gesture; all distances are CSS pixels. */
export interface SwipeDecisionInput {
  /** The `clientX` at pointerdown. */
  readonly startX: number;
  /** The `clientX` now minus `startX`; positive toward the end (right). */
  readonly dx: number;
  /** The `clientY` now minus the `clientY` at pointerdown. */
  readonly dy: number;
  /** The SwipeActions host's width at pointerdown. */
  readonly width: number;
  /** The `window.innerWidth` at pointerdown. */
  readonly viewportWidth: number;
  /** Pixels per millisecond from `velocityOf`; positive toward the end. */
  readonly velocity: number;
  /** Which directions have an action. */
  readonly enabled: { readonly start: boolean; readonly end: boolean };
  /** True once the gesture has been locked to horizontal. */
  readonly locked: boolean;
}

/** A pointer position at a moment, as `velocityOf` reads it. */
export interface SwipeSample {
  /** The `clientX`. */
  readonly x: number;
  /** The `performance.now()` reading, in milliseconds. */
  readonly t: number;
}

/** Pointerdowns this close to a viewport edge are left to the system back gesture. */
export const EDGE_DEAD_ZONE_PX = 24;

/** How far the pointer moves on either axis before the gesture picks a direction. */
export const SLOP_PX = 10;

/** How many times larger the horizontal movement must be than the vertical one to track. */
export const AXIS_RATIO = 1.5;

/** The share of the host's width that a drag must cover to commit. */
export const COMMIT_FRACTION = 0.4;

/** The speed, in px/ms, at which a short drag still commits. */
export const FLING_VELOCITY = 0.6;

/** The shortest drag that a fling may commit. */
export const FLING_MIN_PX = 64;

/** The share of the drag beyond a disabled direction that the host follows. */
export const RUBBER_BAND_FACTOR = 0.25;

/** The furthest the host may travel toward a disabled direction. */
export const RUBBER_BAND_MAX_PX = 32;

/** How far back from the last sample the velocity looks, in milliseconds. */
export const VELOCITY_WINDOW_MS = 100;

/** How long after a committed swipe the click that follows it is swallowed, in milliseconds. */
export const CLICK_SUPPRESS_MS = 300;

/** Decides a gesture that has not been locked yet: scroll, wait for more movement, or track it. */
const decideUnlocked = (input: SwipeDecisionInput): SwipeOutcome => {
  const { startX, dx, dy, viewportWidth, enabled } = input;

  if (startX < EDGE_DEAD_ZONE_PX || startX > viewportWidth - EDGE_DEAD_ZONE_PX) {
    return SwipeOutcome.Scroll;
  }

  if (!enabled.start && !enabled.end) {
    return SwipeOutcome.Scroll;
  }

  if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) {
    return SwipeOutcome.Pending;
  }

  return Math.abs(dx) > AXIS_RATIO * Math.abs(dy) ? SwipeOutcome.Track : SwipeOutcome.Scroll;
};

/** Decides, at release, whether a locked gesture commits its direction or springs back. */
const decideLocked = (input: SwipeDecisionInput): SwipeOutcome => {
  const { dx, width, velocity, enabled } = input;

  if (dx === 0) {
    return SwipeOutcome.SpringBack;
  }

  const towardEnd = dx > 0;

  if (!(towardEnd ? enabled.end : enabled.start)) {
    return SwipeOutcome.SpringBack;
  }

  const commit = towardEnd ? SwipeOutcome.CommitEnd : SwipeOutcome.CommitStart;
  const distance = Math.abs(dx);

  if (width > 0 && distance >= COMMIT_FRACTION * width) {
    return commit;
  }

  const along = towardEnd ? velocity : -velocity;

  return distance >= FLING_MIN_PX && along >= FLING_VELOCITY ? commit : SwipeOutcome.SpringBack;
};

/** Tells whether a pointer movement scrolls, waits, tracks, commits or springs back. */
export const swipeDecision = (input: SwipeDecisionInput): SwipeOutcome =>
  input.locked ? decideLocked(input) : decideUnlocked(input);

/** The horizontal speed in px/ms over the last `VELOCITY_WINDOW_MS`, positive toward the end. */
export const velocityOf = (samples: readonly SwipeSample[]): number => {
  const last = samples.at(-1);

  if (last === undefined) {
    return 0;
  }

  const kept = samples.filter((sample) => sample.t >= last.t - VELOCITY_WINDOW_MS);
  const first = kept[0];

  if (first === undefined || kept.length < 2 || last.t === first.t) {
    return 0;
  }

  return (last.x - first.x) / (last.t - first.t);
};
