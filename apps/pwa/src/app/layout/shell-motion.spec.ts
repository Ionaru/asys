// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import type { AnimationCallbackEvent } from '@angular/core';

import { Motion, MotionDuration, MotionEasing } from '../core/platform/motion';
import { leaveMarked } from './shell-motion';

const fakeEvent = (target: Element) => {
  const animationComplete = vi.fn();

  return {
    animationComplete,
    event: { target, animationComplete } as unknown as AnimationCallbackEvent,
  };
};

const fakeMotion = (play: (...args: unknown[]) => Promise<void>): Motion =>
  ({ allowed: () => true, reduced: signal(false), play }) as unknown as Motion;

describe('leaveMarked', () => {
  it('marks the node with data-leaving before it plays the fade-out', async () => {
    const el = document.createElement('div');
    const { event } = fakeEvent(el);
    let markedAtPlay: boolean | undefined;
    let playedOn: unknown;
    const play = vi.fn(async (target: unknown) => {
      playedOn = target;
      markedAtPlay = el.hasAttribute('data-leaving');
    });

    await leaveMarked(fakeMotion(play), event);

    expect(markedAtPlay).toBe(true);
    expect(playedOn).toBe(el);
  });

  it('fades from opacity 1 to 0 over Quick with the Out easing', async () => {
    const el = document.createElement('div');
    const { event } = fakeEvent(el);
    const play = vi.fn(async (..._args: unknown[]) => undefined);

    await leaveMarked(fakeMotion(play), event);

    expect(play.mock.calls[0]?.[1]).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(play.mock.calls[0]?.[2]).toEqual({
      duration: MotionDuration.Quick,
      easing: MotionEasing.Out,
    });
  });

  it('calls animationComplete once, and only after play resolves', async () => {
    const el = document.createElement('div');
    const { event, animationComplete } = fakeEvent(el);
    let finish: () => void = () => undefined;
    const play = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const leaving = leaveMarked(fakeMotion(play), event);

    expect(animationComplete).not.toHaveBeenCalled();

    finish();
    await leaving;

    expect(animationComplete).toHaveBeenCalledTimes(1);
  });

  it('resolves and calls animationComplete once when play rejects', async () => {
    const el = document.createElement('div');
    const { event, animationComplete } = fakeEvent(el);
    const play = vi.fn(() => Promise.reject(new Error('boom')));

    await expect(leaveMarked(fakeMotion(play), event)).resolves.toBe(undefined);

    expect(animationComplete).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute('data-leaving')).toBe(true);
  });
});
