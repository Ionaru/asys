// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';

import { Clock } from './clock';

const at = (hours: number, minutes: number, seconds: number, millis = 0): number =>
  Date.UTC(2026, 9, 3, hours, minutes, seconds, millis);

const setVisibility = (state: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

describe('Clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('starts at Date.now() when created', () => {
    vi.setSystemTime(at(10, 0, 30));

    const clock = TestBed.inject(Clock);

    expect(clock.now()).toBe(at(10, 0, 30));
  });

  it('created at 10:00:30.000 ticks to 10:01:00.000 at +30 000 ms and 10:02:00.000 at +90 000 ms', () => {
    vi.setSystemTime(at(10, 0, 30));
    const clock = TestBed.inject(Clock);

    vi.advanceTimersByTime(29_999);

    expect(clock.now()).toBe(at(10, 0, 30));

    vi.advanceTimersByTime(1);

    expect(clock.now()).toBe(at(10, 1, 0));

    vi.advanceTimersByTime(59_999);

    expect(clock.now()).toBe(at(10, 1, 0));

    vi.advanceTimersByTime(1);

    expect(clock.now()).toBe(at(10, 2, 0));
  });

  it('created exactly on the minute waits a full 60 000 ms', () => {
    vi.setSystemTime(at(10, 0, 0));
    const clock = TestBed.inject(Clock);

    vi.advanceTimersByTime(59_999);

    expect(clock.now()).toBe(at(10, 0, 0));

    vi.advanceTimersByTime(1);

    expect(clock.now()).toBe(at(10, 1, 0));
  });

  it('keeps a single pending timer', () => {
    vi.setSystemTime(at(10, 0, 30));
    TestBed.inject(Clock);

    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(30_000);

    expect(vi.getTimerCount()).toBe(1);
  });

  describe('visibilitychange', () => {
    it('to visible refreshes now at once and re-aligns the next tick to the minute', () => {
      vi.setSystemTime(at(10, 0, 0));
      const clock = TestBed.inject(Clock);
      vi.setSystemTime(at(10, 0, 45, 500));

      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(clock.now()).toBe(at(10, 0, 45, 500));
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(14_499);

      expect(clock.now()).toBe(at(10, 0, 45, 500));

      vi.advanceTimersByTime(1);

      expect(clock.now()).toBe(at(10, 1, 0, 0));
    });

    it('to hidden changes nothing', () => {
      vi.setSystemTime(at(10, 0, 0));
      const clock = TestBed.inject(Clock);
      vi.setSystemTime(at(10, 0, 45, 500));

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(clock.now()).toBe(at(10, 0, 0));
    });
  });

  describe('destroy', () => {
    it('clears the timer and stops reacting to visibilitychange', () => {
      vi.setSystemTime(at(10, 0, 30));
      const clock = TestBed.inject(Clock);

      TestBed.resetTestingModule();

      expect(vi.getTimerCount()).toBe(0);

      vi.advanceTimersByTime(120_000);
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(clock.now()).toBe(at(10, 0, 30));
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
