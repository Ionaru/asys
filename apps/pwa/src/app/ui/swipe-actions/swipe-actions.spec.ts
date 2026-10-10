// SPDX-License-Identifier: EUPL-1.2
import { Component, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterLink } from '@angular/router';

import { Haptics } from '../../core/platform/haptics';
import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';
import { ThemeName } from '../../core/platform/theme';
import { SwipeActions } from './swipe-actions';
import { CLICK_SUPPRESS_MS, EDGE_DEAD_ZONE_PX } from './swipe-decision';

@Component({ template: '' })
class Blank {}

@Component({
  imports: [SwipeActions, RouterLink],
  template: `
    <asys-swipe-actions
      [taskId]="id()"
      [disabled]="disabled()"
      [startEnabled]="start()"
      [endEnabled]="end()"
      (commitEnd)="ends.push($event)"
      (commitStart)="starts.push($event)"
    >
      <a routerLink="/task">Row</a>
      <input />
    </asys-swipe-actions>
  `,
})
class Host {
  readonly id = signal('task-a');

  readonly disabled = signal(false);

  readonly start = signal(true);

  readonly end = signal(true);

  /** The Task ids `commitEnd` emitted, in order. */
  readonly ends: string[] = [];

  /** The Task ids `commitStart` emitted, in order. */
  readonly starts: string[] = [];
}

/** One call of the fake `Motion.play`, with the inline `translate` the element had at that moment. */
interface Play {
  readonly el: Element;
  readonly keyframes: unknown;
  readonly options: unknown;
  readonly translate: string;
}

/** What a click did: whether it was default-prevented, and whether it got past the host. */
interface Click {
  readonly defaultPrevented: boolean;
  readonly reachedDocument: boolean;
}

interface SetupOptions {
  readonly start?: boolean;
  readonly end?: boolean;
  readonly disabled?: boolean;
  /** The width the host reports from `getBoundingClientRect`. */
  readonly width?: number;
  /** A Motion that reports reduced motion, is not allowed to animate and resolves `play` at once. */
  readonly reduced?: boolean;
}

interface Origin {
  readonly x: number;
  readonly y: number;
  readonly target: EventTarget;
}

const START_X = 100;

const START_Y = 50;

const WIDTH = 380;

const MOUSE: PointerEventInit = { pointerType: 'mouse' };

const PEN: PointerEventInit = { pointerType: 'pen' };

const SECOND_FINGER: PointerEventInit = { pointerId: 2, isPrimary: false };

const COMMIT_OPTIONS = { duration: MotionDuration.Quick, easing: MotionEasing.In };

const SPRING_OPTIONS = { duration: MotionDuration.Moderate, easing: MotionEasing.Out };

const keyframes = (from: string, to: string) => [{ translate: from }, { translate: to }];

/** The fake clock behind `performance.now`; a test sets it before each pointer event. */
let t = 0;

const at = (time: number): void => {
  t = time;
};

/** Own properties a test put on an element instance, deleted again after the test. */
const stubs: { readonly target: object; readonly name: string }[] = [];

/** Exceptions that escaped an event listener, which jsdom reports on the window. */
const errors: unknown[] = [];

const onError = (event: ErrorEvent): void => {
  errors.push(event.error ?? event.message);
};

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

/** One macrotask, on the real timers. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The text of an element, without its icons, on one line. */
const text = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;

  for (const svg of Array.from(copy.querySelectorAll('svg'))) {
    svg.remove();
  }

  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const rect = (width: number): DOMRect => ({
  x: 0,
  y: 0,
  width,
  height: 56,
  top: 0,
  left: 0,
  right: width,
  bottom: 56,
  toJSON: () => ({}),
});

