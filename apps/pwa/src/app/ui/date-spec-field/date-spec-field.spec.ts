// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, validate, type ValidationError } from '@angular/forms/signals';
import type { DateSpec } from '@asys/domain';

import { DateSpecField } from './date-spec-field';

@Component({
  imports: [DateSpecField],
  template: `
    <asys-date-spec-field
      legend="Due"
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
  readonly field = viewChild.required(DateSpecField);

  readonly value = signal<DateSpec | null>(null);

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

@Component({
  imports: [DateSpecField],
  template: `
    <asys-date-spec-field legend="A" />
    <asys-date-spec-field legend="B" hint="Some hint" />
  `,
})
class Pair {}

@Component({
  imports: [DateSpecField, FormField],
  template: `<asys-date-spec-field [formField]="f.due" legend="Due" />`,
})
class FormHost {
  readonly model = signal<{ due: DateSpec | null }>({ due: null });

  readonly f = form(this.model, (p) => {
    validate(p.due, ({ value }) =>
      value() === null ? { kind: 'due', message: 'Set a due date' } : undefined,
    );
  });
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const finders = (root: () => HTMLElement) => {
  const dateInput = (): HTMLInputElement =>
    root().querySelector('input[type="date"]') as HTMLInputElement;
  const timeInput = (): HTMLInputElement =>
    root().querySelector('input[type="time"]') as HTMLInputElement;
  const clear = (): HTMLButtonElement | null =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Clear',
    ) ?? null;
  const error = (): HTMLElement | null => root().querySelector('p.asys-field__error');

  return { dateInput, timeInput, clear, error };
};

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const f = finders(root);
  const enter = async (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };

  return {
    fixture,
    host,
    root,
    ...f,
    typeDate: (text: string) => enter(f.dateInput(), text),
    typeTime: (text: string) => enter(f.timeInput(), text),
  };
};

describe('DateSpecField', () => {
  describe('markup', () => {
    it('renders a fieldset with the legend as a field label', async () => {
      const { root } = await setup();

      const legend = root().querySelector(
        'fieldset.asys-date-spec > legend.asys-field__label',
      ) as HTMLElement;

      expect(legend.textContent?.trim()).toBe('Due');
    });

    it('renders a labelled date input and a labelled time input', async () => {
      const { dateInput, timeInput } = await setup();

      expect(dateInput().classList.contains('asys-field__input')).toBe(true);
      expect(timeInput().classList.contains('asys-field__input')).toBe(true);
      expect(Array.from(dateInput().labels ?? []).map((l) => l.textContent?.trim())).toEqual([
        'Date',
      ]);
      expect(Array.from(timeInput().labels ?? []).map((l) => l.textContent?.trim())).toEqual([
        'Time',
      ]);
      expect(dateInput().id).not.toBe(timeInput().id);
    });

    it('shows an empty date and time when the value is null', async () => {
      const { dateInput, timeInput } = await setup();

      expect(dateInput().value).toBe('');
      expect(timeInput().value).toBe('');
    });

    it('shows the date and time of the value', async () => {
      const { fixture, host, dateInput, timeInput } = await setup();

      host.value.set({ date: '2026-10-04', time: '09:05' });
      await fixture.whenStable();

      expect(dateInput().value).toBe('2026-10-04');
      expect(timeInput().value).toBe('09:05');
    });

    it('shows an empty time for a date-only value', async () => {
      const { fixture, host, dateInput, timeInput } = await setup();

      host.value.set({ date: '2026-10-04' });
      await fixture.whenStable();

      expect(dateInput().value).toBe('2026-10-04');
      expect(timeInput().value).toBe('');
    });
  });

  describe('date input', () => {
    it('sets a date-only value from a null value', async () => {
      const { host, typeDate } = await setup();

      await typeDate('2026-10-04');

      expect(host.value()).toStrictEqual({ date: '2026-10-04' });
    });

    it('keeps the time of the current value', async () => {
      const { fixture, host, typeDate } = await setup();

      host.value.set({ date: '2026-10-04', time: '09:00' });
      await fixture.whenStable();
      await typeDate('2026-10-05');

      expect(host.value()).toStrictEqual({ date: '2026-10-05', time: '09:00' });
    });

    it('sets null and drops the time when the date is emptied', async () => {
      const { fixture, host, typeDate } = await setup();

      host.value.set({ date: '2026-10-04', time: '09:00' });
      await fixture.whenStable();
      await typeDate('');

      expect(host.value()).toBeNull();
    });

    it('reads an invalid date as empty and sets null', async () => {
      const { fixture, host, typeDate } = await setup();

      host.value.set({ date: '2026-10-04' });
      await fixture.whenStable();
      await typeDate('not-a-date');

      expect(host.value()).toBeNull();
    });
  });

  describe('time input', () => {
    it('is disabled while the value is null and enabled otherwise', async () => {
      const { fixture, host, timeInput, dateInput } = await setup();

      expect(timeInput().disabled).toBe(true);
      expect(dateInput().disabled).toBe(false);

      host.value.set({ date: '2026-10-04' });
      await fixture.whenStable();

      expect(timeInput().disabled).toBe(false);
    });

    it('adds the time to the value', async () => {
      const { fixture, host, typeTime } = await setup();

      host.value.set({ date: '2026-10-04' });
      await fixture.whenStable();
      await typeTime('14:30');

      expect(host.value()).toStrictEqual({ date: '2026-10-04', time: '14:30' });
    });

    it('strips seconds', async () => {
      const { fixture, host, typeTime } = await setup();

      host.value.set({ date: '2026-10-04' });
      await fixture.whenStable();
      await typeTime('09:05:30');

      expect(host.value()).toStrictEqual({ date: '2026-10-04', time: '09:05' });
    });

    it('removes the time key when emptied', async () => {
      const { fixture, host, typeTime } = await setup();

      host.value.set({ date: '2026-10-04', time: '09:00' });
      await fixture.whenStable();
      await typeTime('');

      expect(host.value()).toStrictEqual({ date: '2026-10-04' });
      expect('time' in (host.value() as DateSpec)).toBe(false);
    });

    it('is ignored while the value is null', async () => {
      const { host, typeTime } = await setup();

      await typeTime('09:00');

      expect(host.value()).toBeNull();
    });
  });

  describe('Clear', () => {
    it('is absent while the value is null and present otherwise', async () => {
      const { fixture, host, clear } = await setup();

      expect(clear()).toBeNull();

      host.value.set({ date: '2026-10-04' });
      await fixture.whenStable();

      expect(clear()).not.toBeNull();
      expect(clear()?.getAttribute('type')).toBe('button');
      expect(clear()?.classList.contains('asys-button')).toBe(true);
    });

    it('sets the value to null and focuses the date input', async () => {
      const { fixture, host, clear, dateInput } = await setup();

      document.body.appendChild(fixture.nativeElement);
      host.value.set({ date: '2026-10-04', time: '09:00' });
      await fixture.whenStable();

      (clear() as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(host.value()).toBeNull();
      expect(dateInput().value).toBe('');
      expect(clear()).toBeNull();
      expect(document.activeElement).toBe(dateInput());
    });
  });

  it('disables both inputs while disabled', async () => {
    const { fixture, host, dateInput, timeInput } = await setup();

    host.value.set({ date: '2026-10-04' });
    host.disabled.set(true);
    await fixture.whenStable();

    expect(dateInput().disabled).toBe(true);
    expect(timeInput().disabled).toBe(true);
  });

  it('emits touch when an input blurs', async () => {
    const { fixture, host, dateInput, timeInput } = await setup();

    dateInput().dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.touches()).toBe(1);

    timeInput().dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(host.touches()).toBe(2);
  });

  describe('messages', () => {
    it('shows no error when errors exist but the field is untouched', async () => {
      const { fixture, host, error } = await setup();

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      await fixture.whenStable();

      expect(error()).toBeNull();
    });

    it('shows the first error when touched with errors', async () => {
      const { fixture, host, error } = await setup();

      host.errors.set([
        { kind: 'x', message: 'Set a due date' },
        { kind: 'y', message: 'Second' },
      ]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(error()?.querySelector('span.asys-field__error-word')?.textContent).toBe('Error:');
      expect(squash(error()?.textContent)).toBe('Error: Set a due date');
    });

    it('falls back to "Check this value" for an error without a message', async () => {
      const { fixture, host, error } = await setup();

      host.errors.set([{ kind: 'x' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(squash(error()?.textContent)).toBe('Error: Check this value');
    });

    it('shows the hint without an error and replaces it with the error', async () => {
      const { fixture, host, root, error } = await setup();

      host.hint.set('When it is due');
      await fixture.whenStable();

      expect(root().querySelector('p.asys-field__hint')?.textContent?.trim()).toBe(
        'When it is due',
      );

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__hint')).toBeNull();
      expect(error()).not.toBeNull();
    });

    it('references the message paragraph from a native control', async () => {
      const { fixture, host, root, dateInput } = await setup();

      expect(dateInput().hasAttribute('aria-describedby')).toBe(false);

      host.hint.set('When it is due');
      await fixture.whenStable();

      const hint = root().querySelector('p.asys-field__hint') as HTMLElement;

      expect(hint.id).not.toBe('');
      expect(root().querySelector(`[aria-describedby="${hint.id}"]`)).not.toBeNull();
    });

    it('uses paragraph ids that are unique across instances', async () => {
      const fixture = TestBed.createComponent(Pair);
      await fixture.whenStable();

      const fields = fixture.nativeElement.querySelectorAll('asys-date-spec-field');
      const hint = fixture.nativeElement.querySelector('p.asys-field__hint') as HTMLElement;

      expect(hint.id).not.toBe('');
      expect(fields[0].querySelector(`[aria-describedby="${hint.id}"]`)).toBeNull();
      expect(fields[1].querySelector(`[aria-describedby="${hint.id}"]`)).not.toBeNull();
    });
  });

  it('focuses the date input', async () => {
    const { fixture, host, dateInput } = await setup();

    document.body.appendChild(fixture.nativeElement);
    host.field().focus();

    expect(document.activeElement).toBe(dateInput());
  });

  describe('with Signal Forms', () => {
    const setupForm = async () => {
      const fixture = TestBed.createComponent(FormHost);
      await fixture.whenStable();

      const root = (): HTMLElement => fixture.nativeElement;
      const f = finders(root);
      const enter = async (input: HTMLInputElement, text: string) => {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await fixture.whenStable();
      };

      return {
        fixture,
        host: fixture.componentInstance,
        ...f,
        typeDate: (text: string) => enter(f.dateInput(), text),
        typeTime: (text: string) => enter(f.timeInput(), text),
      };
    };

    it('writes date and time into the form model as one object', async () => {
      const { host, typeDate, typeTime } = await setupForm();

      await typeDate('2026-10-04');

      expect(host.model().due).toStrictEqual({ date: '2026-10-04' });

      await typeTime('08:15');

      expect(host.model().due).toStrictEqual({ date: '2026-10-04', time: '08:15' });
    });

    it('shows a value set on the model', async () => {
      const { fixture, host, dateInput, timeInput } = await setupForm();

      host.model.set({ due: { date: '2026-12-31', time: '23:59' } });
      await fixture.whenStable();

      expect(dateInput().value).toBe('2026-12-31');
      expect(timeInput().value).toBe('23:59');
    });

    it('shows the null validation error only after touch', async () => {
      const { fixture, dateInput, error } = await setupForm();

      expect(error()).toBeNull();

      dateInput().dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(squash(error()?.textContent)).toBe('Error: Set a due date');
    });

    it('focuses the control through focusBoundControl', async () => {
      const { fixture, host, dateInput } = await setupForm();

      document.body.appendChild(fixture.nativeElement);
      host.f.due().focusBoundControl();

      expect(document.activeElement).toBe(dateInput());
    });
  });
});
