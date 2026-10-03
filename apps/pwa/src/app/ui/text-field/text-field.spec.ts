// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, validate, type ValidationError } from '@angular/forms/signals';

import { TextField } from './text-field';

@Component({
  imports: [TextField],
  template: `
    <asys-text-field
      label="Name"
      [value]="value()"
      (valueChange)="value.set($event)"
      [hint]="hint()"
      [placeholder]="placeholder()"
      [errors]="errors()"
      [touched]="touched()"
      [disabled]="disabled()"
      [multiline]="multiline()"
      [autocomplete]="autocomplete()"
      [spellcheck]="spellcheck()"
      [autocapitalize]="autocapitalize()"
      (touch)="touches.set(touches() + 1)"
    />
  `,
})
class Host {
  readonly field = viewChild.required(TextField);

  readonly value = signal('');

  readonly hint = signal<string | undefined>(undefined);

  readonly placeholder = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly multiline = signal(false);

  readonly autocomplete = signal<string | undefined>(undefined);

  readonly spellcheck = signal(true);

  readonly autocapitalize = signal<string | undefined>(undefined);

  readonly touches = signal(0);
}

@Component({
  imports: [TextField],
  template: `
    <asys-text-field label="First" />
    <asys-text-field label="Second" hint="Some hint" />
  `,
})
class Pair {}

@Component({
  imports: [TextField, FormField],
  template: `<asys-text-field [formField]="f.name" label="Name" />`,
})
class FormHost {
  readonly model = signal({ name: '' });

  readonly f = form(this.model, (p) => {
    validate(p.name, ({ value }) =>
      value().trim() === '' ? { kind: 'name', message: 'Enter your name' } : undefined,
    );
  });
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const control = (): HTMLInputElement | HTMLTextAreaElement =>
    root().querySelector<HTMLInputElement | HTMLTextAreaElement>(
      '.asys-field__input',
    ) as HTMLInputElement;

  return { fixture, host, root, control };
};

