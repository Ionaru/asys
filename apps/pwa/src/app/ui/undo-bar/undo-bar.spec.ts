// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { Activation } from '../activation/activation';
import { UndoBar, UndoBarVariant } from './undo-bar';

@Component({
  imports: [UndoBar],
  template: `
    <asys-undo-bar
      [variant]="variant()"
      [title]="title()"
      [detail]="detail()"
      [canRetry]="canRetry()"
      [windowMs]="windowMs()"
      [remainingMs]="remainingMs()"
      [windowKey]="windowKey()"
      (undo)="onUndo($event)"
      (retry)="onRetry($event)"
      (dismiss)="onDismiss($event)"
      (escape)="onEscape($event)"
      (pointerInside)="pointer.push($event)"
      (focusInside)="focus.push($event)"
    />
  `,
})
class Host {
  readonly bar = viewChild.required(UndoBar);

  readonly variant = signal(UndoBarVariant.Done);

  readonly title = signal('Pay the invoice');

  readonly detail = signal<string | null>(null);

  readonly canRetry = signal(false);

  readonly windowMs = signal(5000);

  readonly remainingMs = signal<number | null>(null);

  readonly windowKey = signal<string | null>('task-1');

  undos = 0;

  escapes = 0;

  /** What `undo` and `escape` emitted: they carry no payload, so every entry is `undefined`. */
  readonly voidPayloads: unknown[] = [];

  /** The payloads `retry` and `dismiss` emitted, in order. */
  readonly retryPayloads: Activation[] = [];

  readonly dismissPayloads: Activation[] = [];

  readonly pointer: boolean[] = [];

  readonly focus: boolean[] = [];

  onUndo(payload: unknown): void {
    this.undos += 1;
    this.voidPayloads.push(payload);
  }

  onEscape(payload: unknown): void {
    this.escapes += 1;
    this.voidPayloads.push(payload);
  }

  onRetry(payload: Activation): void {
    this.retryPayloads.push(payload);
  }

  onDismiss(payload: Activation): void {
    this.dismissPayloads.push(payload);
  }
}

/** A bar with neither `windowMs` nor `remainingMs` bound, to see their defaults. */
@Component({
  imports: [UndoBar],
  template: `<asys-undo-bar [variant]="variant" title="Pay the invoice" />`,
})
class BareHost {
  protected readonly variant = UndoBarVariant.Done;
}

const NOT_SENT = 'ASYS cannot reach the server. Try again.';

const DURATION = '--asys-undo-duration';

const DELAY = '--asys-undo-delay';

/** No delay, however the bar spells a zero: `0ms` or `-0ms`. */
const NO_DELAY = /^-?0ms$/;

const REVIEW_SENTENCE = 'That no longer applied, so it waits in the Inbox as a Review item.';

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

/** A pointer press: `HTMLElement.click()` has `detail` 0, which reads as a keyboard activation. */
const pointerClick = (element: HTMLElement, detail = 1): void => {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
};

const setup = async (variant = UndoBarVariant.Done) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.variant.set(variant);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const bar = (): HTMLElement => must(fixture.nativeElement.querySelector('asys-undo-bar'));
  const q = <T extends HTMLElement>(selector: string): T | null => bar().querySelector<T>(selector);
  const buttons = (): HTMLButtonElement[] => Array.from(bar().querySelectorAll('button'));
  const button = (label: string): HTMLButtonElement | undefined =>
    buttons().find((b) => b.textContent?.trim() === label);
  const labels = (): (string | undefined)[] => buttons().map((b) => b.textContent?.trim());
  const text = (selector: string): string | undefined =>
    q(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  /** A custom property of the host's inline style, such as the ring's duration. */
  const style = (name: string): string => bar().style.getPropertyValue(name).trim();
  /** Which of `classNames` each direct child of the bar carries, in document order. */
  const order = (...classNames: string[]): (string | undefined)[] =>
    Array.from(bar().children).map((child) =>
      classNames.find((className) => child.classList.contains(className)),
    );
  const update = async (change: () => void): Promise<void> => {
    change();
    await fixture.whenStable();
  };
  const keydown = (init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

    target.dispatchEvent(event);

    return event;
  };

  return { fixture, host, bar, q, buttons, button, labels, text, style, order, update, keydown };
};