const setup = async (options: SetupOptions = {}) => {
  const reduced = options.reduced ?? false;
  const plays: Play[] = [];
  let next = deferred();
  const play = vi.fn((el: Element, frames: unknown, playOptions: unknown): Promise<void> => {
    plays.push({
      el,
      keyframes: frames,
      options: playOptions,
      translate: el instanceof HTMLElement ? el.style.translate : '',
    });

    return reduced ? Promise.resolve() : next.promise;
  });
  const motion = { reduced: signal(reduced), allowed: () => !reduced, play };
  const haptics = { tick: vi.fn<() => void>() };
  const handleError = vi.fn<(error: unknown) => void>();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'task', component: Blank }]),
      { provide: Motion, useValue: motion },
      { provide: Haptics, useValue: haptics },
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  });

  const fixture = TestBed.createComponent(Host);
  const host = fixture.componentInstance;
  const router = TestBed.inject(Router);

  host.start.set(options.start ?? true);
  host.end.set(options.end ?? true);
  host.disabled.set(options.disabled ?? false);
  await fixture.whenStable();

  const element = (): HTMLElement =>
    must(fixture.nativeElement.querySelector('asys-swipe-actions'));
  const surface = (): HTMLElement => must(element().querySelector('.asys-swipe__surface'));
  const endReveal = (): HTMLElement => must(element().querySelector('.asys-swipe__reveal--end'));
  const startReveal = (): HTMLElement =>
    must(element().querySelector('.asys-swipe__reveal--start'));
  const anchor = (): HTMLAnchorElement => must(element().querySelector('a'));
  const input = (): HTMLInputElement => must(element().querySelector('input'));
  const translate = (): string => surface().style.translate;
  const armed = (): boolean => element().classList.contains('asys-swipe--armed');
  const stub = (name: string, value: unknown): void => {
    const target = element();

    Object.defineProperty(target, name, { configurable: true, writable: true, value });
    stubs.push({ target, name });
  };

  stub('getBoundingClientRect', () => rect(options.width ?? WIDTH));

  let origin: Origin = { x: START_X, y: START_Y, target: anchor() };

  /** A pointer event at an absolute position; the defaults are the primary touch pointer, 1. */
  const raw = (
    type: string,
    x: number,
    y: number,
    init: PointerEventInit = {},
    target: EventTarget = origin.target,
  ): void => {
    target.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        ...init,
      }),
    );
  };
  const down = (
    x = START_X,
    y = START_Y,
    init: PointerEventInit = {},
    target: EventTarget = anchor(),
  ): void => {
    origin = { x, y, target };
    raw('pointerdown', x, y, init, target);
  };
  /** A pointermove `dx` and `dy` from where the last `down` was. */
  const move = (dx: number, dy = 0, init: PointerEventInit = {}): void => {
    raw('pointermove', origin.x + dx, origin.y + dy, init);
  };
  const up = (dx: number, dy = 0, init: PointerEventInit = {}): void => {
    raw('pointerup', origin.x + dx, origin.y + dy, init);
  };
  /** A pointercancel, which carries no useful position. */
  const cancel = (init: PointerEventInit = {}): void => {
    raw('pointercancel', 0, 0, init);
  };
  /** A whole drag to `dx`: down at t 0, moves at t 100 and 200, release at t 600 (no fling). */
  const drag = (dx: number, init: PointerEventInit = {}): void => {
    at(0);
    down(START_X, START_Y, init);
    at(100);
    move(dx / 2, 0, init);
    at(200);
    move(dx, 0, init);
    at(600);
    up(dx, 0, init);
  };
  const click = (target: HTMLElement = anchor()): Click => {
    const first: Event[] = [];
    const reached: Event[] = [];
    const record = (event: Event): void => {
      first.push(event);
    };
    const reach = (event: Event): void => {
      reached.push(event);
    };

    document.addEventListener('click', record, { capture: true });
    document.addEventListener('click', reach);

    try {
      target.click();
    } finally {
      document.removeEventListener('click', record, { capture: true });
      document.removeEventListener('click', reach);
    }

    return {
      defaultPrevented: first.at(0)?.defaultPrevented ?? false,
      reachedDocument: reached.length > 0,
    };
  };
  /** Clicks, then waits for the navigation a click that gets through starts. */
  const activate = async (): Promise<Click> => {
    const result = click();

    await fixture.whenStable();

    return result;
  };
  const url = (): string => router.url;
  const onlyPlay = (): Play => {
    expect(plays).toHaveLength(1);

    return must(plays[0], 'play');
  };
  /** Resolves the pending `play`. */
  const release = (): void => {
    next.resolve();
  };
  /** A fresh pending `play` for the next call. */
  const renew = (): void => {
    next = deferred();
  };
  const settle = async (): Promise<void> => {
    await tick();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  /** A signal input of the test host changed, and the change applied to the component. */
  const apply = (change: () => void): void => {
    change();
    fixture.detectChanges();
  };

  return {
    fixture,
    host,
    plays,
    haptics,
    handleError,
    element,
    surface,
    endReveal,
    startReveal,
    anchor,
    input,
    translate,
    armed,
    stub,
    raw,
    down,
    move,
    up,
    cancel,
    drag,
    click,
    activate,
    url,
    onlyPlay,
    release,
    renew,
    settle,
    apply,
  };
};

