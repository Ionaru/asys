// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, validate, type ValidationError } from '@angular/forms/signals';

import { IMPORTANCE_OPTIONS } from '../../support/importance-options';
import { SegmentedControl, SegmentedControlLayout, type SegmentOption } from './segmented-control';

const ABC: readonly SegmentOption<string>[] = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
  { value: 'c', label: 'C' },
];

@Component({
  imports: [SegmentedControl],
  template: `
    <asys-segmented-control
      legend="Pick"
      [options]="options()"
      [layout]="layout()"
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
  readonly field = viewChild.required(SegmentedControl);

  readonly options = signal<readonly SegmentOption<string>[]>(ABC);

  readonly layout = signal<SegmentedControlLayout>(SegmentedControlLayout.Wrap);

  readonly value = signal<string | null>(null);

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

@Component({
  imports: [SegmentedControl],
  template: `
    <asys-segmented-control legend="A" [options]="options" />
    <asys-segmented-control legend="B" [options]="options" hint="Some hint" />
  `,
})
class Pair {
  readonly options = ABC;
}

@Component({
  imports: [SegmentedControl, FormField],
  template: `
    <asys-segmented-control
      [formField]="f.important"
      legend="Importance"
      [options]="importanceOptions"
    />
  `,
})
class FormHost {
  readonly importanceOptions = IMPORTANCE_OPTIONS;

  readonly model = signal<{ important: boolean | null }>({ important: null });

  readonly f = form(this.model, (p) => {
    validate(p.important, ({ value }) =>
      value() === null ? { kind: 'important', message: 'Choose one' } : undefined,
    );
  });
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const options = (): HTMLButtonElement[] =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('asys-segmented-control .asys-segment'));
  const pressed = (): (string | null)[] => options().map((b) => b.getAttribute('aria-pressed'));

  return { fixture, host, root, options, pressed };
};

describe('SegmentedControl', () => {
  it('renders a fieldset with the legend and one Segment per option in order', async () => {
    const { root, options } = await setup();

    expect(
      root().querySelector('fieldset.asys-fieldset-reset.asys-segmented-control'),
    ).not.toBeNull();
    expect(root().querySelector('fieldset > legend.asys-label')?.textContent?.trim()).toBe('Pick');
    expect(
      root().querySelectorAll(
        'fieldset > div.asys-segmented-control__options > button.asys-segment',
      ).length,
    ).toBe(3);
    expect(options().map((b) => b.textContent?.trim())).toEqual(['A', 'B', 'C']);
    expect(options().every((b) => b.getAttribute('type') === 'button')).toBe(true);
  });

  describe('aria-pressed', () => {
    it('is false on every option when the value is null', async () => {
      const { pressed } = await setup();

      expect(pressed()).toEqual(['false', 'false', 'false']);
    });

    it('presses only the option whose value matches', async () => {
      const { fixture, host, pressed } = await setup();

      host.value.set('b');
      await fixture.whenStable();

      expect(pressed()).toEqual(['false', 'true', 'false']);
    });

    it('presses nothing for a value that is not an option', async () => {
      const { fixture, host, pressed } = await setup();

      host.value.set('z');
      await fixture.whenStable();

      expect(pressed()).toEqual(['false', 'false', 'false']);
    });
  });

  describe('clicking', () => {
    it('sets the value of the clicked option', async () => {
      const { fixture, host, options } = await setup();

      options()[2].click();
      await fixture.whenStable();

      expect(host.value()).toBe('c');
    });

    it('keeps the value when the pressed option is clicked again', async () => {
      const { fixture, host, options, pressed } = await setup();

      options()[2].click();
      await fixture.whenStable();
      options()[2].click();
      await fixture.whenStable();

      expect(host.value()).toBe('c');
      expect(pressed()).toEqual(['false', 'false', 'true']);
    });
  });

  describe('layout', () => {
    it('adds the fill modifier only for the Fill layout', async () => {
      const { fixture, host, root } = await setup();
      const fieldset = (): Element | null => root().querySelector('fieldset');

      expect(fieldset()?.classList.contains('asys-segmented-control--fill')).toBe(false);

      host.layout.set(SegmentedControlLayout.Fill);
      await fixture.whenStable();

      expect(fieldset()?.classList.contains('asys-segmented-control--fill')).toBe(true);

      host.layout.set(SegmentedControlLayout.Wrap);
      await fixture.whenStable();

      expect(fieldset()?.classList.contains('asys-segmented-control--fill')).toBe(false);
    });
  });

  it('re-renders when the options change', async () => {
    const { fixture, host, options } = await setup();

    host.options.set([
      { value: 'd', label: 'D' },
      { value: 'e', label: 'E' },
    ]);
    await fixture.whenStable();

    expect(options().map((b) => b.textContent?.trim())).toEqual(['D', 'E']);
  });

  it('disables every Segment while disabled', async () => {
    const { fixture, host, options } = await setup();

    expect(options().some((b) => b.disabled)).toBe(false);

    host.disabled.set(true);
    await fixture.whenStable();

    expect(options().every((b) => b.disabled)).toBe(true);
  });

  it('emits touch when a Segment blurs', async () => {
    const { fixture, host, options } = await setup();

    options()[0].dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.touches()).toBe(1);

    options()[2].dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.touches()).toBe(2);
  });

  describe('messages', () => {
    it('shows no error when errors exist but the field is untouched', async () => {
      const { fixture, host, root } = await setup();

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__error')).toBeNull();
    });

    it('shows the first error when touched with errors', async () => {
      const { fixture, host, root } = await setup();

      host.errors.set([
        { kind: 'x', message: 'Choose one' },
        { kind: 'y', message: 'Second' },
      ]);
      host.touched.set(true);
      await fixture.whenStable();

      const error = root().querySelector('p.asys-field__error') as HTMLElement;

      expect(error.querySelector('span.asys-field__error-word')?.textContent).toBe('Error:');
      expect(error.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: Choose one');
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

    it('shows the hint when there is no error and replaces it with the error', async () => {
      const { fixture, host, root } = await setup();

      host.hint.set('Pick one');
      await fixture.whenStable();

      expect(root().querySelector('p.asys-field__hint')?.textContent?.trim()).toBe('Pick one');

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__hint')).toBeNull();
      expect(root().querySelector('.asys-field__error')).not.toBeNull();
    });

    it('renders no message paragraph without hint or error', async () => {
      const { root } = await setup();

      expect(root().querySelector('.asys-field__hint, .asys-field__error')).toBeNull();
    });
  });

  describe('aria-describedby', () => {
    it('is absent without a message paragraph', async () => {
      const { options } = await setup();

      expect(options().some((b) => b.hasAttribute('aria-describedby'))).toBe(false);
    });

    it('points at the hint paragraph', async () => {
      const { fixture, host, root, options } = await setup();

      host.hint.set('Pick one');
      await fixture.whenStable();

      const hint = root().querySelector('p.asys-field__hint') as HTMLElement;

      expect(hint.id).not.toBe('');
      expect(options().some((b) => b.getAttribute('aria-describedby') === hint.id)).toBe(true);
    });

    it('points at the error paragraph', async () => {
      const { fixture, host, root, options } = await setup();

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();

      const error = root().querySelector('p.asys-field__error') as HTMLElement;

      expect(error.id).not.toBe('');
      expect(options().some((b) => b.getAttribute('aria-describedby') === error.id)).toBe(true);
    });

    it('uses paragraph ids that are unique across instances', async () => {
      const fixture = TestBed.createComponent(Pair);
      await fixture.whenStable();

      const root: HTMLElement = fixture.nativeElement;
      const hint = root.querySelector('p.asys-field__hint') as HTMLElement;
      const second = root.querySelectorAll('asys-segmented-control')[1];
      const first = root.querySelectorAll('asys-segmented-control')[0];

      expect(hint.id).not.toBe('');
      expect(first.querySelector(`[aria-describedby="${hint.id}"]`)).toBeNull();
      expect(second.querySelector(`[aria-describedby="${hint.id}"]`)).not.toBeNull();
    });
  });

  describe('focus', () => {
    it('focuses the first option', async () => {
      const { fixture, host, options } = await setup();

      document.body.appendChild(fixture.nativeElement);
      host.field().focus();

      expect(document.activeElement).toBe(options()[0]);
    });

    it('does nothing without options', async () => {
      const { fixture, host } = await setup();

      host.options.set([]);
      await fixture.whenStable();

      expect(() => host.field().focus()).not.toThrow();
    });
  });

  describe('with Signal Forms', () => {
    const setupForm = async () => {
      const fixture = TestBed.createComponent(FormHost);
      await fixture.whenStable();

      const root: HTMLElement = fixture.nativeElement;
      const options = (): HTMLButtonElement[] =>
        Array.from(
          root.querySelectorAll<HTMLButtonElement>('asys-segmented-control .asys-segment'),
        );
      const error = (): HTMLElement | null => root.querySelector('p.asys-field__error');

      return { fixture, host: fixture.componentInstance, root, options, error };
    };

    it('lists Important first and writes a click into the form model', async () => {
      const { fixture, host, options } = await setupForm();

      expect(options().map((b) => b.textContent?.trim())).toEqual(['Important', 'Not important']);

      options()[1].click();
      await fixture.whenStable();

      expect(host.model().important).toBe(false);
    });

    it('shows a value set on the model', async () => {
      const { fixture, host, options } = await setupForm();

      host.model.set({ important: true });
      await fixture.whenStable();

      expect(options().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    });

    it('shows the null validation error only after touch', async () => {
      const { fixture, options, error } = await setupForm();

      expect(error()).toBeNull();

      options()[0].dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(error()?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: Choose one');
    });

    it('clears the error once a choice is made', async () => {
      const { fixture, options, error } = await setupForm();

      options()[0].dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      options()[1].click();
      await fixture.whenStable();

      expect(error()).toBeNull();
    });

    it('focuses the control through focusBoundControl', async () => {
      const { fixture, host, options } = await setupForm();

      document.body.appendChild(fixture.nativeElement);
      host.f.important().focusBoundControl();

      expect(document.activeElement).toBe(options()[0]);
    });
  });
});