describe('TextField', () => {
  it('renders the label for the control id', async () => {
    const { root, control } = await setup();

    const label = root().querySelector(
      'div.asys-field > label.asys-field__label',
    ) as HTMLLabelElement;

    expect(label.textContent?.trim()).toBe('Name');
    expect(control().id).not.toBe('');
    expect(label.getAttribute('for')).toBe(control().id);
    expect(control().tagName).toBe('INPUT');
    expect(control().getAttribute('type')).toBe('text');
  });

  it('shows the value in the control', async () => {
    const { fixture, host, control } = await setup();

    host.value.set('Ada');
    await fixture.whenStable();

    expect(control().value).toBe('Ada');
  });

  it('sets the value on every input event', async () => {
    const { fixture, host, control } = await setup();

    control().value = 'Gra';
    control().dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(host.value()).toBe('Gra');

    control().value = 'Grace';
    control().dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(host.value()).toBe('Grace');
  });

  it('emits touch once per blur', async () => {
    const { fixture, host, control } = await setup();

    control().dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.touches()).toBe(1);

    control().dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.touches()).toBe(2);
  });

  describe('messages', () => {
    it('shows no error when errors exist but the field is untouched', async () => {
      const { fixture, host, root, control } = await setup();

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__error')).toBeNull();
      expect(root().querySelector('.asys-field--error')).toBeNull();
      expect(control().hasAttribute('aria-invalid')).toBe(false);
    });

    it('shows no error when touched without errors', async () => {
      const { fixture, host, root, control } = await setup();

      host.touched.set(true);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__error')).toBeNull();
      expect(control().hasAttribute('aria-invalid')).toBe(false);
    });

    it('shows the first error when touched with errors', async () => {
      const { fixture, host, root, control } = await setup();

      host.errors.set([
        { kind: 'x', message: 'Enter your name' },
        { kind: 'y', message: 'Second' },
      ]);
      host.touched.set(true);
      await fixture.whenStable();

      const error = root().querySelector('p.asys-field__error') as HTMLElement;

      expect(root().querySelector('div.asys-field')?.classList.contains('asys-field--error')).toBe(
        true,
      );
      expect(control().getAttribute('aria-invalid')).toBe('true');
      expect(error.querySelector('span.asys-field__error-word')?.textContent).toBe('Error:');
      expect(error.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: Enter your name');
      expect(error.textContent).not.toContain('Second');
    });

    it('renders the message as plain text', async () => {
      const { fixture, host, root } = await setup();

      host.errors.set([{ kind: 'x', message: '<b>bold</b>' }]);
      host.touched.set(true);
      await fixture.whenStable();

      const error = root().querySelector('p.asys-field__error') as HTMLElement;

      expect(error.querySelector('b')).toBeNull();
      expect(error.textContent).toContain('<b>bold</b>');
    });

    it('falls back to "Check this value" for an error without a message', async () => {
      const { fixture, host, root } = await setup();

      host.errors.set([{ kind: 'x' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(
        root().querySelector('p.asys-field__error')?.textContent?.replace(/\s+/g, ' ').trim(),
      ).toBe('Error: Check this value');
    });

    it('shows the hint when there is no error', async () => {
      const { fixture, host, root } = await setup();

      host.hint.set('Your first name');
      await fixture.whenStable();

      expect(root().querySelector('p.asys-field__hint')?.textContent?.trim()).toBe(
        'Your first name',
      );
      expect(root().querySelector('.asys-field__error')).toBeNull();
    });

    it('replaces the hint with the error', async () => {
      const { fixture, host, root } = await setup();

      host.hint.set('Your first name');
      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__hint')).toBeNull();
      expect(root().querySelectorAll('div.asys-field > p').length).toBe(1);
    });

    it('shows the hint again when the error clears', async () => {
      const { fixture, host, root, control } = await setup();

      host.hint.set('Your first name');
      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();
      host.errors.set([]);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__hint')).not.toBeNull();
      expect(root().querySelector('.asys-field--error')).toBeNull();
      expect(control().hasAttribute('aria-invalid')).toBe(false);
    });

    it('renders no paragraph without hint or error', async () => {
      const { root } = await setup();

      expect(root().querySelector('div.asys-field > p')).toBeNull();
    });
  });

  describe('aria-describedby', () => {
    it('is absent without a message paragraph', async () => {
      const { control } = await setup();

      expect(control().hasAttribute('aria-describedby')).toBe(false);
    });

    it('points at the hint paragraph', async () => {
      const { fixture, host, root, control } = await setup();

      host.hint.set('Your first name');
      await fixture.whenStable();

      const hint = root().querySelector('p.asys-field__hint') as HTMLElement;

      expect(hint.id).not.toBe('');
      expect(control().getAttribute('aria-describedby')).toBe(hint.id);
    });

    it('points at the error paragraph', async () => {
      const { fixture, host, root, control } = await setup();

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();

      const error = root().querySelector('p.asys-field__error') as HTMLElement;

      expect(error.id).not.toBe('');
      expect(control().getAttribute('aria-describedby')).toBe(error.id);
    });

    it('uses ids that are unique across instances', async () => {
      const fixture = TestBed.createComponent(Pair);
      await fixture.whenStable();

      const inputs: HTMLInputElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('input'),
      );
      const hint = fixture.nativeElement.querySelector('p.asys-field__hint') as HTMLElement;
      const second = inputs[1];

      expect(inputs[0].id).not.toBe('');
      expect(inputs[0].id).not.toBe(second.id);
      expect(second.getAttribute('aria-describedby')).toBe(hint.id);
      expect(hint.id).not.toBe(inputs[0].id);
      expect(hint.id).not.toBe(second.id);
      expect(document.querySelectorAll(`[id="${hint.id}"]`).length).toBeLessThanOrEqual(1);
    });
  });

  describe('attributes', () => {
    it('sets disabled and the disabled class', async () => {
      const { fixture, host, root, control } = await setup();

      expect(control().disabled).toBe(false);
      expect(root().querySelector('.asys-field--disabled')).toBeNull();

      host.disabled.set(true);
      await fixture.whenStable();

      expect(control().disabled).toBe(true);
      expect(
        root().querySelector('div.asys-field')?.classList.contains('asys-field--disabled'),
      ).toBe(true);
    });

    it('renders a textarea when multiline', async () => {
      const { fixture, host, root } = await setup();

      host.multiline.set(true);
      host.value.set('Line one');
      await fixture.whenStable();

      const area = root().querySelector('textarea.asys-field__input') as HTMLTextAreaElement;
      const label = root().querySelector('label.asys-field__label') as HTMLLabelElement;

      expect(area).not.toBeNull();
      expect(root().querySelector('input.asys-field__input')).toBeNull();
      expect(area.value).toBe('Line one');
      expect(label.getAttribute('for')).toBe(area.id);

      area.value = 'Line two';
      area.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      expect(host.value()).toBe('Line two');
    });

    it('passes placeholder, autocomplete and autocapitalize through', async () => {
      const { fixture, host, control } = await setup();

      host.placeholder.set('Your name');
      host.autocomplete.set('given-name');
      host.autocapitalize.set('words');
      await fixture.whenStable();

      expect(control().getAttribute('placeholder')).toBe('Your name');
      expect(control().getAttribute('autocomplete')).toBe('given-name');
      expect(control().getAttribute('autocapitalize')).toBe('words');
    });

    it('omits those attributes when undefined', async () => {
      const { control } = await setup();

      expect(control().hasAttribute('placeholder')).toBe(false);
      expect(control().hasAttribute('autocomplete')).toBe(false);
      expect(control().hasAttribute('autocapitalize')).toBe(false);
    });

    it('sets spellcheck="false" only when spellcheck is false', async () => {
      const { fixture, host, control } = await setup();

      expect(control().hasAttribute('spellcheck')).toBe(false);

      host.spellcheck.set(false);
      await fixture.whenStable();

      expect(control().getAttribute('spellcheck')).toBe('false');

      host.spellcheck.set(true);
      await fixture.whenStable();

      expect(control().hasAttribute('spellcheck')).toBe(false);
    });
  });

  describe('focus', () => {
    it('focuses the native input', async () => {
      const { fixture, host, control } = await setup();

      fixture.nativeElement.ownerDocument.body.appendChild(fixture.nativeElement);
      host.field().focus();

      expect(document.activeElement).toBe(control());
    });

    it('focuses the native textarea when multiline', async () => {
      const { fixture, host, control } = await setup();

      host.multiline.set(true);
      await fixture.whenStable();
      document.body.appendChild(fixture.nativeElement);
      host.field().focus();

      expect(control().tagName).toBe('TEXTAREA');
      expect(document.activeElement).toBe(control());
    });
  });

  describe('with Signal Forms', () => {
    const setupForm = async () => {
      const fixture = TestBed.createComponent(FormHost);
      await fixture.whenStable();

      const input = (): HTMLInputElement => fixture.nativeElement.querySelector('input');
      const error = (): HTMLElement | null =>
        fixture.nativeElement.querySelector('p.asys-field__error');

      return { fixture, host: fixture.componentInstance, input, error };
    };

    it('shows no error before the field is touched', async () => {
      const { input, error } = await setupForm();

      expect(error()).toBeNull();
      expect(input().hasAttribute('aria-invalid')).toBe(false);
    });

    it('shows the validation error after blur', async () => {
      const { fixture, input, error } = await setupForm();

      input().dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(error()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: Enter your name');
      expect(input().getAttribute('aria-invalid')).toBe('true');
    });

    it('writes typing into the form model and clears the error', async () => {
      const { fixture, host, input, error } = await setupForm();

      input().dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      input().value = 'Ada';
      input().dispatchEvent(new Event('input'));
      await fixture.whenStable();

      expect(host.model().name).toBe('Ada');
      expect(error()).toBeNull();
      expect(input().hasAttribute('aria-invalid')).toBe(false);
    });

    it('shows a value set on the model', async () => {
      const { fixture, host, input } = await setupForm();

      host.model.set({ name: 'Grace' });
      await fixture.whenStable();

      expect(input().value).toBe('Grace');
    });
  });
});
