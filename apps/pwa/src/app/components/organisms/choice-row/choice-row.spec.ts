// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { disabled, form, FormField, validate, type ValidationError } from '@angular/forms/signals';

import { IconName } from '../../atoms/icon/icon';
import type { SelectOption } from '../../molecules/select-field/select-field';
import { ChoiceRow } from './choice-row';

const OPTIONS: readonly SelectOption[] = [
  { value: '', label: 'No Area' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
];

@Component({
  imports: [ChoiceRow],
  template: `
    <asys-choice-row
      label="Area"
      [options]="options"
      [icon]="icon()"
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
  readonly field = viewChild.required(ChoiceRow);

  readonly options = OPTIONS;

  readonly icon = signal<IconName | null>(null);

  readonly value = signal('');

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

@Component({
  imports: [ChoiceRow, FormField],
  template: `<asys-choice-row [formField]="f.areaId" label="Area" [options]="options" />`,
})
class FormHost {
  readonly options = OPTIONS;

  readonly model = signal<{ areaId: string }>({ areaId: '' });

  readonly disabledForm = signal(false);

  readonly f = form(this.model, (p) => {
    validate(p.areaId, ({ value }) =>
      value() === '' ? { kind: 'area', message: 'Pick an Area' } : undefined,
    );
    disabled(p.areaId, { when: () => this.disabledForm() });
  });
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const setup = async (value = '', icon: IconName | null = null) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.value.set(value);
  fixture.componentInstance.icon.set(icon);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const row = (): HTMLButtonElement =>
    root().querySelector('button.asys-choice-row__open') as HTMLButtonElement;
  const rowValue = (): HTMLElement => row().querySelector('.asys-field-row__value') as HTMLElement;
  const dialog = (): HTMLDialogElement =>
    root().querySelector('dialog.asys-sheet') as HTMLDialogElement;
  const optionButtons = (): HTMLButtonElement[] =>
    Array.from(
      dialog().querySelectorAll<HTMLButtonElement>('ul.asys-option-list button.asys-field-row'),
    );
  const error = (): HTMLElement | null => root().querySelector('p[asys-field-error]');
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };

  return { fixture, host, root, row, rowValue, dialog, optionButtons, error, press };
};

describe('ChoiceRow', () => {
  describe('the row', () => {
    it('shows the label and the label of the chosen option', async () => {
      const { row, rowValue } = await setup('work');

      expect(row().getAttribute('type')).toBe('button');
      expect(row().getAttribute('aria-haspopup')).toBe('dialog');
      expect(squash(row().querySelector('.asys-field-row__label')?.textContent)).toBe('Area');
      expect(squash(rowValue().textContent)).toBe('Work');
      expect(row().querySelector('asys-icon.asys-field-row__chevron')).not.toBeNull();
    });

    it('marks the value as set when it is not empty', async () => {
      const { rowValue } = await setup('home');

      expect(rowValue().classList.contains('asys-field-row__value--set')).toBe(true);
    });

    it('shows the label of the empty option, unmarked, for the empty value', async () => {
      const { rowValue } = await setup('');

      expect(squash(rowValue().textContent)).toBe('No Area');
      expect(rowValue().classList.contains('asys-field-row__value--set')).toBe(false);
    });

    it('shows nothing when no option matches', async () => {
      const { rowValue } = await setup('missing');

      expect(squash(rowValue().textContent)).toBe('');
      expect(rowValue().classList.contains('asys-field-row__value--set')).toBe(true);
    });

    it('follows the value', async () => {
      const { fixture, host, rowValue } = await setup('home');

      host.value.set('work');
      await fixture.whenStable();

      expect(squash(rowValue().textContent)).toBe('Work');

      host.value.set('');
      await fixture.whenStable();

      expect(squash(rowValue().textContent)).toBe('No Area');
      expect(rowValue().classList.contains('asys-field-row__value--set')).toBe(false);
    });

    it('shows no icon in the value without an icon input', async () => {
      const { rowValue } = await setup('home');

      expect(rowValue().querySelector('asys-icon')).toBeNull();
    });

    it('shows the icon before the label of the option when an icon is given', async () => {
      const { rowValue } = await setup('home', IconName.Folder);
      const icon = rowValue().querySelector('asys-icon');

      expect(icon).not.toBeNull();
      expect(squash(rowValue().textContent)).toBe('Home');
      expect(rowValue().firstElementChild).toBe(icon);
    });
  });

  describe('the sheet', () => {
    it('is closed at first, headed with the label and without options', async () => {
      const { dialog, optionButtons } = await setup('home');

      expect(dialog().open).toBe(false);
      expect(squash(dialog().querySelector('h2.asys-sheet__heading')?.textContent)).toBe('Area');
      expect(optionButtons()).toEqual([]);
    });

    it('opens when the row is pressed and lists the options in order', async () => {
      const { row, press, dialog, optionButtons } = await setup('home');

      await press(row());

      expect(dialog().open).toBe(true);
      expect(dialog().querySelectorAll('ul.asys-option-list > li')).toHaveLength(3);
      expect(
        optionButtons().map((b) => [
          b.getAttribute('type'),
          squash(b.querySelector('.asys-field-row__label')?.textContent),
        ]),
      ).toEqual([
        ['button', 'No Area'],
        ['button', 'Home'],
        ['button', 'Work'],
      ]);
    });

    it('sets the value of the picked option, closes the sheet and emits touch', async () => {
      const { host, row, press, dialog, optionButtons } = await setup('home');

      await press(row());
      await press(optionButtons()[2]);

      expect(host.value()).toBe('work');
      expect(dialog().open).toBe(false);
      expect(optionButtons()).toEqual([]);
      expect(host.touches()).toBe(1);
    });

    it('can pick the empty option', async () => {
      const { host, row, press, optionButtons } = await setup('home');

      await press(row());
      await press(optionButtons()[0]);

      expect(host.value()).toBe('');
    });

    it('leaves the value alone when the sheet is opened and dismissed', async () => {
      const { fixture, host, row, press, dialog } = await setup('home');

      await press(row());
      dialog().open = false;
      dialog().dispatchEvent(new Event('close'));
      await fixture.whenStable();

      expect(dialog().open).toBe(false);
      expect(host.value()).toBe('home');
    });
  });

  describe('disabled', () => {
    it('disables the row and opens no sheet', async () => {
      const { fixture, host, row, dialog } = await setup('home');

      expect(row().disabled).toBe(false);

      host.disabled.set(true);
      await fixture.whenStable();
      row().click();
      await fixture.whenStable();

      expect(row().disabled).toBe(true);
      expect(dialog().open).toBe(false);
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
        { kind: 'x', message: 'Pick an Area' },
        { kind: 'y', message: 'Second' },
      ]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(squash(error()?.textContent)).toBe('Error: Pick an Area');
      expect(row().getAttribute('aria-describedby')).toBe((error() as HTMLElement).id);
    });

    it('shows the hint without an error and replaces it with the error', async () => {
      const { fixture, host, root, row, error } = await setup();

      expect(row().hasAttribute('aria-describedby')).toBe(false);

      host.hint.set('Where it belongs');
      await fixture.whenStable();

      const hint = root().querySelector('.asys-field__hint') as HTMLElement;

      expect(squash(hint.textContent)).toBe('Where it belongs');
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
      const row = (): HTMLButtonElement =>
        root().querySelector('button.asys-choice-row__open') as HTMLButtonElement;
      const error = (): HTMLElement | null => root().querySelector('p[asys-field-error]');
      const press = async (el: HTMLElement): Promise<void> => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        await fixture.whenStable();
      };

      return { fixture, host: fixture.componentInstance, root, row, error, press };
    };

    it('shows the model value', async () => {
      const { fixture, host, row } = await setupForm();

      host.model.set({ areaId: 'work' });
      await fixture.whenStable();

      expect(squash(row().querySelector('.asys-field-row__value')?.textContent)).toBe('Work');
    });

    it('writes a picked option into the form model', async () => {
      const { root, host, row, press } = await setupForm();

      await press(row());
      await press(
        root().querySelectorAll<HTMLElement>('ul.asys-option-list button.asys-field-row')[1],
      );

      expect(host.model().areaId).toBe('home');
    });

    it('disables the row when the form field is disabled', async () => {
      const { fixture, host, row } = await setupForm();

      host.disabledForm.set(true);
      await fixture.whenStable();

      expect(row().disabled).toBe(true);
    });

    it('shows the validation error after the row blurs', async () => {
      const { fixture, row, error } = await setupForm();

      expect(error()).toBeNull();

      row().dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(squash(error()?.textContent)).toBe('Error: Pick an Area');
    });

    it('focuses the row through focusBoundControl', async () => {
      const { fixture, host, row } = await setupForm();

      document.body.appendChild(fixture.nativeElement);
      host.f.areaId().focusBoundControl();

      expect(document.activeElement).toBe(row());
    });
  });
});
