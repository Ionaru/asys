// SPDX-License-Identifier: EUPL-1.2
import {
  AXIS_RATIO,
  CLICK_SUPPRESS_MS,
  COMMIT_FRACTION,
  EDGE_DEAD_ZONE_PX,
  FLING_MIN_PX,
  FLING_VELOCITY,
  RUBBER_BAND_FACTOR,
  RUBBER_BAND_MAX_PX,
  SLOP_PX,
  type SwipeDecisionInput,
  SwipeOutcome,
  type SwipeSample,
  swipeDecision,
  VELOCITY_WINDOW_MS,
  velocityOf,
} from './swipe-decision';

type DecisionRow = readonly [string, Partial<SwipeDecisionInput>, SwipeOutcome];

type VelocityRow = readonly [string, readonly SwipeSample[], number];

const DEFAULTS: SwipeDecisionInput = {
  startX: 200,
  dx: 0,
  dy: 0,
  width: 380,
  viewportWidth: 412,
  velocity: 0,
  enabled: { start: true, end: true },
  locked: false,
};

const START_DISABLED = { start: false, end: true } as const;

const END_DISABLED = { start: true, end: false } as const;

const NONE_ENABLED = { start: false, end: false } as const;

const DECISIONS: readonly DecisionRow[] = [
  ['Left dead zone', { startX: 23, dx: 50, dy: 0 }, SwipeOutcome.Scroll],
  ['Left boundary', { startX: 24, dx: 50, dy: 0 }, SwipeOutcome.Track],
  ['Right boundary', { startX: 388, dx: -50, dy: 0 }, SwipeOutcome.Track],
  ['Right dead zone', { startX: 389, dx: -50, dy: 0 }, SwipeOutcome.Scroll],
  ['Inside the slop', { dx: 9, dy: 9 }, SwipeOutcome.Pending],
  ['Inside the slop, left', { dx: -9, dy: 0 }, SwipeOutcome.Pending],
  ['Slop reached, horizontal (10 > 9)', { dx: 10, dy: 6 }, SwipeOutcome.Track],
  ['Slop reached, too steep (10 is not > 10.5)', { dx: 10, dy: 7 }, SwipeOutcome.Scroll],
  ['Exactly 1.5', { dx: 15, dy: 10 }, SwipeOutcome.Scroll],
  ['Just past 1.5', { dx: 16, dy: 10 }, SwipeOutcome.Track],
  ['Vertical', { dx: 3, dy: 12 }, SwipeOutcome.Scroll],
  ['Straight up', { dx: 0, dy: -10 }, SwipeOutcome.Scroll],
  [
    'Disabled direction still tracks',
    { dx: -12, dy: 2, enabled: START_DISABLED },
    SwipeOutcome.Track,
  ],
  ['Nothing enabled', { dx: 50, dy: 0, enabled: NONE_ENABLED }, SwipeOutcome.Scroll],
  ['Distance, end', { locked: true, dx: 152 }, SwipeOutcome.CommitEnd],
  ['Just short, end', { locked: true, dx: 151 }, SwipeOutcome.SpringBack],
  ['Distance, start', { locked: true, dx: -152 }, SwipeOutcome.CommitStart],
  ['Just short, start', { locked: true, dx: -151 }, SwipeOutcome.SpringBack],
  ['Fling at the limits', { locked: true, dx: 64, velocity: 0.6 }, SwipeOutcome.CommitEnd],
  ['Fling too short', { locked: true, dx: 63, velocity: 0.9 }, SwipeOutcome.SpringBack],
  ['Fling too slow', { locked: true, dx: 64, velocity: 0.59 }, SwipeOutcome.SpringBack],
  ['Fling, start', { locked: true, dx: -64, velocity: -0.6 }, SwipeOutcome.CommitStart],
  ['Fling against the drag', { locked: true, dx: 100, velocity: -0.8 }, SwipeOutcome.SpringBack],
  ['End disabled', { locked: true, dx: 200, enabled: END_DISABLED }, SwipeOutcome.SpringBack],
  [
    'Start disabled, even a fling',
    { locked: true, dx: -200, velocity: -1, enabled: START_DISABLED },
    SwipeOutcome.SpringBack,
  ],
  ['No movement', { locked: true, dx: 0 }, SwipeOutcome.SpringBack],
  ['No width, distance only', { locked: true, dx: 100, width: 0 }, SwipeOutcome.SpringBack],
  ['No width, fling', { locked: true, dx: 100, width: 0, velocity: 0.7 }, SwipeOutcome.CommitEnd],
  ['Locked ignores dy', { locked: true, dx: 152, dy: 200 }, SwipeOutcome.CommitEnd],
  ['Locked ignores the dead zone', { locked: true, startX: 10, dx: 200 }, SwipeOutcome.CommitEnd],
];

const sample = (x: number, t: number): SwipeSample => ({ x, t });

const VELOCITIES: readonly VelocityRow[] = [
  ['none', [], 0],
  ['0@0 (one sample)', [sample(0, 0)], 0],
  ['0@0, 30@50, 90@100', [sample(0, 0), sample(30, 50), sample(90, 100)], 0.9],
  ['100@0, 40@60 (leftwards)', [sample(100, 0), sample(40, 60)], -1],
  [
    '0@0, 60@100 (the first sample is exactly at the window edge)',
    [sample(0, 0), sample(60, 100)],
    0.6,
  ],
  [
    '0@0, 50@200, 110@250 (only the last two are in the window)',
    [sample(0, 0), sample(50, 200), sample(110, 250)],
    1.2,
  ],
  [
    '0@0, 100@10, 100@200 (a stop, then the release sample)',
    [sample(0, 0), sample(100, 10), sample(100, 200)],
    0,
  ],
  ['0@5, 20@5 (no time span)', [sample(0, 5), sample(20, 5)], 0],
];

const CONSTANTS = [
  ['EDGE_DEAD_ZONE_PX', EDGE_DEAD_ZONE_PX, 24],
  ['SLOP_PX', SLOP_PX, 10],
  ['AXIS_RATIO', AXIS_RATIO, 1.5],
  ['COMMIT_FRACTION', COMMIT_FRACTION, 0.4],
  ['FLING_VELOCITY', FLING_VELOCITY, 0.6],
  ['FLING_MIN_PX', FLING_MIN_PX, 64],
  ['RUBBER_BAND_FACTOR', RUBBER_BAND_FACTOR, 0.25],
  ['RUBBER_BAND_MAX_PX', RUBBER_BAND_MAX_PX, 32],
  ['VELOCITY_WINDOW_MS', VELOCITY_WINDOW_MS, 100],
  ['CLICK_SUPPRESS_MS', CLICK_SUPPRESS_MS, 300],
] as const;

describe('swipeDecision', () => {
  it.each(DECISIONS)('%s', (_name, overrides, outcome) => {
    expect(swipeDecision({ ...DEFAULTS, ...overrides })).toBe(outcome);
  });
});

describe('velocityOf', () => {
  it.each(VELOCITIES)('%s', (_name, samples, expected) => {
    expect(velocityOf(samples)).toBeCloseTo(expected, 5);
  });
});

describe('swipe constants', () => {
  it.each(CONSTANTS)('%s has the contract value', (_name, actual, expected) => {
    expect(actual).toBe(expected);
  });
});
