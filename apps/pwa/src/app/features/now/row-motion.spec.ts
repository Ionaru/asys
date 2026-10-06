// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import type { AnimationCallbackEvent } from '@angular/core';

import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';
import { collapseRow, expandRow } from './row-motion';

const ROW_HEIGHT = 48;

// jsdom has no layout, so the row's measured height is set by hand.
const row = (height = ROW_HEIGHT): HTMLElement => {
  const el = document.createElement('li');

  Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height });

  return el;
};

const fakeEvent = (target: Element) => {
  const animationComplete = vi.fn();

  return {
    animationComplete,
    event: { target, animationComplete } as unknown as AnimationCallbackEvent,
  };
};

const fakeMotion = (play: (...args: unknown[]) => Promise<void>): Motion =>
  ({ allowed: () => true, reduced: signal(false), play }) as unknown as Motion;

describe('collapseRow', () => {
  it('marks the row with data-leaving before it plays', async () => {
    const el = row();
    const { event } = fakeEvent(el);
    let markedAtPlay: boolean | undefined;
    let playedOn: unknown;
    const play = vi.fn(async (target: unknown) => {
      playedOn = target;
      markedAtPlay = el.hasAttribute('data-leaving');
    });

    await collapseRow(fakeMotion(play), event);

    expect(markedAtPlay).toBe(true);
    expect(playedOn).toBe(el);
  });

  it('plays from its measured height to 0 with clipped overflow over Moderate with Out', async () => {
    const el = row(72);
    const { event } = fakeEvent(el);
    const play = vi.fn(async (..._args: unknown[]) => undefined);

    await collapseRow(fakeMotion(play), event);

    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0]?.[1]).toEqual([
      { height: '72px', overflow: 'clip' },
      { height: '0px', overflow: 'clip' },
    ]);
    expect(play.mock.calls[0]?.[2]).toEqual({
      duration: MotionDuration.Moderate,
      easing: MotionEasing.Out,
    });
  });

  it('calls animationComplete once, and only after play resolves', async () => {
    const el = row();
    const { event, animationComplete } = fakeEvent(el);
    let finish: () => void = () => undefined;
    const play = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const collapsing = collapseRow(fakeMotion(play), event);

    expect(animationComplete).not.toHaveBeenCalled();

    finish();
    await collapsing;

    expect(animationComplete).toHaveBeenCalledTimes(1);
  });

  it('resolves and calls animationComplete once when play rejects', async () => {
    const el = row();
    const { event, animationComplete } = fakeEvent(el);
    const play = vi.fn(() => Promise.reject(new Error('boom')));

    await expect(collapseRow(fakeMotion(play), event)).resolves.toBe(undefined);

    expect(animationComplete).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute('data-leaving')).toBe(true);
  });
});

describe('expandRow', () => {
  it('plays from 0 to its measured height with clipped overflow over Moderate with Out', async () => {
    const el = row(72);
    const { event } = fakeEvent(el);
    let playedOn: unknown;
    const play = vi.fn(async (target: unknown, ..._rest: unknown[]) => {
      playedOn = target;
    });

    await expandRow(fakeMotion(play), event);

    expect(play).toHaveBeenCalledTimes(1);
    expect(playedOn).toBe(el);
    expect(play.mock.calls[0]?.[1]).toEqual([
      { height: '0px', overflow: 'clip' },
      { height: '72px', overflow: 'clip' },
    ]);
    expect(play.mock.calls[0]?.[2]).toEqual({
      duration: MotionDuration.Moderate,
      easing: MotionEasing.Out,
    });
  });

  it('does not mark the row with data-leaving', async () => {
    const el = row();
    const { event } = fakeEvent(el);
    const play = vi.fn(async (..._args: unknown[]) => undefined);

    await expandRow(fakeMotion(play), event);

    expect(el.hasAttribute('data-leaving')).toBe(false);
  });

  it('calls animationComplete once, and only after play resolves', async () => {
    const el = row();
    const { event, animationComplete } = fakeEvent(el);
    let finish: () => void = () => undefined;
    const play = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const expanding = expandRow(fakeMotion(play), event);

    expect(animationComplete).not.toHaveBeenCalled();

    finish();
    await expanding;

    expect(animationComplete).toHaveBeenCalledTimes(1);
  });

  it('resolves and calls animationComplete once when play rejects', async () => {
    const el = row();
    const { event, animationComplete } = fakeEvent(el);
    const play = vi.fn(() => Promise.reject(new Error('boom')));

    await expect(expandRow(fakeMotion(play), event)).resolves.toBe(undefined);

    expect(animationComplete).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute('data-leaving')).toBe(false);
  });
});
