// SPDX-License-Identifier: EUPL-1.2
import type { AnimationCallbackEvent } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Motion, MotionDuration, MotionEasing } from './motion';
import { ThemeName } from './theme';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const TOKENS = [
  '--duration-quick',
  '--duration-moderate',
  '--ease-out',
  '--ease-in',
  '--ease-emphasized',
];

interface FakeMql extends EventTarget {
  matches: boolean;
  readonly media: string;
}

interface FakeAnimation {
  readonly finished: Promise<void>;
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}

type AnimateFn = (
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
) => FakeAnimation;

const createMql = (matches: boolean): FakeMql =>
  Object.assign(new EventTarget(), { matches, media: REDUCED_QUERY });

const change = (mql: FakeMql, matches: boolean): void => {
  mql.matches = matches;
  mql.dispatchEvent(Object.assign(new Event('change'), { matches }));
};

const stubReducedMotion = (matches: boolean): FakeMql => {
  const mql = createMql(matches);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => (query === REDUCED_QUERY ? mql : createMql(false))),
  );
  return mql;
};

const defer = (): Deferred => {
  let resolve: () => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
};

const stubAnimate = (
  finished: Promise<void> = Promise.resolve(),
): ReturnType<typeof vi.fn<AnimateFn>> => {
  const animate = vi.fn<AnimateFn>(() => ({ finished }));
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  });
  return animate;
};

const stubAnimateThrowing = (error: unknown): ReturnType<typeof vi.fn<AnimateFn>> => {
  const animate = vi.fn<AnimateFn>(() => {
    throw error;
  });
  Object.defineProperty(Element.prototype, 'animate', {
    value: animate,
    configurable: true,
    writable: true,
  });
  return animate;
};

const silenceConsoleError = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);

const fakeEvent = (target: Element) => {
  const animationComplete = vi.fn();

  return {
    animationComplete,
    event: { target, animationComplete } as unknown as AnimationCallbackEvent,
  };
};

const setToken = (name: string, value: string): void => {
  document.documentElement.style.setProperty(name, value);
};

const setTheme = (value: string): void => {
  document.documentElement.setAttribute('data-theme', value);
};

const flush = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

const keyframes = (): Keyframe[] => [{ opacity: 0 }, { opacity: 1 }];

const plain = (): KeyframeAnimationOptions => ({ duration: 120 });

