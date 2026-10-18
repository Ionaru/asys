// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { QuickAdd, type QuickAddFailure } from './quick-add';

@Component({
  imports: [QuickAdd],
  template: `
    <asys-quick-add
      [(value)]="value"
      [message]="message()"
      [failures]="failures()"
      (retry)="retried.push($event)"
      (discard)="discarded.push($event)"
      (add)="added.push($event)"
      (close)="closed = closed + 1"
    />
  `,
})
class Host {
  readonly value = signal('');

  readonly failures = signal<readonly QuickAddFailure[]>([]);

  readonly message = signal<string | null>(null);

  readonly added: string[] = [];

  readonly retried: string[] = [];

  readonly discarded: string[] = [];

  closed = 0;
}

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const q = <T extends HTMLElement>(selector: string): T | null =>
    fixture.nativeElement.querySelector(selector);
  const input = () => must(q<HTMLTextAreaElement>('.asys-capture-field textarea'));
  const button = (label: string): HTMLButtonElement | undefined =>
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => b.textContent?.trim() === label,
    );
  const type = async (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };
  const submit = async () => {
    must(q('form')).dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, q, input, button, type, submit };
};

describe('QuickAdd', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a form with a labelled field, the hint and Add and Close buttons', async () => {
    const { q, input, button } = await setup();

    const label = q('label');

    expect(q('form')?.classList.contains('asys-quickadd')).toBe(true);
    expect(label?.textContent?.trim()).toBe('Capture a Task');
    expect(label?.classList.contains('asys-visually-hidden')).toBe(true);
    expect(label?.getAttribute('for')).toBe(input().id);
    // A one-row textarea, because Chrome on Android shows its autofill bar on every text input.
    expect(input().tagName).toBe('TEXTAREA');
    expect(input().rows).toBe(1);
    expect(input().placeholder).toBe('Capture a Task');
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(q('.asys-capture-field__hint')?.textContent?.trim()).toBe(
      'Goes to the Inbox until Triage',
    );
    expect(button('Add')?.type).toBe('submit');
    expect(button('Close')?.type).toBe('button');
  });

  it('draws the field through a capture field, with Close projected into its row after Add', async () => {
    const { q, button } = await setup();

    const row = must(q('form.asys-quickadd > asys-capture-field > .asys-capture-field__row'));
    const buttons = Array.from(row.querySelectorAll('button')).map((b) => b.textContent?.trim());

    expect(row.querySelector('asys-input-box.asys-input-box--pill > textarea')).not.toBeNull();
    expect(buttons).toEqual(['Add', 'Close']);
    expect(button('Close')?.parentElement).toBe(row);
    expect(button('Close')?.classList.contains('asys-button--quiet')).toBe(true);
    expect(button('Close')?.classList.contains('asys-button--small')).toBe(true);
  });

  it('carries none of the removed quick add or field class names', async () => {
    const { fixture } = await setup();
    const removed = [
      'asys-quickadd__row',
      'asys-quickadd__field',
      'asys-quickadd__input',
      'asys-quickadd__hint',
      'asys-field__box',
      'asys-field__line',
    ];

    for (const name of removed) {
      expect(fixture.nativeElement.querySelector(`.${name}`), name).toBeNull();
    }
  });

  it('moves focus to the input when first rendered', async () => {
    const { input } = await setup();

    expect(document.activeElement).toBe(input());
  });

  it('shows the value and updates it on input', async () => {
    const { host, input, fixture, type } = await setup();

    host.value.set('Call Marit');
    await fixture.whenStable();

    expect(input().value).toBe('Call Marit');

    await type('Buy milk');

    expect(host.value()).toBe('Buy milk');
  });

  it('marks Add aria-disabled and is-disabled while the value is blank, and never disables it', async () => {
    const { button, type } = await setup();

    for (const blank of ['', '   ']) {
      await type(blank);

      expect(button('Add')?.getAttribute('aria-disabled')).toBe('true');
      expect(button('Add')?.classList.contains('is-disabled')).toBe(true);
      expect(button('Add')?.disabled).toBe(false);
    }

    await type('Call Marit');

    expect(button('Add')?.hasAttribute('aria-disabled')).toBe(false);
    expect(button('Add')?.classList.contains('is-disabled')).toBe(false);
    expect(button('Add')?.disabled).toBe(false);
  });

  it('asks the keyboard for a send key', async () => {
    const { input } = await setup();

    expect(input().getAttribute('enterkeyhint')).toBe('send');
  });

  it('keeps focus in the field when the pill around it is pressed', async () => {
    const { q, input, button } = await setup();
    const event = new MouseEvent('mousedown', { cancelable: true, bubbles: true });

    button('Close')?.focus();
    must(q('.asys-quickadd .asys-input-box')).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
  });

  it('leaves a mousedown on the field itself alone, so it can place the caret', async () => {
    const { input } = await setup();
    const event = new MouseEvent('mousedown', { cancelable: true, bubbles: true });

    input().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('prevents the default of a mousedown on Add so focus stays in the input', async () => {
    const { button } = await setup();
    const event = new MouseEvent('mousedown', { cancelable: true, bubbles: true });

    button('Add')?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('emits nothing when the aria-disabled Add is clicked with a blank value', async () => {
    const { fixture, host, button, type } = await setup();

    await type('   ');
    button('Add')?.click();
    await fixture.whenStable();

    expect(host.added).toEqual([]);
  });

  it('emits the trimmed value on submit and does not clear it', async () => {
    const { host, type, submit } = await setup();
    await type('  Call Marit  ');

    await submit();

    expect(host.added).toEqual(['Call Marit']);
    expect(host.value()).toBe('  Call Marit  ');
  });

  it('prevents the form submit from reloading the page', async () => {
    const { q, type, fixture } = await setup();
    await type('Call Marit');
    const event = new Event('submit', { cancelable: true });

    must(q('form')).dispatchEvent(event);
    await fixture.whenStable();

    expect(event.defaultPrevented).toBe(true);
  });

  it('emits add when the Add button is clicked', async () => {
    const { fixture, host, button, type } = await setup();
    await type('Call Marit');

    button('Add')?.click();
    await fixture.whenStable();

    expect(host.added).toEqual(['Call Marit']);
  });

  it('emits nothing on submit when the value is blank', async () => {
    const { host, type, submit } = await setup();

    await submit();
    await type('   ');
    await submit();

    expect(host.added).toEqual([]);
  });

  describe('the field keys', () => {
    const enter = (init: KeyboardEventInit = {}): KeyboardEvent =>
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });

    it('submits on Enter and inserts no line break', async () => {
      const { host, fixture, input, type } = await setup();
      const event = enter();
      await type('Call Marit');

      input().dispatchEvent(event);
      await fixture.whenStable();

      expect(event.defaultPrevented).toBe(true);
      expect(host.added).toEqual(['Call Marit']);
      expect(input().value).toBe('Call Marit');
    });

    it('emits nothing on Enter when the value is blank', async () => {
      const { host, fixture, input, type } = await setup();
      const event = enter();
      await type('   ');

      input().dispatchEvent(event);
      await fixture.whenStable();

      expect(event.defaultPrevented).toBe(true);
      expect(host.added).toEqual([]);
    });

    it('leaves an Enter that ends a composition alone', async () => {
      const { host, fixture, input, type } = await setup();
      const event = enter({ isComposing: true });
      await type('Call Marit');

      input().dispatchEvent(event);
      await fixture.whenStable();

      expect(event.defaultPrevented).toBe(false);
      expect(host.added).toEqual([]);
    });

    it.each(['insertLineBreak', 'insertParagraph'])(
      'prevents a beforeinput %s and submits',
      async (inputType) => {
        const { host, fixture, input, type } = await setup();
        const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
        await type('Call Marit');

        input().dispatchEvent(event);
        await fixture.whenStable();

        expect(event.defaultPrevented).toBe(true);
        expect(host.added).toEqual(['Call Marit']);
      },
    );

    it('leaves other beforeinput events alone', async () => {
      const { host, fixture, input } = await setup();
      const event = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'x',
        bubbles: true,
        cancelable: true,
      });

      input().dispatchEvent(event);
      await fixture.whenStable();

      expect(event.defaultPrevented).toBe(false);
      expect(host.added).toEqual([]);
    });

    it.each([
      ['Call\nMarit', 'Call Marit'],
      ['Call\r\nMarit', 'Call Marit'],
      ['a\n\nb\n', 'a  b '],
    ])('turns pasted %j into %j in the field and the value', async (pasted, expected) => {
      const { host, input, type } = await setup();

      await type(pasted);

      expect(input().value).toBe(expected);
      expect(host.value()).toBe(expected);
    });

    it('keeps the caret where it was when a line break becomes a space', async () => {
      const { fixture, input } = await setup();
      const field = input();

      field.value = 'Call\nMarit';
      field.setSelectionRange(5, 5);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();

      expect(field.value).toBe('Call Marit');
      expect([field.selectionStart, field.selectionEnd]).toEqual([5, 5]);
    });
  });

  it('emits close from the Close button', async () => {
    const { fixture, host, button } = await setup();

    button('Close')?.click();
    await fixture.whenStable();

    expect(host.closed).toBe(1);
    expect(host.added).toEqual([]);
  });

  it('emits close when Escape is pressed in the input', async () => {
    const { fixture, host, input } = await setup();

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(host.closed).toBe(1);
  });

  it('emits close when Escape is pressed on a button inside', async () => {
    const { fixture, host, button } = await setup();

    button('Add')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(host.closed).toBe(1);
  });

  it('keeps an empty status paragraph with role status when there is no message', async () => {
    const { q } = await setup();

    const status = q('.asys-quickadd__status');

    expect(status).not.toBeNull();
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent?.trim()).toBe('');
  });

  it('shows the message in the status paragraph and clears it again', async () => {
    const { host, fixture, q } = await setup();

    host.message.set('Could not add the Task');
    await fixture.whenStable();

    expect(q('.asys-quickadd__status')?.textContent?.trim()).toBe('Could not add the Task');

    host.message.set(null);
    await fixture.whenStable();

    expect(q('.asys-quickadd__status')).not.toBeNull();
    expect(q('.asys-quickadd__status')?.textContent?.trim()).toBe('');
  });

  describe('failures', () => {
    const FAILURES: readonly QuickAddFailure[] = [
      {
        id: 'a',
        text: 'Buy milk',
        message: 'ASYS cannot reach the server. Try again.',
        canRetry: true,
      },
      { id: 'b', text: 'Buy bread', message: 'Enter a title.', canRetry: false },
      { id: 'c', text: 'Buy eggs', message: null, canRetry: true },
    ];

    const rows = (q: (selector: string) => HTMLElement | null): HTMLElement[] =>
      Array.from(
        (q('form') as HTMLElement).querySelectorAll<HTMLElement>('.asys-quickadd__failure'),
      );

    const rowButton = (row: HTMLElement, label: string): HTMLButtonElement | undefined =>
      Array.from(row.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

    it('renders no failure row by default', async () => {
      const { q } = await setup();

      expect(rows(q)).toEqual([]);
    });

    it('renders one row per failure above the input row, in order', async () => {
      const { host, fixture, q } = await setup();

      host.failures.set(FAILURES);
      await fixture.whenStable();

      const rendered = rows(q);
      const inputRow = q('.asys-capture-field__row') as HTMLElement;

      expect(rendered).toHaveLength(3);
      expect(
        rendered.map((row) =>
          row.querySelector('.asys-quickadd__failure-text')?.textContent?.trim(),
        ),
      ).toEqual([
        'Not captured: \u201CBuy milk\u201D',
        'Not captured: \u201CBuy bread\u201D',
        'Not captured: \u201CBuy eggs\u201D',
      ]);

      for (const row of rendered) {
        expect(
          row.compareDocumentPosition(inputRow) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
    });

    it('shows the reason only when the message is not null', async () => {
      const { host, fixture, q } = await setup();

      host.failures.set(FAILURES);
      await fixture.whenStable();

      const reasons = rows(q).map(
        (row) => row.querySelector('.asys-quickadd__failure-reason')?.textContent?.trim() ?? null,
      );

      expect(reasons).toEqual(['ASYS cannot reach the server. Try again.', 'Enter a title.', null]);
    });

    it('offers Try again only when the capture can be retried, and Discard always', async () => {
      const { host, fixture, q } = await setup();

      host.failures.set(FAILURES);
      await fixture.whenStable();

      const [first, second, third] = rows(q) as [HTMLElement, HTMLElement, HTMLElement];

      expect(rowButton(first, 'Try again')).toBeDefined();
      expect(rowButton(first, 'Discard')).toBeDefined();
      expect(rowButton(second, 'Try again')).toBeUndefined();
      expect(rowButton(second, 'Discard')).toBeDefined();
      expect(rowButton(third, 'Try again')).toBeDefined();
    });

    it('leads each failure with the warning icon, and draws rotate-right on Try again and xmark on Discard', async () => {
      const { host, fixture, q } = await setup();

      host.failures.set(FAILURES);
      await fixture.whenStable();

      const [first] = rows(q) as [HTMLElement];
      /** The icon that comes first in `element`, by its glyph name, or null when it starts with none. */
      const leadingIcon = (element: Element | null | undefined): string | null => {
        const lead = element?.firstElementChild;

        return lead?.tagName === 'ASYS-ICON'
          ? (lead.querySelector('svg')?.getAttribute('data-icon') ?? null)
          : null;
      };
      const text = first.querySelector('.asys-quickadd__failure-text');

      expect(leadingIcon(text)).toBe('triangle-exclamation');
      expect(text?.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
      expect(leadingIcon(rowButton(first, 'Try again'))).toBe('rotate-right');
      expect(leadingIcon(rowButton(first, 'Discard'))).toBe('xmark');
    });

    it('uses the secondary variant for Try again and the quiet one for Discard', async () => {
      const { host, fixture, q } = await setup();

      host.failures.set(FAILURES);
      await fixture.whenStable();

      const [first] = rows(q) as [HTMLElement];

      expect(rowButton(first, 'Try again')?.classList.contains('asys-button--secondary')).toBe(
        true,
      );
      expect(rowButton(first, 'Discard')?.classList.contains('asys-button--quiet')).toBe(true);
    });

    it('emits retry and discard with the id of the row that was clicked', async () => {
      const { host, fixture, q } = await setup();

      host.failures.set(FAILURES);
      await fixture.whenStable();

      const [first, second] = rows(q) as [HTMLElement, HTMLElement];

      rowButton(first, 'Try again')?.click();
      rowButton(second, 'Discard')?.click();
      await fixture.whenStable();

      expect(host.retried).toEqual(['a']);
      expect(host.discarded).toEqual(['b']);
      expect(host.added).toEqual([]);
    });

    it.each(['Try again', 'Discard'])(
      'moves focus to the input when %s removes its row',
      async (label) => {
        const { host, fixture, q, input } = await setup();

        host.failures.set(FAILURES);
        await fixture.whenStable();

        const [first] = rows(q) as [HTMLElement];
        const action = must(rowButton(first, label), label);

        action.focus();
        action.click();
        host.failures.set(FAILURES.slice(1));
        await fixture.whenStable();

        expect(document.activeElement).toBe(input());
      },
    );
  });
});
