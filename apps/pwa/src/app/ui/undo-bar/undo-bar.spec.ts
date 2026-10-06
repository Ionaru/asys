// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { UndoBar, UndoBarVariant } from './undo-bar';

@Component({
  imports: [UndoBar],
  template: `
    <asys-undo-bar
      [variant]="variant()"
      [title]="title()"
      [detail]="detail()"
      [canRetry]="canRetry()"
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

  undos = 0;

  escapes = 0;

  /** What `undo` and `escape` emitted: they carry no payload, so every entry is `undefined`. */
  readonly voidPayloads: unknown[] = [];

  /** The payloads `retry` and `dismiss` emitted, in order. */
  readonly retryPayloads: { readonly keyboard: boolean }[] = [];

  readonly dismissPayloads: { readonly keyboard: boolean }[] = [];

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

  onRetry(payload: { readonly keyboard: boolean }): void {
    this.retryPayloads.push(payload);
  }

  onDismiss(payload: { readonly keyboard: boolean }): void {
    this.dismissPayloads.push(payload);
  }
}

const NOT_SENT = 'ASYS cannot reach the server. Try again.';

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
  const update = async (change: () => void): Promise<void> => {
    change();
    await fixture.whenStable();
  };
  const keydown = (init: KeyboardEventInit, target: EventTarget = document.body): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });

    target.dispatchEvent(event);

    return event;
  };

  return { fixture, host, bar, q, buttons, button, labels, text, update, keydown };
};

describe('UndoBar', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('puts the class asys-undobar on its host', async () => {
    const { bar } = await setup();

    expect(bar().classList.contains('asys-undobar')).toBe(true);
  });

  describe('the Done variant', () => {
    it('shows an aria-hidden check, Done and the title on one line of text', async () => {
      const { q, text } = await setup();

      const check = q('svg.asys-undobar__check');

      expect(check).not.toBeNull();
      expect(check?.getAttribute('aria-hidden')).toBe('true');
      expect(check?.closest('.asys-undobar__text')).not.toBeNull();
      expect(text('.asys-undobar__done')).toBe('Done');
      expect(text('.asys-undobar__title')).toBe('Pay the invoice');
      expect(q('.asys-undobar__done')?.closest('.asys-undobar__text')).not.toBeNull();
      expect(q('.asys-undobar__title')?.closest('.asys-undobar__text')).not.toBeNull();
    });

    it('shows Undo as its only button, a quiet one', async () => {
      const { labels, button } = await setup();

      expect(labels()).toEqual(['Undo']);
      expect(button('Undo')?.type).toBe('button');
      expect(button('Undo')?.classList.contains('asys-button--quiet')).toBe(true);
      expect(button('Undo')?.classList.contains('asys-undobar__action')).toBe(true);
    });

    it('shows no failure text', async () => {
      const { bar } = await setup();

      expect(bar().textContent).not.toContain('is not Done');
    });

    it('follows the title input', async () => {
      const { host, update, text } = await setup();

      await update(() => host.title.set('Call Marit'));

      expect(text('.asys-undobar__title')).toBe('Call Marit');
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
      const { text, bar } = await failed(true);

      expect(text('.asys-undobar__text')).toBe('“Pay the invoice” is not Done.');
      expect(text('.asys-undobar__detail')).toBe(NOT_SENT);
      expect(bar().querySelector('.asys-undobar__check')).toBeNull();
      expect(bar().querySelector('.asys-undobar__title')).toBeNull();
    });

    it('shows Try again then Dismiss when it can retry, Try again not quiet and Dismiss quiet', async () => {
      const { labels, button } = await failed(true);

      expect(labels()).toEqual(['Try again', 'Dismiss']);
      expect(button('Try again')?.classList.contains('asys-button--quiet')).toBe(false);
      expect(button('Try again')?.classList.contains('asys-button--secondary')).toBe(true);
      expect(button('Dismiss')?.classList.contains('asys-button--quiet')).toBe(true);
    });

    it('shows only Dismiss when it cannot retry', async () => {
      const { labels } = await failed(false, 'That Task or Area no longer exists.');

      expect(labels()).toEqual(['Dismiss']);
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

      expect(text('.asys-undobar__detail')).toBe(REVIEW_SENTENCE);
      expect(labels()).toEqual(['Dismiss']);
      expect(button('Dismiss')?.classList.contains('asys-button--quiet')).toBe(true);
      expect(bar().textContent).not.toContain('is not Done');
      expect(bar().textContent).not.toContain('Pay the invoice');
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