describe('Motion', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(Element.prototype, 'animate');
    for (const token of TOKENS) {
      document.documentElement.style.removeProperty(token);
    }
    document.documentElement.removeAttribute('data-theme');
  });

  it('has the documented duration and easing tokens', () => {
    expect(MotionDuration.Quick).toBe('var(--duration-quick)');
    expect(MotionDuration.Moderate).toBe('var(--duration-moderate)');
    expect(MotionEasing.Out).toBe('var(--ease-out)');
    expect(MotionEasing.In).toBe('var(--ease-in)');
    expect(MotionEasing.Emphasized).toBe('var(--ease-emphasized)');
  });

  describe('reduced', () => {
    it('is false and does not throw when matchMedia is not a function', () => {
      expect(() => TestBed.inject(Motion)).not.toThrow();
      expect(TestBed.inject(Motion).reduced()).toBe(false);
    });

    it('is true while the reduced motion query matches', () => {
      stubReducedMotion(true);

      const motion = TestBed.inject(Motion);

      expect(motion.reduced()).toBe(true);
    });

    it('becomes false when the query dispatches a change event with matches false', () => {
      const mql = stubReducedMotion(true);
      const motion = TestBed.inject(Motion);

      expect(motion.reduced()).toBe(true);

      change(mql, false);

      expect(motion.reduced()).toBe(false);
    });

    it('removes its change listener when the injector is destroyed', () => {
      const mql = stubReducedMotion(true);
      const add = vi.spyOn(mql, 'addEventListener');
      const remove = vi.spyOn(mql, 'removeEventListener');
      TestBed.inject(Motion);
      const added = add.mock.calls.find(([type]) => type === 'change');

      expect(added).toBeDefined();
      expect(remove).not.toHaveBeenCalled();

      TestBed.resetTestingModule();

      expect(remove).toHaveBeenCalledWith('change', added?.[1]);
    });
  });

  describe('allowed', () => {
    it('is false when Element.prototype.animate is missing', () => {
      stubReducedMotion(false);

      const motion = TestBed.inject(Motion);

      expect(motion.allowed()).toBe(false);
    });

    it('is true when animate exists, motion is not reduced and the Theme is light, dark or absent', () => {
      stubAnimate();
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);

      expect(motion.allowed()).toBe(true);

      setTheme(ThemeName.Light);

      expect(motion.allowed()).toBe(true);

      setTheme(ThemeName.Dark);

      expect(motion.allowed()).toBe(true);
    });

    it('is false on the Drive Theme, read live at each call', () => {
      stubAnimate();
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);

      setTheme(ThemeName.Light);

      expect(motion.allowed()).toBe(true);

      setTheme(ThemeName.Drive);

      expect(motion.allowed()).toBe(false);

      setTheme(ThemeName.Dark);

      expect(motion.allowed()).toBe(true);
    });

    it('is false when animate exists and motion is reduced', () => {
      stubAnimate();
      stubReducedMotion(true);

      const motion = TestBed.inject(Motion);

      expect(motion.allowed()).toBe(false);
    });
  });

  describe('play', () => {
    it('resolves without calling animate while not allowed', async () => {
      const animate = stubAnimate();
      stubReducedMotion(true);
      setToken('--duration-moderate', '250ms');
      setToken('--ease-emphasized', 'cubic-bezier(0.2, 0, 0, 1)');
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');

      await expect(
        motion.play(el, keyframes(), {
          duration: MotionDuration.Moderate,
          easing: MotionEasing.Emphasized,
          fill: 'both',
        }),
      ).resolves.toBeUndefined();

      expect(animate).not.toHaveBeenCalled();
    });

    it('resolves without calling animate on the Drive Theme', async () => {
      const animate = stubAnimate();
      stubReducedMotion(false);
      setTheme(ThemeName.Drive);
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');

      await expect(motion.play(el, keyframes(), plain())).resolves.toBeUndefined();

      expect(animate).not.toHaveBeenCalled();
    });

    it('calls el.animate once with the tokens resolved from the root element', async () => {
      const animate = stubAnimate();
      stubReducedMotion(false);
      setToken('--duration-moderate', '250ms');
      setToken('--ease-emphasized', 'cubic-bezier(0.2, 0, 0, 1)');
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');
      const frames = keyframes();

      await motion.play(el, frames, {
        duration: MotionDuration.Moderate,
        easing: MotionEasing.Emphasized,
        fill: 'both',
      });

      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate).toHaveBeenCalledWith(frames, {
        duration: 250,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        fill: 'both',
      });
      expect(animate.mock.contexts[0]).toBe(el);
      expect(animate.mock.calls[0]?.[0]).toBe(frames);
      expect(Object.keys(animate.mock.calls[0]?.[1] ?? {}).sort()).toEqual([
        'duration',
        'easing',
        'fill',
      ]);
    });

    it('resolves a duration token reading 0.25s to 250', async () => {
      const animate = stubAnimate();
      stubReducedMotion(false);
      setToken('--duration-moderate', '0.25s');
      const motion = TestBed.inject(Motion);

      await motion.play(document.createElement('div'), keyframes(), {
        duration: MotionDuration.Moderate,
      });

      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.calls[0]?.[1].duration).toBe(250);
    });

    it('passes a numeric duration through unchanged', async () => {
      const animate = stubAnimate();
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);

      await motion.play(document.createElement('div'), keyframes(), { duration: 120 });

      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.calls[0]?.[1].duration).toBe(120);
    });

    it('resolves at once without calling animate when a var token reads as an empty string', async () => {
      const animate = stubAnimate();
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');

      setToken('--ease-out', 'cubic-bezier(0, 0, 0.2, 1)');

      await expect(
        motion.play(el, keyframes(), {
          duration: MotionDuration.Quick,
          easing: MotionEasing.Out,
        }),
      ).resolves.toBeUndefined();

      expect(animate).not.toHaveBeenCalled();

      setToken('--duration-quick', '120ms');
      document.documentElement.style.removeProperty('--ease-out');

      await expect(
        motion.play(el, keyframes(), {
          duration: MotionDuration.Quick,
          easing: MotionEasing.Out,
        }),
      ).resolves.toBeUndefined();

      expect(animate).not.toHaveBeenCalled();
    });

    it('has not resolved while the animation finished promise is pending', async () => {
      const finished = defer();
      const animate = stubAnimate(finished.promise);
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);
      let settled = false;

      const playing = motion.play(document.createElement('div'), keyframes(), plain()).then(() => {
        settled = true;
      });
      await flush();

      expect(animate).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);

      finished.resolve();
      await playing;

      expect(settled).toBe(true);
    });

    it('resolves to undefined when finished resolves', async () => {
      const finished = defer();
      stubAnimate(finished.promise);
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);

      const playing = motion.play(document.createElement('div'), keyframes(), plain());
      finished.resolve();

      await expect(playing).resolves.toBeUndefined();
    });

    it('resolves without reporting anything when finished rejects with an AbortError DOMException', async () => {
      const report = silenceConsoleError();
      const finished = defer();
      stubAnimate(finished.promise);
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);

      const playing = motion.play(document.createElement('div'), keyframes(), plain());
      finished.reject(new DOMException('The animation was cancelled', 'AbortError'));

      await expect(playing).resolves.toBeUndefined();

      expect(report).not.toHaveBeenCalled();
    });

    it('resolves and reports the error when finished rejects with any other error', async () => {
      const report = silenceConsoleError();
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');

      const failure = new Error('animation failed');
      const first = defer();
      stubAnimate(first.promise);
      const playingFirst = motion.play(el, keyframes(), plain());
      first.reject(failure);

      await expect(playingFirst).resolves.toBeUndefined();

      expect(report).toHaveBeenCalledExactlyOnceWith(failure);

      const other = new DOMException('The animation is not usable', 'InvalidStateError');
      const second = defer();
      stubAnimate(second.promise);
      const playingSecond = motion.play(el, keyframes(), plain());
      second.reject(other);

      await expect(playingSecond).resolves.toBeUndefined();

      expect(report).toHaveBeenCalledTimes(2);
      expect(report).toHaveBeenLastCalledWith(other);
    });

    it('resolves and reports the error when animate throws', async () => {
      const report = silenceConsoleError();
      const failure = new TypeError('Keyframes are not loosely sorted by offset');
      const animate = stubAnimateThrowing(failure);
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);

      await expect(
        motion.play(document.createElement('div'), keyframes(), plain()),
      ).resolves.toBeUndefined();

      expect(animate).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledExactlyOnceWith(failure);
    });

    it('passes options other than duration and easing through untouched and keeps absent ones absent', async () => {
      const animate = stubAnimate();
      stubReducedMotion(false);
      setToken('--duration-quick', '120ms');
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');

      await motion.play(el, keyframes(), {
        duration: MotionDuration.Quick,
        easing: 'linear',
        delay: 40,
        fill: 'forwards',
      });
      await motion.play(el, keyframes(), { fill: 'both' });

      expect(animate).toHaveBeenCalledTimes(2);
      expect(animate.mock.calls[0]?.[1]).toEqual({
        duration: 120,
        easing: 'linear',
        delay: 40,
        fill: 'forwards',
      });
      expect(Object.keys(animate.mock.calls[1]?.[1] ?? {})).toEqual(['fill']);
    });
  });

  describe('leave', () => {
    it('marks the target with data-leaving before it animates', async () => {
      const el = document.createElement('div');
      const { event } = fakeEvent(el);
      let markedAtAnimate: boolean | undefined;
      const animate = stubAnimate();
      animate.mockImplementation(() => {
        markedAtAnimate = el.hasAttribute('data-leaving');
        return { finished: Promise.resolve() };
      });
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);

      await motion.leave(event, keyframes(), plain());

      expect(animate).toHaveBeenCalledTimes(1);
      expect(markedAtAnimate).toBe(true);
      expect(el.getAttribute('data-leaving')).toBe('');
    });

    it('animates the target with the tokens resolved from the root element', async () => {
      const animate = stubAnimate();
      stubReducedMotion(false);
      setToken('--duration-quick', '120ms');
      setToken('--ease-out', 'cubic-bezier(0, 0, 0.2, 1)');
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');
      const { event } = fakeEvent(el);
      const frames = keyframes();

      await motion.leave(event, frames, {
        duration: MotionDuration.Quick,
        easing: MotionEasing.Out,
      });

      expect(animate).toHaveBeenCalledExactlyOnceWith(frames, {
        duration: 120,
        easing: 'cubic-bezier(0, 0, 0.2, 1)',
      });
      expect(animate.mock.contexts[0]).toBe(el);
    });

    it('calls animationComplete once, and only after the animation has finished', async () => {
      const finished = defer();
      stubAnimate(finished.promise);
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);
      const { event, animationComplete } = fakeEvent(document.createElement('div'));

      const leaving = motion.leave(event, keyframes(), plain());
      await flush();

      expect(animationComplete).not.toHaveBeenCalled();

      finished.resolve();
      await leaving;

      expect(animationComplete).toHaveBeenCalledTimes(1);
    });

    it('marks the target, skips animate and still calls animationComplete once while not allowed', async () => {
      const animate = stubAnimate();
      stubReducedMotion(true);
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');
      const { event, animationComplete } = fakeEvent(el);

      await expect(motion.leave(event, keyframes(), plain())).resolves.toBeUndefined();

      expect(animate).not.toHaveBeenCalled();
      expect(el.hasAttribute('data-leaving')).toBe(true);
      expect(animationComplete).toHaveBeenCalledTimes(1);
    });

    it('resolves and calls animationComplete once when animate throws', async () => {
      const report = silenceConsoleError();
      const failure = new TypeError('Keyframes are not loosely sorted by offset');
      stubAnimateThrowing(failure);
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);
      const el = document.createElement('div');
      const { event, animationComplete } = fakeEvent(el);

      await expect(motion.leave(event, keyframes(), plain())).resolves.toBeUndefined();

      expect(animationComplete).toHaveBeenCalledTimes(1);
      expect(el.hasAttribute('data-leaving')).toBe(true);
      expect(report).toHaveBeenCalledExactlyOnceWith(failure);
    });

    it('resolves and calls animationComplete once when finished rejects with any other error', async () => {
      silenceConsoleError();
      const finished = defer();
      stubAnimate(finished.promise);
      stubReducedMotion(false);
      const motion = TestBed.inject(Motion);
      const { event, animationComplete } = fakeEvent(document.createElement('div'));

      const leaving = motion.leave(event, keyframes(), plain());
      finished.reject(new Error('animation failed'));

      await expect(leaving).resolves.toBeUndefined();

      expect(animationComplete).toHaveBeenCalledTimes(1);
    });
  });
});
