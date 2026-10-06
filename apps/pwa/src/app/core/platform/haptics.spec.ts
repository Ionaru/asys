// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';

import { HAPTIC_TICK_MS, Haptics } from './haptics';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

interface FakeMql extends EventTarget {
  matches: boolean;
  readonly media: string;
}

type VibrateFn = (pattern: VibratePattern) => boolean;

const createMql = (matches: boolean): FakeMql =>
  Object.assign(new EventTarget(), { matches, media: REDUCED_QUERY });

const stubVibrate = (implementation: VibrateFn): ReturnType<typeof vi.fn<VibrateFn>> => {
  const vibrate = vi.fn<VibrateFn>(implementation);
  Object.defineProperty(navigator, 'vibrate', {
    value: vibrate,
    configurable: true,
    writable: true,
  });
  return vibrate;
};

describe('Haptics', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('does nothing and does not throw when navigator.vibrate is not a function', () => {
    const haptics = TestBed.inject(Haptics);

    expect('vibrate' in navigator).toBe(false);
    expect(() => haptics.tick()).not.toThrow();
  });

  it('calls navigator.vibrate exactly once with 15', () => {
    const vibrate = stubVibrate(() => true);
    const haptics = TestBed.inject(Haptics);

    haptics.tick();

    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(15);
    expect(vibrate.mock.contexts[0]).toBe(navigator);
  });

  it('does not throw when vibrate throws', () => {
    const vibrate = stubVibrate(() => {
      throw new Error('vibration blocked');
    });
    const haptics = TestBed.inject(Haptics);

    expect(() => haptics.tick()).not.toThrow();
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('still vibrates under reduced motion', () => {
    const vibrate = stubVibrate(() => true);
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => createMql(query === REDUCED_QUERY)),
    );
    const haptics = TestBed.inject(Haptics);

    expect(window.matchMedia(REDUCED_QUERY).matches).toBe(true);

    haptics.tick();

    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it('keeps HAPTIC_TICK_MS between 10 and 20 milliseconds', () => {
    expect(HAPTIC_TICK_MS).toBeGreaterThanOrEqual(10);
    expect(HAPTIC_TICK_MS).toBeLessThanOrEqual(20);
  });
});