describe('SwipeActions', () => {
  beforeEach(() => {
    t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    window.addEventListener('error', onError);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    for (const { target, name } of stubs.splice(0)) {
      Reflect.deleteProperty(target, name);
    }

    document.documentElement.removeAttribute('data-theme');
    window.removeEventListener('error', onError);
    errors.length = 0;
  });

  describe('markup', () => {
    it('puts the class asys-swipe on its host, and the content in the surface after both reveals', async () => {
      const { element, surface, endReveal, startReveal, anchor, input } = await setup();
      const children = Array.from(element().children);

      expect(element().classList.contains('asys-swipe')).toBe(true);
      expect(children).toHaveLength(3);
      expect(children[0]).toBe(endReveal());
      expect(children[1]).toBe(startReveal());
      expect(children[2]).toBe(surface());
      expect(surface().contains(anchor())).toBe(true);
      expect(surface().contains(input())).toBe(true);
    });

    it('hides both reveals from assistive technology and starts them hidden', async () => {
      const { endReveal, startReveal, translate } = await setup();

      expect(endReveal().getAttribute('aria-hidden')).toBe('true');
      expect(startReveal().getAttribute('aria-hidden')).toBe('true');
      expect(endReveal().hidden).toBe(true);
      expect(startReveal().hidden).toBe(true);
      expect(translate()).toBe('');
    });

    it('reads Done with a check icon on the end reveal', async () => {
      const { endReveal } = await setup();

      expect(text(endReveal())).toBe('Done');
      expect(endReveal().querySelector('svg')).not.toBeNull();
    });

    it('reads Log progress with no reason on the start reveal while the start is enabled', async () => {
      const { startReveal } = await setup({ start: true });

      expect(text(startReveal())).toBe('Log progress');
      expect(startReveal().hasAttribute('data-reason')).toBe(false);
    });

    it('reads Needs an Estimate with a reason on the start reveal while the start is disabled', async () => {
      const { startReveal } = await setup({ start: false });

      expect(text(startReveal())).toBe('Needs an Estimate');
      expect(startReveal().hasAttribute('data-reason')).toBe(true);
    });

    it('follows the startEnabled input', async () => {
      const { host, apply, startReveal } = await setup({ start: true });

      apply(() => host.start.set(false));

      expect(text(startReveal())).toBe('Needs an Estimate');
      expect(startReveal().hasAttribute('data-reason')).toBe(true);

      apply(() => host.start.set(true));

      expect(text(startReveal())).toBe('Log progress');
      expect(startReveal().hasAttribute('data-reason')).toBe(false);
    });
  });

  describe('locking', () => {
    it('locks a drag to dx 12 with dy 2, follows it and calls setPointerCapture on the host', async () => {
      const { element, down, move, translate, endReveal, startReveal, stub } = await setup();
      const capture = vi.fn<(pointerId: number) => void>();

      stub('setPointerCapture', capture);
      down();
      move(12, 2);

      expect(translate()).toBe('12px');
      expect(capture).toHaveBeenCalledTimes(1);
      expect(capture).toHaveBeenCalledWith(1);
      expect(capture.mock.contexts[0]).toBe(element());
      expect(endReveal().hidden).toBe(false);
      expect(startReveal().hidden).toBe(true);

      move(30, 2);

      expect(translate()).toBe('30px');
      expect(capture).toHaveBeenCalledTimes(1);
    });

    it('still tracks where setPointerCapture does not exist, as in jsdom', async () => {
      const { down, move, translate } = await setup();

      down();
      move(12, 2);

      expect(translate()).toBe('12px');
      expect(errors).toEqual([]);
    });

    it('still tracks when setPointerCapture throws a NotFoundError', async () => {
      const { down, move, translate, stub } = await setup();
      const capture = vi.fn<(pointerId: number) => void>(() => {
        throw new DOMException('The pointer is not active.', 'NotFoundError');
      });

      stub('setPointerCapture', capture);
      down();
      move(12, 2);

      expect(capture).toHaveBeenCalledTimes(1);
      expect(translate()).toBe('12px');
      expect(errors).toEqual([]);

      move(40, 2);

      expect(translate()).toBe('40px');
    });

    it('moves nothing for a drag to dx 5 with dy 3, and does not capture the pointer', async () => {
      const { down, move, translate, endReveal, startReveal, stub } = await setup();
      const capture = vi.fn<(pointerId: number) => void>();

      stub('setPointerCapture', capture);
      down();
      move(5, 3);

      expect(translate()).toBe('');
      expect(endReveal().hidden).toBe(true);
      expect(startReveal().hidden).toBe(true);
      expect(capture).not.toHaveBeenCalled();
    });

    it('locks once a pending drag passes the slop, and follows it from that move', async () => {
      const { down, move, translate } = await setup();

      down();
      move(5, 3);
      move(14, 3);

      expect(translate()).toBe('14px');
    });

    it('abandons a drag that scrolls (dx 3, dy 70), so a later dx 200 moves nothing', async () => {
      const { down, move, translate, stub } = await setup();
      const capture = vi.fn<(pointerId: number) => void>();

      stub('setPointerCapture', capture);
      down();
      move(3, 70);
      move(200, 70);

      expect(translate()).toBe('');
      expect(capture).not.toHaveBeenCalled();
    });

    it('stays abandoned for a horizontal move after a vertical one, until the next pointerdown', async () => {
      const { down, move, up, translate, plays, activate } = await setup();

      down();
      move(3, 70);
      move(200, 0);
      up(200, 0);

      const clicked = await activate();

      expect(translate()).toBe('');
      expect(plays).toEqual([]);
      expect(clicked.reachedDocument).toBe(true);

      down();
      move(12, 2);

      expect(translate()).toBe('12px');
    });

    it('ignores a drag when neither direction has an action', async () => {
      const { down, move, translate } = await setup({ start: false, end: false });

      down();
      move(50, 0);

      expect(translate()).toBe('');
    });
  });

  describe('tracking', () => {
    it.each([
      { name: 'toward the end', dx: 100, shown: 'end' },
      { name: 'toward the start', dx: -100, shown: 'start' },
    ])('follows an enabled direction one to one $name', async ({ dx, shown }) => {
      const { down, move, translate, endReveal, startReveal } = await setup();

      down();
      move(dx, 0);

      expect(translate()).toBe(`${dx}px`);
      expect(endReveal().hidden).toBe(shown !== 'end');
      expect(startReveal().hidden).toBe(shown !== 'start');
    });

    it('shows the reveal for the sign of dx, and neither at dx 0', async () => {
      const { down, move, translate, endReveal, startReveal } = await setup();

      down();
      move(12, 2);

      expect(endReveal().hidden).toBe(false);
      expect(startReveal().hidden).toBe(true);

      move(-12, 2);

      expect(translate()).toBe('-12px');
      expect(endReveal().hidden).toBe(true);
      expect(startReveal().hidden).toBe(false);

      move(0, 2);

      expect(translate()).toBe('0px');
      expect(endReveal().hidden).toBe(true);
      expect(startReveal().hidden).toBe(true);
    });

    it.each([
      { dx: -40, offset: '-10px' },
      { dx: -200, offset: '-32px' },
    ])('rubber-bands a disabled start: dx $dx gives $offset', async ({ dx, offset }) => {
      const { down, move, translate, startReveal, endReveal } = await setup({ start: false });

      down();
      move(dx, 0);

      expect(translate()).toBe(offset);
      expect(startReveal().hidden).toBe(false);
      expect(endReveal().hidden).toBe(true);
    });

    it.each([
      { dx: 40, offset: '10px' },
      { dx: 200, offset: '32px' },
    ])('rubber-bands a disabled end: dx $dx gives $offset', async ({ dx, offset }) => {
      const { down, move, translate, startReveal, endReveal } = await setup({ end: false });

      down();
      move(dx, 0);

      expect(translate()).toBe(offset);
      expect(endReveal().hidden).toBe(false);
      expect(startReveal().hidden).toBe(true);
    });

    it('rubber-bands a disabled start through the whole drag: -40 then -200', async () => {
      const { down, move, translate } = await setup({ start: false });

      down();
      move(-40, 0);

      expect(translate()).toBe('-10px');

      move(-200, 0);

      expect(translate()).toBe('-32px');
    });
  });

  describe('armed state', () => {
    it('arms with a tick past the commit distance, disarms with a tick, and ticks only on a change', async () => {
      const { down, move, armed, haptics } = await setup();

      down();
      move(160);

      expect(armed()).toBe(true);
      expect(haptics.tick).toHaveBeenCalledTimes(1);

      move(140);

      expect(armed()).toBe(false);
      expect(haptics.tick).toHaveBeenCalledTimes(2);

      move(200);

      expect(armed()).toBe(true);
      expect(haptics.tick).toHaveBeenCalledTimes(3);

      move(220);

      expect(armed()).toBe(true);
      expect(haptics.tick).toHaveBeenCalledTimes(3);
    });

    it('arms toward the start as well', async () => {
      const { down, move, armed, haptics } = await setup();

      down();
      move(-160);

      expect(armed()).toBe(true);
      expect(haptics.tick).toHaveBeenCalledTimes(1);

      move(-100);

      expect(armed()).toBe(false);
      expect(haptics.tick).toHaveBeenCalledTimes(2);
    });

    it('never arms or ticks toward a disabled start', async () => {
      const { down, move, armed, haptics } = await setup({ start: false });

      down();
      move(-200);

      expect(armed()).toBe(false);

      move(-100);

      expect(armed()).toBe(false);
      expect(haptics.tick).not.toHaveBeenCalled();
    });

    it('never arms or ticks toward a disabled end', async () => {
      const { down, move, armed, haptics } = await setup({ end: false });

      down();
      move(200);

      expect(armed()).toBe(false);
      expect(haptics.tick).not.toHaveBeenCalled();
    });

    it('does not arm for a fast drag short of the distance, because arming ignores velocity', async () => {
      const { down, move, armed, haptics } = await setup();

      at(0);
      down();
      at(40);
      move(40);
      at(80);
      move(70);

      expect(armed()).toBe(false);
      expect(haptics.tick).not.toHaveBeenCalled();
    });
  });

  describe('release', () => {
    it('commits to the end past the distance: slides out, and emits only once the slide has ended', async () => {
      const { host, down, move, up, onlyPlay, surface, release, settle, handleError } =
        await setup();

      at(0);
      down();
      at(100);
      move(100);
      at(200);
      move(160);
      at(600);
      up(160);

      const played = onlyPlay();

      expect(played.el).toBe(surface());
      expect(played.keyframes).toEqual(keyframes('160px', '380px'));
      expect(played.options).toEqual(COMMIT_OPTIONS);
      expect(played.translate).toBe('380px');
      expect(host.ends).toEqual([]);

      await tick();

      expect(host.ends).toEqual([]);

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
      expect(host.starts).toEqual([]);
      expect(handleError).not.toHaveBeenCalled();
    });

    it('springs back just short of the distance (dx 151) and emits nothing', async () => {
      const { host, down, move, up, onlyPlay, surface, translate, release, settle } = await setup();

      at(0);
      down();
      at(100);
      move(100);
      at(200);
      move(151);
      at(600);
      up(151);

      const played = onlyPlay();

      expect(played.el).toBe(surface());
      expect(played.keyframes).toEqual(keyframes('151px', '0px'));
      expect(played.options).toEqual(SPRING_OPTIONS);
      expect(played.translate).toBe('');

      release();
      await settle();

      expect(host.ends).toEqual([]);
      expect(host.starts).toEqual([]);
      expect(translate()).toBe('');
    });

    it('commits a fling that is short of the distance: 70px in 90ms', async () => {
      const { host, down, move, up, onlyPlay, release, settle, haptics } = await setup();

      at(0);
      down();
      at(40);
      move(40);
      at(80);
      move(70);
      at(90);
      up(70);

      expect(onlyPlay().keyframes).toEqual(keyframes('70px', '380px'));
      expect(onlyPlay().options).toEqual(COMMIT_OPTIONS);
      expect(haptics.tick).not.toHaveBeenCalled();

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
    });

    it('commits a fling toward the start, which springs back and then emits commitStart', async () => {
      const { host, down, move, up, onlyPlay, release, settle } = await setup();

      at(0);
      down();
      at(40);
      move(-40);
      at(80);
      move(-70);
      at(90);
      up(-70);

      expect(onlyPlay().keyframes).toEqual(keyframes('-70px', '0px'));
      expect(onlyPlay().options).toEqual(SPRING_OPTIONS);

      release();
      await settle();

      expect(host.starts).toEqual(['task-a']);
      expect(host.ends).toEqual([]);
    });

    it('does not commit a slow drag of the same length', async () => {
      const { host, down, move, up, onlyPlay, release, settle } = await setup();

      at(0);
      down();
      at(500);
      move(30);
      at(1000);
      move(70);
      up(70);

      expect(onlyPlay().keyframes).toEqual(keyframes('70px', '0px'));

      release();
      await settle();

      expect(host.ends).toEqual([]);
    });

    it('decides on the release position, which counts as a sample for the velocity', async () => {
      const { host, down, move, up, onlyPlay, release, settle } = await setup();

      at(0);
      down();
      at(40);
      move(40);
      at(80);
      move(50);
      at(90);
      up(90);

      expect(onlyPlay().keyframes).toEqual(keyframes('90px', '380px'));

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
    });

    it('commits toward the start only after the spring-back has ended (dx -160)', async () => {
      const { host, down, move, up, onlyPlay, surface, translate, release, settle } = await setup();

      at(0);
      down();
      at(100);
      move(-100);

      expect(translate()).toBe('-100px');

      at(200);
      move(-160);
      at(600);
      up(-160);

      const played = onlyPlay();

      expect(played.el).toBe(surface());
      expect(played.keyframes).toEqual(keyframes('-160px', '0px'));
      expect(played.options).toEqual(SPRING_OPTIONS);
      expect(played.translate).toBe('');
      expect(host.starts).toEqual([]);

      await tick();

      expect(host.starts).toEqual([]);

      release();
      await settle();

      expect(host.starts).toEqual(['task-a']);
      expect(host.ends).toEqual([]);
      expect(translate()).toBe('');
    });

    it('springs back from the rubber-banded offset and emits nothing when the start is disabled', async () => {
      const { host, down, move, up, onlyPlay, startReveal, release, settle } = await setup({
        start: false,
      });

      at(0);
      down();
      at(100);
      move(-40);
      at(200);
      move(-200);
      at(600);
      up(-200);

      expect(onlyPlay().keyframes).toEqual(keyframes('-32px', '0px'));
      expect(onlyPlay().options).toEqual(SPRING_OPTIONS);
      expect(startReveal().hidden).toBe(false);

      release();
      await settle();

      expect(host.starts).toEqual([]);
      expect(host.ends).toEqual([]);
    });

    it('springs back and emits nothing when the end is disabled', async () => {
      const { host, drag, onlyPlay, release, settle } = await setup({ end: false });

      drag(200);

      expect(onlyPlay().keyframes).toEqual(keyframes('32px', '0px'));

      release();
      await settle();

      expect(host.ends).toEqual([]);
    });

    it('commits against the width the host had at pointerdown', async () => {
      const { host, drag, onlyPlay, release, settle } = await setup({ width: 200 });

      drag(90);

      expect(onlyPlay().keyframes).toEqual(keyframes('90px', '200px'));

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
    });

    it('emits the Task id the host carried at pointerdown', async () => {
      const { host, apply, drag, release, settle } = await setup();

      apply(() => host.id.set('task-b'));
      drag(160);
      release();
      await settle();

      expect(host.ends).toEqual(['task-b']);
    });

    it('does nothing at pointerup for a press that never locked, and a new gesture starts at once', async () => {
      const { host, down, move, up, plays, translate, activate } = await setup();

      down();
      move(5, 3);
      up(5, 3);

      const clicked = await activate();

      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);
      expect(host.starts).toEqual([]);
      expect(clicked.reachedDocument).toBe(true);

      down();
      move(12, 2);

      expect(translate()).toBe('12px');
    });

    it('does nothing at pointerup for a tap with no movement at all', async () => {
      const { host, down, up, plays, url, activate } = await setup();

      down();
      up(0);

      const clicked = await activate();

      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);
      expect(clicked.reachedDocument).toBe(true);
      expect(url()).toBe('/task');
    });
  });

  describe('click suppression', () => {
    it('lets a click through when there was no swipe', async () => {
      const { activate, url } = await setup();

      const clicked = await activate();

      expect(clicked.reachedDocument).toBe(true);
      expect(url()).toBe('/task');
    });

    it('swallows the click that follows a locked gesture that sprang back', async () => {
      const { drag, activate, url } = await setup();

      drag(12);

      const clicked = await activate();

      expect(clicked.defaultPrevented).toBe(true);
      expect(clicked.reachedDocument).toBe(false);
      expect(url()).toBe('/');
    });

    it('swallows the click that follows a commit', async () => {
      const { drag, activate, url } = await setup();

      drag(160);

      const clicked = await activate();

      expect(clicked.defaultPrevented).toBe(true);
      expect(clicked.reachedDocument).toBe(false);
      expect(url()).toBe('/');
    });

    it('swallows one click only: the next one navigates', async () => {
      const { drag, activate, url } = await setup();

      drag(12);
      await activate();

      expect(url()).toBe('/');

      const second = await activate();

      expect(second.reachedDocument).toBe(true);
      expect(url()).toBe('/task');
    });

    it.each([
      { name: 'while the spring-back is still playing', settled: false },
      { name: 'after the spring-back has ended', settled: true },
    ])('lets the click through after a new pointerdown $name', async ({ settled }) => {
      const { drag, down, release, settle, activate, url } = await setup();

      drag(12);

      if (settled) {
        release();
        await settle();
      }

      down();

      const clicked = await activate();

      expect(clicked.reachedDocument).toBe(true);
      expect(url()).toBe('/task');
    });

    it.each([
      { elapsed: CLICK_SUPPRESS_MS - 1, suppressed: true },
      { elapsed: CLICK_SUPPRESS_MS, suppressed: false },
    ])(
      'stops swallowing after $elapsed ms (swallowed: $suppressed)',
      async ({ elapsed, suppressed }) => {
        const { drag, click, url } = await setup();

        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        drag(12);
        await vi.advanceTimersByTimeAsync(elapsed);

        const clicked = click();

        for (let round = 0; round < 3; round += 1) {
          await vi.advanceTimersByTimeAsync(0);
        }

        expect(clicked.reachedDocument).toBe(!suppressed);
        expect(url()).toBe(suppressed ? '/' : '/task');
      },
    );

    it('clears the suppression timer when the view is destroyed', async () => {
      const { fixture, drag } = await setup();

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

      const before = vi.getTimerCount();

      drag(12);

      const armed = vi.getTimerCount();

      expect(armed).toBeGreaterThan(before);

      fixture.destroy();

      expect(vi.getTimerCount()).toBeLessThan(armed);
    });
  });

  describe('cancel', () => {
    it('springs back from the last tracked offset and emits nothing, even when armed', async () => {
      const { host, down, move, cancel, onlyPlay, surface, armed, translate, release, settle } =
        await setup();

      at(0);
      down();
      at(100);
      move(160);

      expect(armed()).toBe(true);

      at(200);
      cancel();

      const played = onlyPlay();

      expect(played.el).toBe(surface());
      expect(played.keyframes).toEqual(keyframes('160px', '0px'));
      expect(played.options).toEqual(SPRING_OPTIONS);
      expect(played.translate).toBe('');
      expect(host.ends).toEqual([]);

      release();
      await settle();

      expect(host.ends).toEqual([]);
      expect(host.starts).toEqual([]);
      expect(translate()).toBe('');
    });

    it('lets the click that follows a cancelled gesture through', async () => {
      const { down, move, cancel, activate, url } = await setup();

      down();
      move(160);
      cancel();

      const clicked = await activate();

      expect(clicked.reachedDocument).toBe(true);
      expect(url()).toBe('/task');
    });

    it('resets the armed state and the reveals once the spring-back has ended', async () => {
      const { down, move, cancel, release, settle, armed, translate, endReveal, startReveal } =
        await setup();

      down();
      move(160);
      cancel();
      release();
      await settle();

      expect(armed()).toBe(false);
      expect(translate()).toBe('');
      expect(endReveal().hidden).toBe(true);
      expect(startReveal().hidden).toBe(true);
    });

    it('springs back a cancelled gesture toward the start without emitting commitStart', async () => {
      const { host, down, move, cancel, onlyPlay, release, settle } = await setup();

      down();
      move(-160);
      cancel();

      expect(onlyPlay().keyframes).toEqual(keyframes('-160px', '0px'));

      release();
      await settle();

      expect(host.starts).toEqual([]);
    });

    it('clears a gesture that scrolled, without playing: dx 3, dy 70, then a new gesture tracks at once', async () => {
      const { down, move, cancel, plays, translate } = await setup();

      down();
      move(3, 70);
      cancel();

      expect(plays).toEqual([]);

      down();
      move(12, 2);

      expect(translate()).toBe('12px');
    });

    it('clears a gesture that never locked, without playing, and a new gesture tracks at once', async () => {
      const { host, down, move, cancel, plays, translate } = await setup();

      down();
      move(5, 3);
      cancel();

      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);

      down();
      move(12, 2);

      expect(translate()).toBe('12px');
    });

    it('does nothing for a pointercancel with no gesture', async () => {
      const { host, cancel, plays, translate } = await setup();

      cancel();

      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);
      expect(translate()).toBe('');
    });

    it('does nothing for a pointercancel of another pointer, and keeps tracking', async () => {
      const { down, move, cancel, plays, translate } = await setup();

      down();
      move(12, 2);
      cancel({ pointerId: 2 });

      expect(plays).toEqual([]);

      move(40, 2);

      expect(translate()).toBe('40px');
    });
  });

  describe('guards', () => {
    it('ignores a mouse: no translate, nothing emitted, and the click navigates', async () => {
      const { host, drag, plays, translate, activate, url } = await setup();

      drag(200, MOUSE);

      expect(translate()).toBe('');
      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);

      const clicked = await activate();

      expect(clicked.reachedDocument).toBe(true);
      expect(url()).toBe('/task');
    });

    it('commits a pen drag of 160', async () => {
      const { host, drag, onlyPlay, release, settle } = await setup();

      drag(160, PEN);

      expect(onlyPlay().keyframes).toEqual(keyframes('160px', '380px'));

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
    });

    it('ignores a drag while the host is disabled, and follows the input when it is enabled again', async () => {
      const { host, apply, drag, down, move, plays, translate } = await setup({ disabled: true });

      drag(160);

      expect(translate()).toBe('');
      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);

      apply(() => host.disabled.set(false));
      down();
      move(40);

      expect(translate()).toBe('40px');
    });

    it('ignores a drag in Voice only, reading the theme at pointerdown', async () => {
      const { host, drag, down, move, plays, translate } = await setup();

      document.documentElement.setAttribute('data-theme', ThemeName.Drive);
      drag(160);

      expect(translate()).toBe('');
      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);

      document.documentElement.removeAttribute('data-theme');
      down();
      move(40);

      expect(translate()).toBe('40px');
    });

    it('ignores a drag that starts in the input, and the next drag on the row tracks', async () => {
      const { host, input, down, move, up, plays, translate } = await setup();

      down(START_X, START_Y, {}, input());
      move(200);
      up(200);

      expect(translate()).toBe('');
      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);

      down();
      move(40);

      expect(translate()).toBe('40px');
    });

    it.each([
      { tag: 'textarea', nested: false },
      { tag: 'select', nested: false },
      { tag: 'asys-log-progress-form', nested: true },
    ])('ignores a drag that starts in a $tag', async ({ tag, nested }) => {
      const { surface, down, move, plays, translate } = await setup();
      const field = document.createElement(tag);
      const inner = document.createElement('span');

      field.append(inner);
      surface().append(field);

      down(START_X, START_Y, {}, nested ? inner : field);
      move(200);

      expect(translate()).toBe('');
      expect(plays).toEqual([]);
    });

    it('ignores a drag that starts less than the dead zone from the left edge', async () => {
      const { down, move, translate } = await setup();

      down(EDGE_DEAD_ZONE_PX - 1);
      move(50);

      expect(translate()).toBe('');
    });

    it('tracks a drag that starts exactly at the dead zone', async () => {
      const { down, move, translate } = await setup();

      down(EDGE_DEAD_ZONE_PX);
      move(50);

      expect(translate()).toBe('50px');
    });

    it('ignores a drag that starts less than the dead zone from the right edge', async () => {
      const { down, move, translate } = await setup();

      down(window.innerWidth - (EDGE_DEAD_ZONE_PX - 1));
      move(-50);

      expect(translate()).toBe('');
    });

    it('tracks a drag that starts exactly the dead zone from the right edge', async () => {
      const { down, move, translate } = await setup();

      down(window.innerWidth - EDGE_DEAD_ZONE_PX);
      move(-50);

      expect(translate()).toBe('-50px');
    });

    it('abandons a gesture when a second finger lands before the lock (a pinch)', async () => {
      const { raw, down, move, up, cancel, plays, translate } = await setup();

      down();
      raw('pointerdown', 150, 60, SECOND_FINGER);
      move(200);

      expect(translate()).toBe('');

      up(200);
      cancel();

      expect(plays).toEqual([]);
    });

    it('never starts a gesture from a pointerdown that is not primary', async () => {
      const { down, move, translate } = await setup();

      down(START_X, START_Y, { isPrimary: false });
      move(200);

      expect(translate()).toBe('');

      down(START_X, START_Y, SECOND_FINGER);
      move(200, 0, SECOND_FINGER);

      expect(translate()).toBe('');
    });

    it('ignores a second finger that lands while the gesture is locked, and keeps tracking', async () => {
      const { raw, down, move, up, onlyPlay, translate, release, settle, host } = await setup();

      down();
      move(12, 2);
      raw('pointerdown', 150, 60, SECOND_FINGER);
      move(160);

      expect(translate()).toBe('160px');

      up(160);

      expect(onlyPlay().keyframes).toEqual(keyframes('160px', '380px'));

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
    });

    it('ignores the moves of another pointer, before and after the lock', async () => {
      const { raw, down, move, translate } = await setup();

      down();
      raw('pointermove', START_X + 200, START_Y, { pointerId: 2 });

      expect(translate()).toBe('');

      move(12, 2);
      raw('pointermove', START_X + 200, START_Y, { pointerId: 2 });

      expect(translate()).toBe('12px');
    });

    it('ignores a pointerup of another pointer, and the gesture ends with its own', async () => {
      const { host, raw, down, move, up, plays, onlyPlay, release, settle } = await setup();

      down();
      move(160);
      raw('pointerup', START_X + 160, START_Y, { pointerId: 2 });

      expect(plays).toEqual([]);

      up(160);

      expect(onlyPlay().keyframes).toEqual(keyframes('160px', '380px'));

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
    });

    it('ignores moves, releases and clicks of a pointer that never went down', async () => {
      const { host, raw, plays, translate, activate, url } = await setup();

      raw('pointermove', START_X + 200, START_Y);
      raw('pointerup', START_X + 200, START_Y);

      expect(translate()).toBe('');
      expect(plays).toEqual([]);
      expect(host.ends).toEqual([]);

      const clicked = await activate();

      expect(clicked.reachedDocument).toBe(true);
      expect(url()).toBe('/task');
    });

    it('moves nothing for a new pointerdown and drag while a commit is still sliding out', async () => {
      const { host, drag, down, move, up, plays, surface, translate, release, settle } =
        await setup();

      drag(160);

      expect(translate()).toBe('380px');

      down();
      move(50);

      expect(surface().style.translate).toBe('380px');

      up(50);

      expect(surface().style.translate).toBe('380px');
      expect(plays).toHaveLength(1);

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
      expect(translate()).toBe('');
    });

    it('still disarms click suppression for a pointerdown that is ignored while settling', async () => {
      const { drag, down, activate, url } = await setup();

      drag(160);
      down();

      const clicked = await activate();

      expect(clicked.reachedDocument).toBe(true);
      expect(url()).toBe('/task');
    });
  });

  describe('reduced motion', () => {
    it('still tracks and emits one settle after the release when play resolves at once', async () => {
      const { host, drag, translate, plays, settle, haptics } = await setup({ reduced: true });

      drag(160);

      expect(plays).toHaveLength(1);
      expect(must(plays[0]).translate).toBe('380px');

      await settle();

      expect(host.ends).toEqual(['task-a']);
      expect(translate()).toBe('');
      expect(haptics.tick).toHaveBeenCalledTimes(1);
    });

    it('tracks the drag while motion is off', async () => {
      const { down, move, translate } = await setup({ reduced: true });

      down();
      move(40);

      expect(translate()).toBe('40px');
    });

    it('emits commitStart after the spring-back when play resolves at once', async () => {
      const { host, drag, settle } = await setup({ reduced: true });

      drag(-160);
      await settle();

      expect(host.starts).toEqual(['task-a']);
    });
  });

  describe('reset', () => {
    it('clears the offset, the reveals and the armed state after the emit, without another tick', async () => {
      const { host, drag, release, settle, translate, armed, endReveal, startReveal, haptics } =
        await setup();

      drag(160);

      expect(armed()).toBe(true);

      release();
      await settle();

      expect(host.ends).toEqual(['task-a']);
      expect(translate()).toBe('');
      expect(endReveal().hidden).toBe(true);
      expect(startReveal().hidden).toBe(true);
      expect(armed()).toBe(false);
      expect(haptics.tick).toHaveBeenCalledTimes(1);
    });

    it('clears everything after a spring-back too', async () => {
      const { drag, release, settle, translate, armed, endReveal, startReveal } = await setup();

      drag(12);
      release();
      await settle();

      expect(translate()).toBe('');
      expect(armed()).toBe(false);
      expect(endReveal().hidden).toBe(true);
      expect(startReveal().hidden).toBe(true);
    });

    it('takes a new gesture after the reset', async () => {
      const { host, drag, release, renew, settle } = await setup();

      drag(160);
      release();
      await settle();
      renew();
      drag(160);
      release();
      await settle();

      expect(host.ends).toEqual(['task-a', 'task-a']);
    });
  });

  describe('a Task that changes under the gesture', () => {
    it.each([
      { name: 'toward the end', dx: 160 },
      { name: 'toward the start', dx: -160 },
    ])(
      'springs back and emits nothing when the id changes before the release, $name',
      async ({ dx }) => {
        const { host, apply, down, move, up, onlyPlay, translate, release, settle } = await setup();

        at(0);
        down();
        at(100);
        move(dx / 1.6);
        apply(() => host.id.set('task-b'));
        at(200);
        move(dx);
        at(600);
        up(dx);

        const played = onlyPlay();

        expect(played.keyframes).toEqual(keyframes(`${dx}px`, '0px'));
        expect(played.options).toEqual(SPRING_OPTIONS);
        expect(played.translate).toBe('');

        release();
        await settle();

        expect(host.ends).toEqual([]);
        expect(host.starts).toEqual([]);
        expect(translate()).toBe('');
      },
    );

    it('emits nothing and resets at once when the id changes while the commit slides out', async () => {
      const { host, apply, drag, release, settle, translate, armed, endReveal } = await setup();

      drag(160);

      expect(translate()).toBe('380px');

      apply(() => host.id.set('task-b'));
      release();
      await settle();

      expect(host.ends).toEqual([]);
      expect(translate()).toBe('');
      expect(armed()).toBe(false);
      expect(endReveal().hidden).toBe(true);
    });

    it('emits nothing and resets when the id changes while the spring-back before commitStart plays', async () => {
      const { host, apply, drag, release, settle, translate } = await setup();

      drag(-160);
      apply(() => host.id.set('task-b'));
      release();
      await settle();

      expect(host.starts).toEqual([]);
      expect(translate()).toBe('');
    });

    it('takes a new gesture after the id changed under the last one', async () => {
      const { host, apply, drag, release, renew, settle } = await setup();

      drag(160);
      apply(() => host.id.set('task-b'));
      release();
      await settle();
      renew();
      drag(160);
      release();
      await settle();

      expect(host.ends).toEqual(['task-b']);
    });
  });

  describe('destroy', () => {
    it('emits nothing, and throws nothing, when the commit resolves after the view was destroyed', async () => {
      const { fixture, host, drag, release, handleError } = await setup();

      drag(160);
      fixture.destroy();
      release();
      await tick();

      expect(host.ends).toEqual([]);
      expect(handleError).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('emits nothing when the spring-back before commitStart resolves after the view was destroyed', async () => {
      const { fixture, host, drag, release, handleError } = await setup();

      drag(-160);
      fixture.destroy();
      release();
      await tick();

      expect(host.starts).toEqual([]);
      expect(handleError).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('removes its pointer listeners', async () => {
      const { fixture, surface, anchor, down, move } = await setup();
      const area = surface();
      const row = anchor();

      fixture.destroy();
      down(START_X, START_Y, {}, row);
      move(200);

      expect(area.style.translate).toBe('');
    });

    it('removes its click listener, so a click after a swipe is no longer swallowed', async () => {
      const { fixture, surface, anchor, drag } = await setup();
      const area = surface();
      const row = anchor();
      const seen: Event[] = [];

      area.addEventListener('click', (event) => {
        seen.push(event);
        event.preventDefault();
      });
      drag(12);
      fixture.destroy();
      row.click();

      expect(seen).toHaveLength(1);
    });
  });
});