describe('UndoBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('puts the class asys-undo on its host, and not the old asys-undobar', async () => {
    const { bar } = await setup();

    expect(bar().classList.contains('asys-undo')).toBe(true);
    expect(bar().classList.contains('asys-undobar')).toBe(false);
  });

  describe('the Done variant', () => {
    it('lays out the check, the text and the Undo button in that order', async () => {
      const { order } = await setup();

      expect(order('asys-undo__check', 'asys-undo__text', 'asys-undo__button')).toEqual([
        'asys-undo__check',
        'asys-undo__text',
        'asys-undo__button',
      ]);
    });

    it('draws the check as an aria-hidden Icon with the check glyph', async () => {
      const { q } = await setup();

      const check = q('asys-icon.asys-undo__check');

      expect(check).not.toBeNull();
      expect(check?.getAttribute('aria-hidden')).toBe('true');
      expect(check?.querySelector('svg[data-icon="check"]')).not.toBeNull();
    });

    it('shows Done, then the title, in one block of text', async () => {
      const { q, text } = await setup();

      const status = must(q('.asys-undo__status'));
      const title = must(q('.asys-undo__title'));

      expect(text('.asys-undo__status')).toBe('Done');
      expect(text('.asys-undo__title')).toBe('Pay the invoice');
      expect(status.closest('.asys-undo__text')).not.toBeNull();
      expect(title.closest('.asys-undo__text')).toBe(status.closest('.asys-undo__text'));
      expect(status.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows Undo as its only button, a Secondary one', async () => {
      const { labels, button } = await setup();

      expect(labels()).toEqual(['Undo']);
      expect(button('Undo')?.type).toBe('button');
      expect(button('Undo')?.classList.contains('asys-button--secondary')).toBe(true);
      expect(button('Undo')?.classList.contains('asys-button--quiet')).toBe(false);
      expect(button('Undo')?.classList.contains('asys-undo__button')).toBe(true);
    });

    it('names the button Undo Done and the title, while its text stays Undo', async () => {
      const { button } = await setup();

      expect(button('Undo')?.getAttribute('aria-label')).toBe('Undo Done: Pay the invoice');
      expect(button('Undo')?.textContent?.trim()).toBe('Undo');
    });

    it('draws the timer inside the button, hidden from screen readers, as a ring and a fill', async () => {
      const { q, button } = await setup();

      const timer = q('span.asys-undo__timer');
      const svg = timer?.querySelector('svg');
      const ring = timer?.querySelector('circle.asys-undo__ring');
      const fill = timer?.querySelector('circle.asys-undo__fill');

      expect(timer).not.toBeNull();
      expect(timer?.getAttribute('aria-hidden')).toBe('true');
      expect(button('Undo')?.contains(timer ?? null)).toBe(true);
      expect(svg?.getAttribute('viewBox')).toBe('0 0 20 20');
      expect(ring).not.toBeNull();
      expect(fill).not.toBeNull();
      expect(ring?.getAttribute('r')).toBe('9');
      expect(fill?.getAttribute('r')).toBe('3.25');
      expect(fill?.getAttribute('pathLength')).toBe('100');
      expect(timer?.querySelectorAll('circle')).toHaveLength(2);
    });

    it('shows no failure text, detail or Try again icon', async () => {
      const { bar, q } = await setup();

      expect(bar().textContent).not.toContain('is not Done');
      expect(q('.asys-undo__text--failed')).toBeNull();
      expect(q('.asys-undo__detail')).toBeNull();
      expect(q('svg[data-icon="rotate-right"]')).toBeNull();
    });

    it('follows the title input, in the text and in the button name', async () => {
      const { host, update, text, button } = await setup();

      await update(() => host.title.set('Call Marit'));

      expect(text('.asys-undo__title')).toBe('Call Marit');
      expect(button('Undo')?.getAttribute('aria-label')).toBe('Undo Done: Call Marit');
    });

    it('emits undo when Undo is clicked, and nothing else', async () => {
      const { host, button, fixture } = await setup();

      button('Undo')?.click();
      await fixture.whenStable();

      expect(host.undos).toBe(1);
      expect(host.retryPayloads).toEqual([]);
      expect(host.dismissPayloads).toEqual([]);
    });

    it('emits undo without a payload, whether it was a keyboard or a pointer click', async () => {
      const { host, button, fixture } = await setup();

      button('Undo')?.click();
      pointerClick(must(button('Undo')));
      await fixture.whenStable();

      expect(host.voidPayloads).toEqual([undefined, undefined]);
    });

    it('emits undo when the press lands on the timer inside the button', async () => {
      const { host, q, fixture } = await setup();

      pointerClick(must(q('.asys-undo__timer')));
      await fixture.whenStable();

      expect(host.undos).toBe(1);
    });
  });

  describe('the ring timer', () => {
    it('runs for 5000 ms from the start when neither window nor remaining is bound', async () => {
      const fixture = TestBed.createComponent(BareHost);

      await fixture.whenStable();

      const bar: HTMLElement = fixture.nativeElement.querySelector('asys-undo-bar');

      expect(bar.style.getPropertyValue(DURATION).trim()).toBe('5000ms');
      expect(bar.style.getPropertyValue(DELAY).trim()).toMatch(NO_DELAY);
    });

    it('runs for the whole window with no delay for the default remaining of null', async () => {
      const { style } = await setup();

      expect(style(DURATION)).toBe('5000ms');
      expect(style(DELAY)).toMatch(NO_DELAY);
    });

    it('starts part-way round when part of the window is gone: 3000 ms left of 5000 delays by -2000 ms', async () => {
      const { host, update, style } = await setup();

      await update(() => host.remainingMs.set(3000));

      expect(style(DURATION)).toBe('5000ms');
      expect(style(DELAY)).toBe('-2000ms');
    });

    it.each([
      { windowMs: 5000, remainingMs: 1000, delay: '-4000ms' },
      { windowMs: 5000, remainingMs: 0, delay: '-5000ms' },
      { windowMs: 8000, remainingMs: 2500, delay: '-5500ms' },
    ])(
      'delays by $delay for $remainingMs ms left of a $windowMs ms window',
      async ({ windowMs, remainingMs, delay }) => {
        const { host, update, style } = await setup();

        await update(() => {
          host.windowMs.set(windowMs);
          host.remainingMs.set(remainingMs);
        });

        expect(style(DURATION)).toBe(`${windowMs}ms`);
        expect(style(DELAY)).toBe(delay);
      },
    );

    it.each([
      { windowMs: 5000, remainingMs: 5000 },
      { windowMs: 3000, remainingMs: null },
    ])(
      'has no delay when the whole $windowMs ms window is left ($remainingMs)',
      async ({ windowMs, remainingMs }) => {
        const { host, update, style } = await setup();

        await update(() => {
          host.windowMs.set(windowMs);
          host.remainingMs.set(remainingMs);
        });

        expect(style(DURATION)).toBe(`${windowMs}ms`);
        expect(style(DELAY)).toMatch(NO_DELAY);
      },
    );

    it('follows the inputs when they change', async () => {
      const { host, update, style } = await setup();

      await update(() => host.remainingMs.set(1000));

      expect(style(DELAY)).toBe('-4000ms');

      await update(() => host.remainingMs.set(null));

      expect(style(DELAY)).toMatch(NO_DELAY);
    });

    it('starts the running fill again when the window key changes, as when a second Done follows', async () => {
      const { host, q, update } = await setup();
      const fill = must(q<HTMLElement>('.asys-undo__fill'), 'fill') as unknown as SVGCircleElement;
      const animation = { currentTime: 2400 } as unknown as Animation;

      fill.getAnimations = () => [animation];

      await update(() => host.windowKey.set('task-2'));

      expect(animation.currentTime).toBe(0);
    });

    it('starts the running fill again when the time left changes', async () => {
      const { host, q, update } = await setup();
      const fill = must(q<HTMLElement>('.asys-undo__fill'), 'fill') as unknown as SVGCircleElement;
      const animation = { currentTime: 1200 } as unknown as Animation;

      fill.getAnimations = () => [animation];

      await update(() => host.remainingMs.set(3000));

      expect(animation.currentTime).toBe(0);
    });

    it('leaves the running fill alone when only the title changes', async () => {
      const { host, q, update } = await setup();
      const fill = must(q<HTMLElement>('.asys-undo__fill'), 'fill') as unknown as SVGCircleElement;
      const animation = { currentTime: 2400 } as unknown as Animation;

      fill.getAnimations = () => [animation];

      await update(() => host.title.set('Water the plants'));

      expect(animation.currentTime).toBe(2400);
    });

    it('is not paused to begin with', async () => {
      const { bar } = await setup();

      expect(bar().classList.contains('is-paused')).toBe(false);
    });

    it('pauses while the pointer is inside the bar and runs again when it leaves', async () => {
      const { bar, fixture } = await setup();

      bar().dispatchEvent(new Event('pointerenter'));
      await fixture.whenStable();

      expect(bar().classList.contains('is-paused')).toBe(true);

      bar().dispatchEvent(new Event('pointerleave'));
      await fixture.whenStable();

      expect(bar().classList.contains('is-paused')).toBe(false);
    });

    it('is not marked paused by focus alone, because :focus-within pauses the fill in CSS', async () => {
      const { bar, button, fixture } = await setup();

      must(button('Undo')).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await fixture.whenStable();

      expect(bar().classList.contains('is-paused')).toBe(false);
    });
  });

  describe('the Failed variant', () => {
    const failed = async (canRetry: boolean, detail: string | null = NOT_SENT) => {
      const setupResult = await setup(UndoBarVariant.Failed);

      await setupResult.update(() => {
        setupResult.host.detail.set(detail);
        setupResult.host.canRetry.set(canRetry);
      });

      return setupResult;
    };

    it('says the Task is not Done, in curly quotes, and gives the reason on its own line', async () => {
      const { text } = await failed(true);

      expect(text('p.asys-undo__text.asys-undo__text--failed')).toBe(
        '“Pay the invoice” is not Done.',
      );
      expect(text('p.asys-undo__detail')).toBe(NOT_SENT);
    });

    it('shows none of the Done layout: no check, status, title or timer', async () => {
      const { q } = await failed(true);

      expect(q('.asys-undo__check')).toBeNull();
      expect(q('.asys-undo__status')).toBeNull();
      expect(q('.asys-undo__title')).toBeNull();
      expect(q('.asys-undo__timer')).toBeNull();
      expect(q('.asys-undo__button')).toBeNull();
    });

    it('lays out the text, the reason, Try again and Dismiss in that order', async () => {
      const { order } = await failed(true);

      expect(order('asys-undo__text', 'asys-undo__detail', 'asys-undo__action')).toEqual([
        'asys-undo__text',
        'asys-undo__detail',
        'asys-undo__action',
        'asys-undo__action',
      ]);
    });

    it('leaves out the reason line when there is no detail', async () => {
      const { q, text } = await failed(true, null);

      expect(q('.asys-undo__detail')).toBeNull();
      expect(text('.asys-undo__text--failed')).toBe('“Pay the invoice” is not Done.');
    });

    it('shows Try again then Dismiss when it can retry, Try again Secondary and Dismiss quiet', async () => {
      const { labels, button } = await failed(true);

      expect(labels()).toEqual(['Try again', 'Dismiss']);
      expect(button('Try again')?.classList.contains('asys-button--quiet')).toBe(false);
      expect(button('Try again')?.classList.contains('asys-button--secondary')).toBe(true);
      expect(button('Try again')?.classList.contains('asys-undo__action')).toBe(true);
      expect(button('Dismiss')?.classList.contains('asys-button--quiet')).toBe(true);
      expect(button('Dismiss')?.classList.contains('asys-undo__action')).toBe(true);
    });

    it('draws the rotate-right icon before the Try again label, and none on Dismiss', async () => {
      const { button } = await failed(true);

      const retryIcon = button('Try again')?.querySelector('svg[data-icon="rotate-right"]');

      expect(retryIcon).not.toBeNull();
      expect(retryIcon?.closest('asys-icon')?.getAttribute('aria-hidden')).toBe('true');
      expect(button('Try again')?.firstElementChild).toBe(retryIcon?.closest('asys-icon'));
      expect(button('Dismiss')?.querySelector('svg')).toBeNull();
    });

    it('shows only Dismiss when it cannot retry', async () => {
      const { labels, q } = await failed(false, 'That Task or Area no longer exists.');

      expect(labels()).toEqual(['Dismiss']);
      expect(q('svg[data-icon="rotate-right"]')).toBeNull();
    });

    it('emits retry and dismiss with keyboard true for a click with detail 0, as Enter and Space give', async () => {
      const { host, button, fixture } = await failed(true);

      button('Try again')?.click();
      await fixture.whenStable();

      expect(host.retryPayloads).toEqual([{ keyboard: true }]);
      expect(host.dismissPayloads).toEqual([]);

      button('Dismiss')?.click();
      await fixture.whenStable();

      expect(host.retryPayloads).toEqual([{ keyboard: true }]);
      expect(host.dismissPayloads).toEqual([{ keyboard: true }]);
      expect(host.undos).toBe(0);
    });

    it.each([1, 2])('reports keyboard false for a pointer click with detail %i', async (detail) => {
      const { host, button, fixture } = await failed(true);

      pointerClick(must(button('Try again')), detail);
      pointerClick(must(button('Dismiss')), detail);
      await fixture.whenStable();

      expect(host.retryPayloads).toEqual([{ keyboard: false }]);
      expect(host.dismissPayloads).toEqual([{ keyboard: false }]);
    });
  });

  describe('the Notice variant', () => {
    const notice = async () => {
      const setupResult = await setup(UndoBarVariant.Notice);

      await setupResult.update(() => {
        setupResult.host.detail.set(REVIEW_SENTENCE);
        setupResult.host.title.set('Pay the invoice');
      });

      return setupResult;
    };

    it('shows only the detail and Dismiss, with no title line', async () => {
      const { text, labels, bar, button } = await notice();

      expect(text('p.asys-undo__detail')).toBe(REVIEW_SENTENCE);
      expect(labels()).toEqual(['Dismiss']);
      expect(button('Dismiss')?.classList.contains('asys-button--quiet')).toBe(true);
      expect(button('Dismiss')?.classList.contains('asys-undo__action')).toBe(true);
      expect(bar().textContent).not.toContain('is not Done');
      expect(bar().textContent).not.toContain('Pay the invoice');
    });

    it('shows none of the Done or Failed layout: no check, timer or failure text', async () => {
      const { q } = await notice();

      expect(q('.asys-undo__check')).toBeNull();
      expect(q('.asys-undo__status')).toBeNull();
      expect(q('.asys-undo__title')).toBeNull();
      expect(q('.asys-undo__timer')).toBeNull();
      expect(q('.asys-undo__text--failed')).toBeNull();
    });

    it('lays out the detail and then Dismiss', async () => {
      const { order } = await notice();

      expect(order('asys-undo__detail', 'asys-undo__action')).toEqual([
        'asys-undo__detail',
        'asys-undo__action',
      ]);
    });

    it('leaves out the detail line when there is none', async () => {
      const { host, update, q, labels } = await notice();

      await update(() => host.detail.set(null));

      expect(q('.asys-undo__detail')).toBeNull();
      expect(labels()).toEqual(['Dismiss']);
    });

    it('shows no Try again even when canRetry is set', async () => {
      const { host, update, labels } = await notice();

      await update(() => host.canRetry.set(true));

      expect(labels()).toEqual(['Dismiss']);
    });

    it('emits dismiss when Dismiss is clicked', async () => {
      const { host, button, fixture } = await notice();

      button('Dismiss')?.click();
      await fixture.whenStable();

      expect(host.dismissPayloads).toEqual([{ keyboard: true }]);
    });

    it('reports keyboard false when Dismiss gets a pointer click', async () => {
      const { host, button, fixture } = await notice();

      pointerClick(must(button('Dismiss')));
      await fixture.whenStable();

      expect(host.dismissPayloads).toEqual([{ keyboard: false }]);
    });
  });

  describe('pointer and focus', () => {
    it('emits pointerInside true on pointerenter and false on pointerleave', async () => {
      const { host, bar } = await setup();

      bar().dispatchEvent(new Event('pointerenter'));
      bar().dispatchEvent(new Event('pointerleave'));

      expect(host.pointer).toEqual([true, false]);
    });

    it('keeps emitting pointerInside while it marks the bar paused', async () => {
      const { host, bar, fixture } = await setup();

      bar().dispatchEvent(new Event('pointerenter'));
      await fixture.whenStable();

      expect(host.pointer).toEqual([true]);
      expect(bar().classList.contains('is-paused')).toBe(true);

      bar().dispatchEvent(new Event('pointerleave'));
      await fixture.whenStable();

      expect(host.pointer).toEqual([true, false]);
      expect(bar().classList.contains('is-paused')).toBe(false);
    });

    it('emits focusInside true on focusin', async () => {
      const { host, button } = await setup();

      must(button('Undo')).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      expect(host.focus).toEqual([true]);
    });

    it('emits focusInside false on focusout to nowhere', async () => {
      const { host, button } = await setup();

      must(button('Undo')).dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
      );

      expect(host.focus).toEqual([false]);
    });

    it('emits focusInside false on focusout to an element outside the bar', async () => {
      const { host, button } = await setup();
      const outside = document.createElement('button');

      document.body.appendChild(outside);
      must(button('Undo')).dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }),
      );

      expect(host.focus).toEqual([false]);
    });

    it('emits nothing on focusout to another element inside the bar', async () => {
      const { host, update, button } = await setup(UndoBarVariant.Failed);

      await update(() => host.canRetry.set(true));

      must(button('Try again')).dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: must(button('Dismiss')) }),
      );

      expect(host.focus).toEqual([]);
    });
  });

  describe('focusAction', () => {
    it('focuses Undo in the Done variant', async () => {
      const { host, button } = await setup();

      host.bar().focusAction();

      expect(document.activeElement).toBe(button('Undo'));
    });

    it('focuses Try again in the Failed variant when it can retry', async () => {
      const { host, update, button } = await setup(UndoBarVariant.Failed);

      await update(() => {
        host.detail.set(NOT_SENT);
        host.canRetry.set(true);
      });
      host.bar().focusAction();

      expect(document.activeElement).toBe(button('Try again'));
    });

    it('focuses Dismiss when it is the first button', async () => {
      const { host, update, button } = await setup(UndoBarVariant.Notice);

      await update(() => host.detail.set(REVIEW_SENTENCE));
      host.bar().focusAction();

      expect(document.activeElement).toBe(button('Dismiss'));
    });
  });

  describe('Escape', () => {
    it('emits escape for Escape inside the bar', async () => {
      const { host, button, keydown } = await setup();

      keydown({ key: 'Escape' }, must(button('Undo')));

      expect(host.escapes).toBe(1);
      expect(host.voidPayloads).toEqual([undefined]);
    });

    it('emits nothing for another key inside the bar', async () => {
      const { host, button, keydown } = await setup();

      keydown({ key: 'Enter' }, must(button('Undo')));

      expect(host.escapes).toBe(0);
    });

    it('emits nothing for Escape outside the bar', async () => {
      const { host, keydown } = await setup();

      keydown({ key: 'Escape' });

      expect(host.escapes).toBe(0);
    });
  });

  describe('Ctrl+Z and Cmd+Z', () => {
    it('emits undo and prevents the default for Ctrl+Z in the Done variant', async () => {
      const { host, keydown } = await setup();

      const event = keydown({ key: 'z', ctrlKey: true });

      expect(host.undos).toBe(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits undo for Cmd+Z', async () => {
      const { host, keydown } = await setup();

      const event = keydown({ key: 'z', metaKey: true });

      expect(host.undos).toBe(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('emits undo for a capital Z with Ctrl', async () => {
      const { host, keydown } = await setup();

      keydown({ key: 'Z', ctrlKey: true });

      expect(host.undos).toBe(1);
    });

    it('emits undo once when the key goes through a button inside the bar', async () => {
      const { host, button, keydown } = await setup();

      keydown({ key: 'z', ctrlKey: true }, must(button('Undo')));

      expect(host.undos).toBe(1);
    });

    it('emits nothing for Ctrl+Shift+Z', async () => {
      const { host, keydown } = await setup();

      const event = keydown({ key: 'z', ctrlKey: true, shiftKey: true });

      expect(host.undos).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it('emits nothing for z without Ctrl or Cmd', async () => {
      const { host, keydown } = await setup();

      const event = keydown({ key: 'z' });

      expect(host.undos).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it('emits nothing for Ctrl and another key', async () => {
      const { host, keydown } = await setup();

      keydown({ key: 'y', ctrlKey: true });

      expect(host.undos).toBe(0);
    });

    it.each(['input', 'textarea', 'select'])(
      'emits nothing and keeps the default when the target is a %s',
      async (tag) => {
        const { host, keydown } = await setup();
        const field = document.createElement(tag);

        document.body.appendChild(field);

        const event = keydown({ key: 'z', ctrlKey: true }, field);

        expect(host.undos).toBe(0);
        expect(event.defaultPrevented).toBe(false);
      },
    );

    it('emits nothing when the target is contenteditable', async () => {
      const { host, keydown } = await setup();
      const editable = document.createElement('div');

      // jsdom does not implement isContentEditable.
      Object.defineProperty(editable, 'isContentEditable', { value: true });
      document.body.appendChild(editable);

      const event = keydown({ key: 'z', ctrlKey: true }, editable);

      expect(host.undos).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it.each([UndoBarVariant.Failed, UndoBarVariant.Notice])(
      'emits nothing in the %s variant',
      async (variant) => {
        const { host, keydown } = await setup(variant);

        const event = keydown({ key: 'z', ctrlKey: true });

        expect(host.undos).toBe(0);
        expect(event.defaultPrevented).toBe(false);
      },
    );

    it('follows the variant: emits again after the Done layout comes back', async () => {
      const { host, update, keydown } = await setup(UndoBarVariant.Failed);

      keydown({ key: 'z', ctrlKey: true });

      expect(host.undos).toBe(0);

      await update(() => host.variant.set(UndoBarVariant.Done));
      keydown({ key: 'z', ctrlKey: true });

      expect(host.undos).toBe(1);
    });
  });
});
