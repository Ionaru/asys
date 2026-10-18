// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CaptureField } from './capture-field';

@Component({
  imports: [CaptureField],
  template: `
    <form (submit)="submit($event)">
      <asys-capture-field
        [(value)]="value"
        [label]="label()"
        [placeholder]="placeholder()"
        [hint]="hint()"
      >
        <button type="button" id="extra">Close</button>
      </asys-capture-field>
    </form>
  `,
})
class Host {
  readonly field = viewChild.required(CaptureField);

  readonly value = signal('');

  readonly label = signal('Capture a Task');

  readonly placeholder = signal('Capture a Task');

  readonly hint = signal<string | undefined>(undefined);

  submitted = 0;

  submit(event: Event): void {
    event.preventDefault();
    this.submitted++;
  }
}

@Component({
  imports: [CaptureField],
  template: `
    <asys-capture-field />
    <asys-capture-field />
  `,
})
class Pair {}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);

  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const root = fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(selector: string): T => root.querySelector(selector) as T;
  const input = () => q<HTMLTextAreaElement>('textarea');
  const add = () => q<HTMLButtonElement>('button[type="submit"]');
  const type = async (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, root, q, input, add, type };
};

describe('CaptureField', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('carries asys-capture-field on its host', async () => {
    const { q } = await setup();

    expect(q('asys-capture-field').classList.contains('asys-capture-field')).toBe(true);
  });

  it('renders the row with a hidden label, a pill box around a one-row textarea, and Add', async () => {
    const { q, input, add } = await setup();
    const row = q('.asys-capture-field__row');
    const label = q<HTMLLabelElement>('.asys-capture-field__row > label');
    const box = q('.asys-capture-field__row > asys-input-box');

    expect(label.classList.contains('asys-visually-hidden')).toBe(true);
    expect(label.getAttribute('for')).toBe(input().id);
    expect(box.classList.contains('asys-input-box')).toBe(true);
    expect(box.classList.contains('asys-input-box--pill')).toBe(true);
    expect(input().parentElement).toBe(box);
    expect(input().rows).toBe(1);
    expect(input().getAttribute('wrap')).toBe('off');
    expect(input().classList.contains('asys-input-box__control')).toBe(true);
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(input().getAttribute('enterkeyhint')).toBe('send');
    expect(add().textContent?.trim()).toBe('Add');
    expect(add().classList.contains('asys-button--primary')).toBe(true);
    expect(add().parentElement).toBe(row);
  });

  it('defaults the label and the placeholder to "Capture a Task"', async () => {
    const fixture = TestBed.createComponent(Pair);

    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('label')?.textContent?.trim()).toBe('Capture a Task');
    expect(root.querySelector('textarea')?.placeholder).toBe('Capture a Task');
  });

  it('takes its own label and placeholder', async () => {
    const { fixture, host, q, input } = await setup();

    host.label.set('Add a Task');
    host.placeholder.set('What needs doing?');
    await fixture.whenStable();

    expect(q('label').textContent?.trim()).toBe('Add a Task');
    expect(input().placeholder).toBe('What needs doing?');
  });

  it('gives each instance a unique textarea id of the form asys-capture-field-N-input', async () => {
    const fixture = TestBed.createComponent(Pair);

    await fixture.whenStable();

    const [first, second] = Array.from(
      fixture.nativeElement.querySelectorAll('textarea'),
    ) as HTMLTextAreaElement[];

    expect(first.id).toMatch(/^asys-capture-field-\d+-input$/);
    expect(second.id).toMatch(/^asys-capture-field-\d+-input$/);
    expect(first.id).not.toBe(second.id);
  });

  it('projects extra buttons into the row after Add', async () => {
    const { q, add } = await setup();
    const extra = q('#extra');

    expect(extra.parentElement).toBe(q('.asys-capture-field__row'));
    expect(add().nextElementSibling).toBe(extra);
  });

  describe('hint', () => {
    it('renders no hint paragraph without a hint', async () => {
      const { root, input } = await setup();

      expect(root.querySelector('.asys-capture-field__hint')).toBeNull();
      expect(input().hasAttribute('aria-describedby')).toBe(false);
    });

    it('renders the hint after the row as the field description, and removes it again', async () => {
      const { fixture, host, root, q, input } = await setup();

      host.hint.set('Goes to the Inbox until Triage');
      await fixture.whenStable();

      const hint = q('p.asys-capture-field__hint');

      expect(hint.textContent?.trim()).toBe('Goes to the Inbox until Triage');
      expect(hint.classList.contains('asys-field__hint')).toBe(true);
      expect(q('.asys-capture-field__row').nextElementSibling).toBe(hint);
      expect(hint.id).toMatch(/^asys-capture-field-\d+-hint$/);
      expect(input().getAttribute('aria-describedby')).toBe(hint.id);

      host.hint.set(undefined);
      await fixture.whenStable();

      expect(root.querySelector('.asys-capture-field__hint')).toBeNull();
      expect(input().hasAttribute('aria-describedby')).toBe(false);
    });
  });

  describe('value', () => {
    it('shows a value set from outside', async () => {
      const { fixture, host, input } = await setup();

      host.value.set('Call Marit');
      await fixture.whenStable();

      expect(input().value).toBe('Call Marit');
    });

    it('sets the value on typing', async () => {
      const { host, type } = await setup();

      await type('Buy milk');

      expect(host.value()).toBe('Buy milk');
    });

    it.each([
      ['Call\nMarit', 'Call Marit'],
      ['a\n\nb\n', 'a  b '],
    ])('flattens pasted %j into %j in the field and the value', async (pasted, expected) => {
      const { host, input, type } = await setup();

      await type(pasted);

      expect(input().value).toBe(expected);
      expect(host.value()).toBe(expected);
    });
  });

  describe('Add', () => {
    it('is aria-disabled and is-disabled, never disabled, while the value is blank', async () => {
      const { add, type } = await setup();

      for (const blank of ['', '   ']) {
        await type(blank);

        expect(add().getAttribute('aria-disabled')).toBe('true');
        expect(add().classList.contains('is-disabled')).toBe(true);
        expect(add().disabled).toBe(false);
      }
    });

    it('has neither aria-disabled nor is-disabled once there is text', async () => {
      const { add, type } = await setup();

      await type('Call Marit');

      expect(add().hasAttribute('aria-disabled')).toBe(false);
      expect(add().classList.contains('is-disabled')).toBe(false);
      expect(add().disabled).toBe(false);
    });

    it('prevents the default of a mousedown so focus stays in the field', async () => {
      const { add } = await setup();
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

      add().dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('Enter', () => {
    it('submits the enclosing form through Add and inserts no line break', async () => {
      const { fixture, host, input, type } = await setup();
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });

      await type('Call Marit');
      input().dispatchEvent(event);
      await fixture.whenStable();

      expect(event.defaultPrevented).toBe(true);
      expect(host.submitted).toBe(1);
      expect(input().value).toBe('Call Marit');
    });

    it('leaves an Enter that ends a composition alone', async () => {
      const { fixture, host, input, type } = await setup();
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });

      await type('Call Marit');
      input().dispatchEvent(event);
      await fixture.whenStable();

      expect(event.defaultPrevented).toBe(false);
      expect(host.submitted).toBe(0);
    });
  });

  it('owns no form of its own', async () => {
    const { q } = await setup();

    expect(q('asys-capture-field').querySelector('form')).toBeNull();
  });

  it('gives the box around the field as its rect', async () => {
    const { host, q } = await setup();
    const rect = { left: 16, top: 600, width: 280, height: 48 } as DOMRect;

    q('asys-input-box').getBoundingClientRect = () => rect;

    expect(host.field().fieldRect()).toBe(rect);
  });

  it('focuses its textarea from focus()', async () => {
    const { host, input } = await setup();

    host.field().focus();

    expect(document.activeElement).toBe(input());
  });
});
