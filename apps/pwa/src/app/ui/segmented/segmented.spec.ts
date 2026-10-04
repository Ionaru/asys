// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, validate, type ValidationError } from '@angular/forms/signals';

import { Segmented } from './segmented';

@Component({
  imports: [Segmented],
  template: `
    <asys-segmented
      legend="Importance"
      trueLabel="Important"
      falseLabel="Not important"
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
  readonly field = viewChild.required(Segmented);

  readonly value = signal<boolean | null>(null);

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

@Component({
  imports: [Segmented],
  template: `
    <asys-segmented legend="A" trueLabel="Yes" falseLabel="No" />
    <asys-segmented legend="B" trueLabel="Yes" falseLabel="No" hint="Some hint" />
  `,
})
class Pair {}

@Component({
  imports: [Segmented, FormField],
  template: `
    <asys-segmented
      [formField]="f.important"
      legend="Importance"
      trueLabel="Important"
      falseLabel="Not important"
    />
  `,
})
class FormHost {
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
    Array.from(root().querySelectorAll<HTMLButtonElement>('button.asys-segmented__option'));
  const pressed = (): (string | null)[] => options().map((b) => b.getAttribute('aria-pressed'));

  return { fixture, host, root, options, pressed };
};

describe('Segmented', () => {
  it('renders a fieldset with the legend and the true option before the false option', async () => {
    const { root, options } = await setup();

    expect(root().querySelector('fieldset.asys-segmented')).not.toBeNull();
    expect(
      root().querySelector('fieldset > legend.asys-segmented__legend')?.textContent?.trim(),
    ).toBe('Importance');
    expect(root().querySelectorAll('fieldset > div.asys-segmented__options > button').length).toBe(
      2,
    );
    expect(options().map((b) => b.textContent?.trim())).toEqual(['Important', 'Not important']);
    expect(options().every((b) => b.getAttribute('type') === 'button')).toBe(true);
  });

  describe('aria-pressed', () => {
    it('is false on both options when the value is null', async () => {
      const { pressed } = await setup();

      expect(pressed()).toEqual(['false', 'false']);
    });

    it('is true on the true option when the value is true', async () => {
      const { fixture, host, pressed } = await setup();

      host.value.set(true);
      await fixture.whenStable();

      expect(pressed()).toEqual(['true', 'false']);
    });

    it('is true on the false option when the value is false', async () => {
      const { fixture, host, pressed } = await setup();

      host.value.set(false);
      await fixture.whenStable();

      expect(pressed()).toEqual(['false', 'true']);
    });
  });

  describe('clicking', () => {
    it('sets true from the true option and false from the false option', async () => {
      const { fixture, host, options } = await setup();

      options()[0].click();
      await fixture.whenStable();

      expect(host.value()).toBe(true);

      options()[1].click();
      await fixture.whenStable();

      expect(host.value()).toBe(false);
    });

    it('keeps the pressed option when it is clicked again', async () => {
      const { fixture, host, options, pressed } = await setup();

      host.value.set(true);
      await fixture.whenStable();
      options()[0].click();
      await fixture.whenStable();

      expect(host.value()).toBe(true);
      expect(pressed()).toEqual(['true', 'false']);
    });
  });

  it('disables both buttons while disabled', async () => {
    const { fixture, host, options } = await setup();

    expect(options().some((b) => b.disabled)).toBe(false);

    host.disabled.set(true);
    await fixture.whenStable();

    expect(options().every((b) => b.disabled)).toBe(true);
  });

  it('emits touch when a button blurs', async () => {
    const { fixture, host, options } = await setup();

    options()[0].dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.touches()).toBe(1);

    options()[1].dispatchEvent(new Event('blur'));
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
      const second = root.querySelectorAll('asys-segmented')[1];
      const first = root.querySelectorAll('asys-segmented')[0];

      expect(hint.id).not.toBe('');
      expect(first.querySelector(`[aria-describedby="${hint.id}"]`)).toBeNull();
      expect(second.querySelector(`[aria-describedby="${hint.id}"]`)).not.toBeNull();
    });
  });

  it('focuses the true option first', async () => {
    const { fixture, host, options } = await setup();

    document.body.appendChild(fixture.nativeElement);
    host.field().focus();

    expect(document.activeElement).toBe(options()[0]);
  });

  describe('with Signal Forms', () => {
    const setupForm = async () => {
      const fixture = TestBed.createComponent(FormHost);
      await fixture.whenStable();

      const root: HTMLElement = fixture.nativeElement;
      const options = (): HTMLButtonElement[] =>
        Array.from(root.querySelectorAll<HTMLButtonElement>('button.asys-segmented__option'));
      const error = (): HTMLElement | null => root.querySelector('p.asys-field__error');

      return { fixture, host: fixture.componentInstance, root, options, error };
    };

    it('writes a click into the form model', async () => {
      const { fixture, host, options } = await setupForm();

      options()[1].click();
      await fixture.whenStable();

      expect(host.model().important).toBe(false);

      options()[0].click();
      await fixture.whenStable();

      expect(host.model().important).toBe(true);
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
