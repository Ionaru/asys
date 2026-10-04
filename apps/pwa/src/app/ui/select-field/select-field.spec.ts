// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, validate, type ValidationError } from '@angular/forms/signals';

import { SelectField, type SelectOption } from './select-field';

const AREAS: readonly SelectOption[] = [
  { value: '', label: 'No area' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
];

@Component({
  imports: [SelectField],
  template: `
    <asys-select-field
      label="Area"
      [options]="options()"
      [value]="value()"
      (valueChange)="value.set($event)"
      [hint]="hint()"
      [errors]="errors()"
      [touched]="touched()"
      [disabled]="disabled()"
      (touch)="touches.set(touches() + 1)"
    />
  `,
})
class Host {
  readonly field = viewChild.required(SelectField);

  readonly options = signal<readonly SelectOption[]>(AREAS);

  readonly value = signal('');

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

@Component({
  imports: [SelectField],
  template: `
    <asys-select-field label="First" [options]="options" />
    <asys-select-field label="Second" [options]="options" hint="Some hint" />
  `,
})
class Pair {
  readonly options = AREAS;
}

@Component({
  imports: [SelectField, FormField],
  template: `<asys-select-field [formField]="f.area" label="Area" [options]="options" />`,
})
class FormHost {
  readonly options = AREAS;

  readonly model = signal({ area: '' });

  readonly f = form(this.model, (p) => {
    validate(p.area, ({ value }) =>
      value() === '' ? { kind: 'area', message: 'Pick an area' } : undefined,
    );
  });
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const select = (): HTMLSelectElement =>
    root().querySelector('select.asys-field__input') as HTMLSelectElement;
  const choose = async (value: string) => {
    select().value = value;
    select().dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
  };

  return { fixture, host, root, select, choose };
};

describe('SelectField', () => {
  it('renders the label for the select id', async () => {
    const { root, select } = await setup();

    const label = root().querySelector(
      'div.asys-field > label.asys-field__label',
    ) as HTMLLabelElement;

    expect(label.textContent?.trim()).toBe('Area');
    expect(select().id).not.toBe('');
    expect(label.getAttribute('for')).toBe(select().id);
  });

  it('renders the options in order with their values and labels', async () => {
    const { select } = await setup();

    const options = Array.from(select().options);

    expect(options.map((o) => o.value)).toEqual(['', 'home', 'work']);
    expect(options.map((o) => o.textContent?.trim())).toEqual(['No area', 'Home', 'Work']);
  });

  describe('value', () => {
    it('selects the option matching the value', async () => {
      const { fixture, host, select } = await setup();

      host.value.set('work');
      await fixture.whenStable();

      expect(select().value).toBe('work');
      expect(select().options[2].selected).toBe(true);
    });

    it('sets the value on a change event', async () => {
      const { host, choose } = await setup();

      await choose('home');

      expect(host.value()).toBe('home');

      await choose('');

      expect(host.value()).toBe('');
    });

    it('selects the matching option when the options are replaced together with the value', async () => {
      const { fixture, host, select } = await setup();

      host.options.set([
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
      ]);
      host.value.set('c');
      await fixture.whenStable();

      expect(Array.from(select().options).map((o) => o.value)).toEqual(['a', 'b', 'c']);
      expect(select().value).toBe('c');
      expect(select().options[2].selected).toBe(true);
    });
  });

  it('sets disabled while disabled', async () => {
    const { fixture, host, select } = await setup();

    expect(select().disabled).toBe(false);

    host.disabled.set(true);
    await fixture.whenStable();

    expect(select().disabled).toBe(true);
  });

  it('emits touch when the select blurs', async () => {
    const { fixture, host, select } = await setup();

    select().dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.touches()).toBe(1);
  });

  describe('messages', () => {
    it('shows no error when errors exist but the field is untouched', async () => {
      const { fixture, host, root } = await setup();

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__error')).toBeNull();
    });

    it('shows the first error when touched with errors', async () => {
      const { fixture, host, root, select } = await setup();

      host.errors.set([
        { kind: 'x', message: 'Pick an area' },
        { kind: 'y', message: 'Second' },
      ]);
      host.touched.set(true);
      await fixture.whenStable();

      const error = root().querySelector('p.asys-field__error') as HTMLElement;

      expect(error.querySelector('span.asys-field__error-word')?.textContent).toBe('Error:');
      expect(error.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: Pick an area');
      expect(select().getAttribute('aria-describedby')).toBe(error.id);
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

    it('shows the hint, referenced by aria-describedby, when there is no error', async () => {
      const { fixture, host, root, select } = await setup();

      expect(select().hasAttribute('aria-describedby')).toBe(false);

      host.hint.set('Where it belongs');
      await fixture.whenStable();

      const hint = root().querySelector('p.asys-field__hint') as HTMLElement;

      expect(hint.textContent?.trim()).toBe('Where it belongs');
      expect(select().getAttribute('aria-describedby')).toBe(hint.id);
    });

    it('replaces the hint with the error', async () => {
      const { fixture, host, root } = await setup();

      host.hint.set('Where it belongs');
      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__hint')).toBeNull();
      expect(root().querySelector('.asys-field__error')).not.toBeNull();
    });

    it('uses paragraph ids that are unique across instances', async () => {
      const fixture = TestBed.createComponent(Pair);
      await fixture.whenStable();

      const selects: HTMLSelectElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('select'),
      );
      const hint = fixture.nativeElement.querySelector('p.asys-field__hint') as HTMLElement;

      expect(selects[0].id).not.toBe(selects[1].id);
      expect(selects[1].getAttribute('aria-describedby')).toBe(hint.id);
      expect(hint.id).not.toBe(selects[0].id);
      expect(hint.id).not.toBe(selects[1].id);
    });
  });

  it('focuses the native select', async () => {
    const { fixture, host, select } = await setup();

    document.body.appendChild(fixture.nativeElement);
    host.field().focus();

    expect(document.activeElement).toBe(select());
  });

  describe('with Signal Forms', () => {
    const setupForm = async () => {
      const fixture = TestBed.createComponent(FormHost);
      await fixture.whenStable();

      const select = (): HTMLSelectElement => fixture.nativeElement.querySelector('select');
      const error = (): HTMLElement | null =>
        fixture.nativeElement.querySelector('p.asys-field__error');

      return { fixture, host: fixture.componentInstance, select, error };
    };

    it('writes a change into the form model', async () => {
      const { fixture, host, select } = await setupForm();

      select().value = 'work';
      select().dispatchEvent(new Event('change', { bubbles: true }));
      await fixture.whenStable();

      expect(host.model().area).toBe('work');
    });

    it('shows a value set on the model', async () => {
      const { fixture, host, select } = await setupForm();

      host.model.set({ area: 'home' });
      await fixture.whenStable();

      expect(select().value).toBe('home');
    });

    it('shows the validation error only after touch', async () => {
      const { fixture, select, error } = await setupForm();

      expect(error()).toBeNull();

      select().dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(error()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: Pick an area');
    });

    it('focuses the control through focusBoundControl', async () => {
      const { fixture, host, select } = await setupForm();

      document.body.appendChild(fixture.nativeElement);
      host.f.area().focusBoundControl();

      expect(document.activeElement).toBe(select());
    });
  });
});
