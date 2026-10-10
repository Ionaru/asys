// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Motion, MotionDuration, MotionEasing } from '../core/platform/motion';
import { flyCapture, tabInView } from './capture-flight';

const rect = (left: number, top: number, width: number, height: number): DOMRectReadOnly =>
  ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  }) as DOMRectReadOnly;

const box = (width: number, height: number, offsetLeft = 0, offsetTop = 0) => ({
  offsetLeft,
  offsetTop,
  width,
  height,
});

const INBOX_TAB = rect(275, 783, 137, 56);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('tabInView', () => {
  it('is false for a tab under the keyboard', () => {
    expect(tabInView(INBOX_TAB, box(412, 500))).toBe(false);
  });

  it('is true for the same tab when the box is 839 high', () => {
    expect(tabInView(INBOX_TAB, box(412, 839))).toBe(true);
  });

  it('is false for a zero-size tab', () => {
    expect(tabInView(rect(300, 400, 0, 0), box(412, 839))).toBe(false);
  });

  it('is false for a tab with no height or no width', () => {
    expect(tabInView(rect(300, 400, 100, 0), box(412, 839))).toBe(false);
    expect(tabInView(rect(300, 400, 0, 50), box(412, 839))).toBe(false);
  });

  it('is false when the tab sticks out of the box on any side', () => {
    expect(tabInView(rect(300, 100, 137, 56), box(412, 839))).toBe(false);
    expect(tabInView(rect(-10, 100, 137, 56), box(412, 839))).toBe(false);
    expect(tabInView(rect(100, -10, 137, 56), box(412, 839))).toBe(false);
  });

  it('measures against the box offset', () => {
    expect(tabInView(rect(10, 50, 100, 40), box(412, 839, 0, 100))).toBe(false);
    expect(tabInView(rect(10, 150, 100, 40), box(412, 839, 0, 100))).toBe(true);
  });
});

describe('flyCapture', () => {
  const FROM = rect(16, 700, 300, 40);
  const TO = INBOX_TAB;

  const fakeMotion = (play: (...args: unknown[]) => Promise<void>): Motion =>
    ({ allowed: () => true, reduced: signal(false), play }) as unknown as Motion;

  const ghost = (): HTMLElement | null => document.body.querySelector('span.shell__ghost');

  it('puts a hidden, inert ghost with the text at the from box while it plays', async () => {
    let seen: HTMLElement | null = null;
    let parent: Node | null = null;
    const play = vi.fn(async (el: unknown) => {
      seen = el as HTMLElement;
      parent = seen.parentElement;
    });

    await flyCapture(document, fakeMotion(play), FROM, TO, 'Buy milk');

    expect(play).toHaveBeenCalledTimes(1);
    expect(seen).not.toBeNull();

    const el = seen as unknown as HTMLElement;

    expect(el.tagName).toBe('SPAN');
    expect(parent).toBe(document.body);
    expect(el.textContent).toBe('Buy milk');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.position).toBe('fixed');
    expect(el.style.left).toBe('16px');
    expect(el.style.top).toBe('700px');
    expect(el.style.width).toBe('300px');
    expect(el.style.height).toBe('40px');
    expect(el.style.pointerEvents).toBe('none');
  });

  it('plays with the Moderate duration and the Emphasized easing', async () => {
    const play = vi.fn(async (..._args: unknown[]) => undefined);

    await flyCapture(document, fakeMotion(play), FROM, TO, 'Buy milk');

    expect(play.mock.calls[0]?.[2]).toEqual({
      duration: MotionDuration.Moderate,
      easing: MotionEasing.Emphasized,
    });
  });

  it('keeps the ghost while the animation runs and removes it once play resolves', async () => {
    let finish: () => void = () => undefined;
    const play = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const flight = flyCapture(document, fakeMotion(play), FROM, TO, 'Buy milk');

    expect(ghost()).not.toBeNull();

    finish();
    await flight;

    expect(ghost()).toBeNull();
  });

  describe('when the real Motion cannot start the animation', () => {
    afterEach(() => {
      TestBed.resetTestingModule();
      vi.restoreAllMocks();
      Reflect.deleteProperty(Element.prototype, 'animate');
      document.documentElement.style.removeProperty('--duration-moderate');
      document.documentElement.style.removeProperty('--ease-emphasized');
    });

    it('removes the ghost and still resolves', async () => {
      const failure = new TypeError('Keyframes are not loosely sorted by offset');
      const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const animate = vi.fn(() => {
        throw failure;
      });

      Object.defineProperty(Element.prototype, 'animate', {
        value: animate,
        configurable: true,
        writable: true,
      });
      // Without these tokens the real Motion resolves at once and never reaches `animate`.
      document.documentElement.style.setProperty('--duration-moderate', '250ms');
      document.documentElement.style.setProperty('--ease-emphasized', 'cubic-bezier(0.2, 0, 0, 1)');

      await expect(
        flyCapture(document, TestBed.inject(Motion), FROM, TO, 'Buy milk'),
      ).resolves.toBeUndefined();

      expect(animate).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledExactlyOnceWith(failure);
      expect(ghost()).toBeNull();
    });
  });
});
