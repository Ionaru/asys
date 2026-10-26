// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { disabled, form, FormField, validate, type ValidationError } from '@angular/forms/signals';
import type { DateSpec } from '@asys/domain';

import { DateField } from './date-field';

const TODAY = '2026-10-13';

@Component({
  imports: [DateField],
  template: `
    <asys-date-field
      label="Due"
      noneLabel="None"
      removeLabel="Remove Due"
      timePrefix="Due at"
      [today]="today"
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
  readonly field = viewChild.required(DateField);

  readonly today = TODAY;

  readonly value = signal<DateSpec | null>(null);

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

@Component({
  imports: [DateField, FormField],
  template: `
    <asys-date-field
      [formField]="f.due"
      label="Due"
      noneLabel="None"
      removeLabel="Remove Due"
      timePrefix="Due at"
      [today]="today"
    />
  `,
})
class FormHost {
  readonly today = TODAY;

  readonly model = signal<{ due: DateSpec | null }>({ due: null });

  readonly disabledForm = signal(false);

  readonly f = form(this.model, (p) => {
    validate(p.due, ({ value }) =>
      value() === null ? { kind: 'due', message: 'Pick a Due date' } : undefined,
    );
    disabled(p.due, { when: () => this.disabledForm() });
  });
}

@Component({
  imports: [DateField],
  template: `
    <asys-date-field
      label="Available from"
      noneLabel="Any time"
      removeLabel="Remove Available from"
      timePrefix="Available from"
      [today]="today"
      [value]="value()"
    />
  `,
})
class AvailableHost {
  readonly today = TODAY;

  readonly value = signal<DateSpec | null>({ date: '2026-10-19', time: '09:00' });
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const finders = (root: () => HTMLElement) => {
  const row = (): HTMLButtonElement =>
    root().querySelector('button.asys-date-row__open') as HTMLButtonElement;
  const timeButton = (): HTMLButtonElement | null =>
    root().querySelector<HTMLButtonElement>('button.asys-date-row__time');
  const dialog = (heading: string): HTMLDialogElement =>
    Array.from(root().querySelectorAll<HTMLDialogElement>('dialog.asys-sheet')).find(
      (d) => squash(d.querySelector('h2.asys-sheet__heading')?.textContent) === heading,
    ) as HTMLDialogElement;
  const dateDialog = (): HTMLDialogElement => dialog('Due');
  const timeDialog = (): HTMLDialogElement => dialog('Time');
  const error = (): HTMLElement | null => root().querySelector('p[asys-field-error]');

  return { row, timeButton, dateDialog, timeDialog, error };
};

const actions = (fixture: { whenStable: () => Promise<unknown> }) => {
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };
  const change = async (input: HTMLInputElement, text: string): Promise<void> => {
    input.value = text;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
  };

  return { press, change };
};

const setup = async (value: DateSpec | null = null) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.value.set(value);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const f = finders(root);
  const { press, change } = actions(fixture);
  const dateChips = (): HTMLButtonElement[] =>
    Array.from(
      f
        .dateDialog()
        .querySelectorAll<HTMLButtonElement>('.asys-date-picker__chips > .asys-segment'),
    );
  const dayButton = (label: string): HTMLButtonElement =>
    f
      .dateDialog()
      .querySelector(`button.asys-date-picker__day[aria-label="${label}"]`) as HTMLButtonElement;
  const dateRemove = (): HTMLButtonElement | null =>
    f.dateDialog().querySelector<HTMLButtonElement>('button.asys-date-picker__remove');
  const dateInput = (): HTMLInputElement =>
    f.dateDialog().querySelector('input[type="date"]') as HTMLInputElement;
  const timeChip = (text: string): HTMLButtonElement =>
    Array.from(
      f
        .timeDialog()
        .querySelectorAll<HTMLButtonElement>('.asys-time-picker__chips > button.asys-segment'),
    ).find((b) => squash(b.textContent) === text) as HTMLButtonElement;
  const timeInput = (): HTMLInputElement =>
    f.timeDialog().querySelector('input[type="time"]') as HTMLInputElement;
  const timeRemove = (): HTMLButtonElement | undefined =>
    Array.from(f.timeDialog().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => squash(b.textContent) === 'Remove time',
    );

  return {
    fixture,
    host,
    root,
    ...f,
    press,
    change,
    dateChips,
    dayButton,
    dateRemove,
    dateInput,
    timeChip,
    timeInput,
    timeRemove,
  };
};

describe('DateField', () => {
  describe('the row', () => {
    it('shows the label and the none label while there is no value', async () => {
      const { row } = await setup();

      expect(squash(row().querySelector('.asys-field-row__label')?.textContent)).toBe('Due');

      const value = row().querySelector('.asys-field-row__value') as HTMLElement;

      expect(squash(value.textContent)).toBe('None');
      expect(value.classList.contains('asys-field-row__value--set')).toBe(false);
      expect(row().getAttribute('type')).toBe('button');
    });

    it.each([
      ['2026-10-14', 'Tomorrow'],
      ['2026-10-19', 'Mon 19 Oct'],
      ['2026-10-13', 'Today'],
    ])('shows %s as %s and marks the value as set', async (date, text) => {
      const { row } = await setup({ date });
      const value = row().querySelector('.asys-field-row__value') as HTMLElement;

      expect(squash(value.textContent)).toBe(text);
      expect(value.classList.contains('asys-field-row__value--set')).toBe(true);
    });

    it('updates the text when the value changes', async () => {
      const { fixture, host, row } = await setup({ date: '2026-10-14' });

      host.value.set(null);
      await fixture.whenStable();

      expect(squash(row().querySelector('.asys-field-row__value')?.textContent)).toBe('None');
    });

    it('uses the none label it is given', async () => {
      const fixture = TestBed.createComponent(AvailableHost);

      fixture.componentInstance.value.set(null);
      await fixture.whenStable();

      expect(
        squash(fixture.nativeElement.querySelector('.asys-field-row__value')?.textContent),
      ).toBe('Any time');
    });

    it('has a popup on the row button', async () => {
      const { row } = await setup();

      expect(row().getAttribute('aria-haspopup')).toBe('dialog');
    });
  });

  describe('the time button', () => {
    it('is absent without a value', async () => {
      const { timeButton } = await setup();

      expect(timeButton()).toBeNull();
    });

    it('offers to add a time when the value has a date only', async () => {
      const { timeButton } = await setup({ date: '2026-10-14' });
      const button = timeButton() as HTMLButtonElement;

      expect(button.getAttribute('type')).toBe('button');
      expect(button.getAttribute('aria-label')).toBe('Add a time to Due');
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      expect(button.querySelector('asys-icon')).not.toBeNull();
      expect(squash(button.textContent)).toBe('');
      expect(button.classList.contains('asys-date-row__time--set')).toBe(false);
    });

    it('shows the time and names it when the value has one', async () => {
      const { timeButton } = await setup({ date: '2026-10-14', time: '17:00' });
      const button = timeButton() as HTMLButtonElement;

      expect(button.getAttribute('aria-label')).toBe('Due at 17:00, change time');
      expect(squash(button.textContent)).toBe('17:00');
      expect(button.classList.contains('asys-date-row__time--set')).toBe(true);
      expect(button.classList.contains('asys-num')).toBe(true);
    });

    it('uses the time prefix it is given', async () => {
      const fixture = TestBed.createComponent(AvailableHost);
      await fixture.whenStable();

      const button = fixture.nativeElement.querySelector(
        'button.asys-date-row__time',
      ) as HTMLButtonElement;

      expect(button.getAttribute('aria-label')).toBe('Available from 09:00, change time');
    });

    it('disappears when the value becomes null', async () => {
      const { fixture, host, timeButton } = await setup({ date: '2026-10-14' });

      host.value.set(null);
      await fixture.whenStable();

      expect(timeButton()).toBeNull();
    });
  });

  describe('the date sheet', () => {
    it('is closed at first and holds a date pick once the row is pressed', async () => {
      const { fixture, row, press, dateDialog } = await setup();

      expect(dateDialog().open).toBe(false);
      expect(dateDialog().querySelector('asys-date-picker')).toBeNull();

      await press(row());

      expect(dateDialog().open).toBe(true);
      expect(dateDialog().querySelector('asys-date-picker')).not.toBeNull();
      expect(fixture.nativeElement.querySelectorAll('dialog.asys-sheet')).toHaveLength(2);
    });

    it('is headed with the label it is given', async () => {
      const fixture = TestBed.createComponent(AvailableHost);
      await fixture.whenStable();

      const headings = Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('dialog.asys-sheet h2.asys-sheet__heading'),
      ).map((h) => squash(h.textContent));

      expect(headings).toEqual(['Available from', 'Time']);
    });

    it('also opens from the keyboard activation of the row', async () => {
      const { fixture, row, dateDialog } = await setup();

      row().click();
      await fixture.whenStable();

      expect(dateDialog().open).toBe(true);
    });

    it('picks a quick date, sets the date only and closes', async () => {
      const { host, row, press, dateChips, dateDialog } = await setup();

      await press(row());

      expect(dateChips().map((b) => squash(b.textContent))).toEqual([
        'Today',
        'Tomorrow',
        'Mon 19 Oct',
      ]);

      await press(dateChips()[1]);

      expect(host.value()).toStrictEqual({ date: '2026-10-14' });
      expect(Object.keys(host.value() as DateSpec)).toEqual(['date']);
      expect(dateDialog().open).toBe(false);
      expect(dateDialog().querySelector('asys-date-picker')).toBeNull();
    });

    it('picks a calendar day', async () => {
      const { host, row, press, dayButton, dateDialog } = await setup();

      await press(row());
      await press(dayButton('Thu 15 Oct'));

      expect(host.value()).toStrictEqual({ date: '2026-10-15' });
      expect(dateDialog().open).toBe(false);
    });

    it('keeps the existing time when another day is picked', async () => {
      const { host, row, press, dayButton, dateDialog } = await setup({
        date: '2026-10-14',
        time: '17:00',
      });

      await press(row());
      await press(dayButton('Thu 15 Oct'));

      expect(host.value()).toStrictEqual({ date: '2026-10-15', time: '17:00' });
      expect(dateDialog().open).toBe(false);
    });

    it('picks the date typed in Other date on change', async () => {
      const { host, row, press, change, dateInput, dateDialog } = await setup({
        date: '2026-10-14',
        time: '09:00',
      });

      await press(row());
      await change(dateInput(), '2026-11-02');

      expect(host.value()).toStrictEqual({ date: '2026-11-02', time: '09:00' });
      expect(dateDialog().open).toBe(false);
    });

    it('has no Remove button without a value', async () => {
      const { row, press, dateRemove } = await setup();

      await press(row());

      expect(dateRemove()).toBeNull();
    });

    it('removes the Due date, sets null and closes', async () => {
      const { host, row, press, dateRemove, dateDialog, timeButton } = await setup({
        date: '2026-10-14',
        time: '17:00',
      });

      await press(row());

      expect(squash(dateRemove()?.textContent)).toBe('Remove Due');

      await press(dateRemove() as HTMLButtonElement);

      expect(host.value()).toBeNull();
      expect(dateDialog().open).toBe(false);
      expect(timeButton()).toBeNull();
    });

    it('leaves the value alone when the sheet is opened and dismissed', async () => {
      const { fixture, host, row, press, dateDialog } = await setup({
        date: '2026-10-14',
        time: '17:00',
      });

      await press(row());
      dateDialog().open = false;
      dateDialog().dispatchEvent(new Event('close'));
      await fixture.whenStable();

      expect(dateDialog().open).toBe(false);
      expect(host.value()).toStrictEqual({ date: '2026-10-14', time: '17:00' });
    });
  });

  describe('the time sheet', () => {
    it('opens from the time button with the day as context', async () => {
      const { timeButton, press, timeDialog, dateDialog } = await setup({ date: '2026-10-14' });

      expect(timeDialog().open).toBe(false);

      await press(timeButton() as HTMLButtonElement);

      expect(timeDialog().open).toBe(true);
      expect(dateDialog().open).toBe(false);
      expect(timeDialog().querySelector('asys-time-picker')).not.toBeNull();
      expect(squash(timeDialog().querySelector('.asys-time-picker__context')?.textContent)).toBe(
        'Due tomorrow',
      );
    });

    it('uses the label and the day name for a later date', async () => {
      const fixture = TestBed.createComponent(AvailableHost);
      await fixture.whenStable();

      const button = fixture.nativeElement.querySelector(
        'button.asys-date-row__time',
      ) as HTMLButtonElement;

      button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      await fixture.whenStable();

      expect(
        squash(fixture.nativeElement.querySelector('.asys-time-picker__context')?.textContent),
      ).toBe('Available from Mon 19 Oct');
    });

    it('sets the time of a chip, keeps the date and closes', async () => {
      const { host, timeButton, press, timeChip, timeDialog } = await setup({
        date: '2026-10-14',
      });

      await press(timeButton() as HTMLButtonElement);
      await press(timeChip('17:00'));

      expect(host.value()).toStrictEqual({ date: '2026-10-14', time: '17:00' });
      expect(timeDialog().open).toBe(false);
      expect(timeDialog().querySelector('asys-time-picker')).toBeNull();
    });

    it('replaces an existing time', async () => {
      const { host, timeButton, press, timeChip } = await setup({
        date: '2026-10-14',
        time: '09:00',
      });

      await press(timeButton() as HTMLButtonElement);
      await press(timeChip('12:00'));

      expect(host.value()).toStrictEqual({ date: '2026-10-14', time: '12:00' });
    });

    it('sets the time typed in Other time on change', async () => {
      const { host, timeButton, press, change, timeInput, timeDialog } = await setup({
        date: '2026-10-14',
      });

      await press(timeButton() as HTMLButtonElement);
      await change(timeInput(), '13:45');

      expect(host.value()).toStrictEqual({ date: '2026-10-14', time: '13:45' });
      expect(timeDialog().open).toBe(false);
    });

    it('has no Remove time button while no time is set', async () => {
      const { timeButton, press, timeRemove } = await setup({ date: '2026-10-14' });

      await press(timeButton() as HTMLButtonElement);

      expect(timeRemove()).toBeUndefined();
    });

    it('removes the time and leaves a value with no time key', async () => {
      const { host, timeButton, press, timeRemove, timeDialog } = await setup({
        date: '2026-10-14',
        time: '17:00',
      });

      await press(timeButton() as HTMLButtonElement);
      await press(timeRemove() as HTMLButtonElement);

      expect(host.value()).toStrictEqual({ date: '2026-10-14' });
      expect(Object.keys(host.value() as DateSpec)).toEqual(['date']);
      expect(timeDialog().open).toBe(false);
      expect(timeButton()?.classList.contains('asys-date-row__time--set')).toBe(false);
    });

    it('leaves the value alone when the sheet is opened and dismissed', async () => {
      const { fixture, host, timeButton, press, timeDialog } = await setup({
        date: '2026-10-14',
        time: '17:00',
      });

      await press(timeButton() as HTMLButtonElement);
      timeDialog().open = false;
      timeDialog().dispatchEvent(new Event('close'));
      await fixture.whenStable();

      expect(timeDialog().open).toBe(false);
      expect(host.value()).toStrictEqual({ date: '2026-10-14', time: '17:00' });
    });
  });

  describe('disabled', () => {
    it('disables both buttons', async () => {
      const { fixture, host, row, timeButton } = await setup({ date: '2026-10-14' });

      expect(row().disabled).toBe(false);
      expect(timeButton()?.disabled).toBe(false);

      host.disabled.set(true);
      await fixture.whenStable();

      expect(row().disabled).toBe(true);
      expect(timeButton()?.disabled).toBe(true);
    });

    it('opens no sheet when a disabled button is clicked', async () => {
      const { fixture, host, row, timeButton, dateDialog, timeDialog } = await setup({
        date: '2026-10-14',
      });

      host.disabled.set(true);
      await fixture.whenStable();
      row().click();
      timeButton()?.click();
      await fixture.whenStable();

      expect(dateDialog().open).toBe(false);
      expect(timeDialog().open).toBe(false);
    });
  });

  describe('touch', () => {
    it('emits when the row blurs', async () => {
      const { fixture, host, row } = await setup();

      row().dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(host.touches()).toBe(1);
    });
  });

  describe('messages', () => {
    it('shows no error while untouched', async () => {
      const { fixture, host, error } = await setup();

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      await fixture.whenStable();

      expect(error()).toBeNull();
    });

    it('shows the first error when touched and points the row at it', async () => {
      const { fixture, host, row, error } = await setup();

      host.errors.set([
        { kind: 'x', message: 'Pick a Due date' },
        { kind: 'y', message: 'Second' },
      ]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(squash(error()?.textContent)).toBe('Error: Pick a Due date');
      expect((error() as HTMLElement).id).not.toBe('');
      expect(row().getAttribute('aria-describedby')).toBe((error() as HTMLElement).id);
    });

    it('shows the hint without an error and replaces it with the error', async () => {
      const { fixture, host, root, row, error } = await setup();

      expect(row().hasAttribute('aria-describedby')).toBe(false);

      host.hint.set('When it is due');
      await fixture.whenStable();

      const hint = root().querySelector('.asys-field__hint') as HTMLElement;

      expect(squash(hint.textContent)).toBe('When it is due');
      expect(row().getAttribute('aria-describedby')).toBe(hint.id);

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__hint')).toBeNull();
      expect(error()).not.toBeNull();
    });
  });

  it('focuses the row button', async () => {
    const { fixture, host, row } = await setup();

    document.body.appendChild(fixture.nativeElement);
    host.field().focus();

    expect(document.activeElement).toBe(row());
  });

  describe('with Signal Forms', () => {
    const setupForm = async () => {
      const fixture = TestBed.createComponent(FormHost);
      await fixture.whenStable();

      const root = (): HTMLElement => fixture.nativeElement;
      const f = finders(root);
      const { press } = actions(fixture);

      return { fixture, host: fixture.componentInstance, root, ...f, press };
    };

    it('shows the model value', async () => {
      const { fixture, host, row } = await setupForm();

      host.model.set({ due: { date: '2026-10-14', time: '17:00' } });
      await fixture.whenStable();

      expect(squash(row().querySelector('.asys-field-row__value')?.textContent)).toBe('Tomorrow');
    });

    it('writes a picked date into the form model', async () => {
      const { host, row, press, dateDialog } = await setupForm();

      await press(row());

      const chip = dateDialog().querySelectorAll<HTMLButtonElement>(
        '.asys-date-picker__chips > .asys-segment',
      )[1];

      await press(chip);

      expect(host.model().due).toStrictEqual({ date: '2026-10-14' });
    });

    it('writes a removed Due date into the form model as null', async () => {
      const { fixture, host, row, press, dateDialog } = await setupForm();

      host.model.set({ due: { date: '2026-10-14' } });
      await fixture.whenStable();
      await press(row());
      await press(dateDialog().querySelector('button.asys-date-picker__remove') as HTMLElement);

      expect(host.model().due).toBeNull();
    });

    it('disables both buttons when the form field is disabled', async () => {
      const { fixture, host, row, timeButton } = await setupForm();

      host.model.set({ due: { date: '2026-10-14' } });
      host.disabledForm.set(true);
      await fixture.whenStable();

      expect(row().disabled).toBe(true);
      expect(timeButton()?.disabled).toBe(true);
    });

    it('shows the validation error only after the row blurs', async () => {
      const { fixture, row, error } = await setupForm();

      expect(error()).toBeNull();

      row().dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(squash(error()?.textContent)).toBe('Error: Pick a Due date');
      expect(row().getAttribute('aria-describedby')).toBe((error() as HTMLElement).id);
    });

    it('focuses the row through focusBoundControl', async () => {
      const { fixture, host, row } = await setupForm();

      document.body.appendChild(fixture.nativeElement);
      host.f.due().focusBoundControl();

      expect(document.activeElement).toBe(row());
    });
  });
});
