// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, validate, type ValidationError } from '@angular/forms/signals';

import { EstimateField } from './estimate-field';

const RANGE_ERROR = 'Error: Use whole minutes from 1 to 100000.';

@Component({
  imports: [EstimateField],
  template: `
    <asys-estimate-field
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
  readonly field = viewChild.required(EstimateField);

  readonly value = signal<number | null>(null);

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

@Component({
  imports: [EstimateField],
  template: `
    <asys-estimate-field legend="Custom legend" />
    <asys-estimate-field hint="Some hint" />
  `,
})
class Pair {}

@Component({
  imports: [EstimateField, FormField],
  template: `<asys-estimate-field [formField]="f.estimate" />`,
})
class FormHost {
  readonly model = signal<{ estimate: number | null }>({ estimate: null });

  readonly f = form(this.model, (p) => {
    validate(p.estimate, ({ value }) =>
      value() === null ? { kind: 'estimate', message: 'Pick an estimate' } : undefined,
    );
  });
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const finders = (root: () => HTMLElement) => {
  const chips = (): HTMLButtonElement[] =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('button.asys-estimate__chip'));
  const numberChips = (): HTMLButtonElement[] =>
    chips().filter((b) => b.classList.contains('asys-estimate__chip--num'));
  const other = (): HTMLButtonElement => chips()[6];
  const otherInput = (): HTMLInputElement | null =>
    root().querySelector<HTMLInputElement>('input.asys-field__input');
  const error = (): HTMLElement | null => root().querySelector('p.asys-field__error');
  const pressedMinutes = (): string[] =>
    numberChips()
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => squash(b.textContent));

  return { chips, numberChips, other, otherInput, error, pressedMinutes };
};

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const type = async (text: string) => {
    const input = finders(root).otherInput() as HTMLInputElement;

    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };

  return { fixture, host, root, type, ...finders(root) };
};

describe('EstimateField', () => {
  describe('markup', () => {
    it('renders a fieldset with the default legend', async () => {
      const { root } = await setup();

      expect(root().querySelector('fieldset.asys-estimate')).not.toBeNull();
      expect(
        root().querySelector('fieldset > legend.asys-estimate__legend')?.textContent?.trim(),
      ).toBe('Estimate');
    });

    it('uses a custom legend', async () => {
      const fixture = TestBed.createComponent(Pair);
      await fixture.whenStable();

      expect(
        fixture.nativeElement.querySelector('legend.asys-estimate__legend')?.textContent?.trim(),
      ).toBe('Custom legend');
    });

    it('renders seven chips: six number chips and then Other', async () => {
      const { root, chips, numberChips, other } = await setup();

      expect(root().querySelectorAll('div.asys-estimate__chips > button').length).toBe(7);
      expect(chips().every((b) => b.getAttribute('type') === 'button')).toBe(true);
      expect(numberChips().map((b) => squash(b.textContent))).toEqual([
        '5 min',
        '15 min',
        '25 min',
        '45 min',
        '1 h',
        '2 h',
      ]);
      expect(squash(other().textContent)).toBe('Other');
      expect(other().classList.contains('asys-estimate__chip--num')).toBe(false);
    });

    it('shows no Other input initially', async () => {
      const { otherInput, other, pressedMinutes } = await setup();

      expect(otherInput()).toBeNull();
      expect(other().getAttribute('aria-pressed')).toBe('false');
      expect(pressedMinutes()).toEqual([]);
    });
  });

  describe('number chips', () => {
    it('sets the minutes of each chip when clicked', async () => {
      const { fixture, host, numberChips } = await setup();
      const expected = [5, 15, 25, 45, 60, 120];

      for (const [index, minutes] of expected.entries()) {
        numberChips()[index].click();
        await fixture.whenStable();

        expect(host.value()).toBe(minutes);
      }
    });

    it('presses exactly the chip equal to the value', async () => {
      const { fixture, host, numberChips } = await setup();

      host.value.set(60);
      await fixture.whenStable();

      expect(numberChips().map((b) => b.getAttribute('aria-pressed'))).toEqual([
        'false',
        'false',
        'false',
        'false',
        'true',
        'false',
      ]);
    });

    it('presses no chip when the value is null', async () => {
      const { fixture, host, pressedMinutes } = await setup();

      host.value.set(25);
      await fixture.whenStable();
      host.value.set(null);
      await fixture.whenStable();

      expect(pressedMinutes()).toEqual([]);
    });
  });

  describe('Other', () => {
    it('opens a labelled numeric input, presses Other and focuses the input, leaving the value', async () => {
      const { fixture, host, other, otherInput } = await setup();

      document.body.appendChild(fixture.nativeElement);
      host.value.set(25);
      await fixture.whenStable();
      other().click();
      await fixture.whenStable();

      const input = otherInput() as HTMLInputElement;

      expect(input).not.toBeNull();
      expect(input.getAttribute('type')).toBe('text');
      expect(input.getAttribute('inputmode')).toBe('numeric');
      expect(Array.from(input.labels ?? []).map((l) => l.textContent?.trim())).toEqual(['Minutes']);
      expect(other().getAttribute('aria-pressed')).toBe('true');
      expect(document.activeElement).toBe(input);
      expect(host.value()).toBe(25);
      expect(input.value).toBe('');
    });

    it.each([20, 30])('shows the Other input with %i when the value is not a chip', async (n) => {
      const { fixture, host, other, otherInput, pressedMinutes } = await setup();

      host.value.set(n);
      await fixture.whenStable();

      expect(other().getAttribute('aria-pressed')).toBe('true');
      expect(otherInput()?.value).toBe(String(n));
      expect(pressedMinutes()).toEqual([]);
    });

    it('does not show the Other input for a chip value', async () => {
      const { fixture, host, otherInput, other } = await setup();

      host.value.set(45);
      await fixture.whenStable();

      expect(otherInput()).toBeNull();
      expect(other().getAttribute('aria-pressed')).toBe('false');
    });

    it('keeps the focused Other input mounted while it is cleared and retyped', async () => {
      const { fixture, host, otherInput, type } = await setup();

      document.body.appendChild(fixture.nativeElement);
      host.value.set(30);
      await fixture.whenStable();

      const input = otherInput() as HTMLInputElement;

      expect(input.value).toBe('30');

      input.focus();
      await type('');

      expect(host.value()).toBeNull();
      expect(otherInput()).toBe(input);
      expect(document.activeElement).toBe(input);

      await type('20');

      expect(host.value()).toBe(20);
      expect(otherInput()).toBe(input);
      expect(document.activeElement).toBe(input);
    });

    it('keeps the Other input mounted when the typed value equals a chip', async () => {
      const { fixture, host, other, otherInput, type } = await setup();

      other().click();
      await fixture.whenStable();
      await type('45');

      expect(host.value()).toBe(45);
      expect(otherInput()).not.toBeNull();
    });

    it('keeps the Other input mounted while the typed value is invalid', async () => {
      const { fixture, other, otherInput, type } = await setup();

      other().click();
      await fixture.whenStable();
      await type('abc');

      expect(otherInput()).not.toBeNull();
    });

    it('closes the Other input when a number chip is clicked', async () => {
      const { fixture, host, numberChips, other, otherInput } = await setup();

      host.value.set(20);
      await fixture.whenStable();
      numberChips()[1].click();
      await fixture.whenStable();

      expect(host.value()).toBe(15);
      expect(otherInput()).toBeNull();
      expect(other().getAttribute('aria-pressed')).toBe('false');
    });

    it('shows a typed number and sets the value', async () => {
      const { fixture, host, other, otherInput, type, error } = await setup();

      other().click();
      await fixture.whenStable();
      await type('40');

      expect(host.value()).toBe(40);
      expect(otherInput()?.value).toBe('40');
      expect(error()).toBeNull();
    });

    it.each([
      ['1', 1],
      ['100000', 100000],
      ['  30 ', 30],
    ])('accepts %j as %i', async (text, expected) => {
      const { fixture, host, other, type, error } = await setup();

      other().click();
      await fixture.whenStable();
      await type(text);

      expect(host.value()).toBe(expected);
      expect(error()).toBeNull();
    });

    it('sets null without an error when the text is emptied', async () => {
      const { fixture, host, other, type, error } = await setup();

      other().click();
      await fixture.whenStable();
      await type('40');
      await type('');

      expect(host.value()).toBeNull();
      expect(error()).toBeNull();

      await type('   ');

      expect(host.value()).toBeNull();
      expect(error()).toBeNull();
    });

    it.each(['0', '100001', '1.5', 'abc', '-3', '12a'])(
      'sets null and shows the local error for %j',
      async (text) => {
        const { fixture, host, other, otherInput, type, error } = await setup();

        other().click();
        await fixture.whenStable();
        await type('40');
        await type(text);

        expect(host.value()).toBeNull();
        expect(squash(error()?.textContent)).toBe(RANGE_ERROR);
        expect(error()?.querySelector('span.asys-field__error-word')?.textContent).toBe('Error:');
        expect(otherInput()?.value).toBe(text);
      },
    );

    it('clears the local error when valid text is typed', async () => {
      const { fixture, host, other, type, error } = await setup();

      other().click();
      await fixture.whenStable();
      await type('abc');
      await type('50');

      expect(host.value()).toBe(50);
      expect(error()).toBeNull();
    });

    it('clears the local error when a number chip is clicked', async () => {
      const { fixture, host, other, numberChips, type, error } = await setup();

      other().click();
      await fixture.whenStable();
      await type('abc');
      numberChips()[0].click();
      await fixture.whenStable();

      expect(host.value()).toBe(5);
      expect(error()).toBeNull();
    });

    it('shows the local error at once and before form errors', async () => {
      const { fixture, host, other, type, error } = await setup();

      host.errors.set([{ kind: 'x', message: 'Pick an estimate' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(squash(error()?.textContent)).toBe('Error: Pick an estimate');

      other().click();
      await fixture.whenStable();
      await type('abc');

      expect(squash(error()?.textContent)).toBe(RANGE_ERROR);
      expect(fixture.nativeElement.querySelectorAll('p.asys-field__error').length).toBe(1);
    });

    it('shows the local error without the field being touched', async () => {
      const { fixture, host, other, type, error } = await setup();

      expect(host.touched()).toBe(false);

      other().click();
      await fixture.whenStable();
      await type('0');

      expect(squash(error()?.textContent)).toBe(RANGE_ERROR);
    });
  });

  describe('disabled', () => {
    it('disables all chips and the Other input', async () => {
      const { fixture, host, chips, other, otherInput } = await setup();

      host.value.set(20);
      await fixture.whenStable();

      expect(chips().some((b) => b.disabled)).toBe(false);
      expect(otherInput()?.disabled).toBe(false);

      host.disabled.set(true);
      await fixture.whenStable();

      expect(chips().every((b) => b.disabled)).toBe(true);
      expect(other().disabled).toBe(true);
      expect(otherInput()?.disabled).toBe(true);
    });
  });

  describe('touch', () => {
    it('emits when a chip blurs', async () => {
      const { fixture, host, chips } = await setup();

      chips()[0].dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(host.touches()).toBe(1);
    });

    it('emits when the Other input blurs', async () => {
      const { fixture, host, otherInput } = await setup();

      host.value.set(20);
      await fixture.whenStable();
      (otherInput() as HTMLInputElement).dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(host.touches()).toBe(1);
    });
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
        { kind: 'x', message: 'Pick an estimate' },
        { kind: 'y', message: 'Second' },
      ]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(error()?.querySelector('span.asys-field__error-word')?.textContent).toBe('Error:');
      expect(squash(error()?.textContent)).toBe('Error: Pick an estimate');
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

      host.hint.set('How long it takes');
      await fixture.whenStable();

      expect(root().querySelector('p.asys-field__hint')?.textContent?.trim()).toBe(
        'How long it takes',
      );

      host.errors.set([{ kind: 'x', message: 'Bad' }]);
      host.touched.set(true);
      await fixture.whenStable();

      expect(root().querySelector('.asys-field__hint')).toBeNull();
      expect(error()).not.toBeNull();
    });

    it('references the message paragraph from a native control', async () => {
      const { fixture, host, root, chips } = await setup();

      expect(chips().some((b) => b.hasAttribute('aria-describedby'))).toBe(false);

      host.hint.set('How long it takes');
      await fixture.whenStable();

      const hint = root().querySelector('p.asys-field__hint') as HTMLElement;

      expect(hint.id).not.toBe('');
      expect(root().querySelector(`[aria-describedby="${hint.id}"]`)).not.toBeNull();
    });

    it('uses paragraph ids that are unique across instances', async () => {
      const fixture = TestBed.createComponent(Pair);
      await fixture.whenStable();

      const fields = fixture.nativeElement.querySelectorAll('asys-estimate-field');
      const hint = fixture.nativeElement.querySelector('p.asys-field__hint') as HTMLElement;

      expect(hint.id).not.toBe('');
      expect(fields[0].querySelector(`[aria-describedby="${hint.id}"]`)).toBeNull();
      expect(fields[1].querySelector(`[aria-describedby="${hint.id}"]`)).not.toBeNull();
    });
  });

  it('focuses the first chip', async () => {
    const { fixture, host, chips } = await setup();

    document.body.appendChild(fixture.nativeElement);
    host.field().focus();

    expect(document.activeElement).toBe(chips()[0]);
  });

  describe('with Signal Forms', () => {
    const setupForm = async () => {
      const fixture = TestBed.createComponent(FormHost);
      await fixture.whenStable();

      const root = (): HTMLElement => fixture.nativeElement;
      const type = async (text: string) => {
        const input = finders(root).otherInput() as HTMLInputElement;

        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await fixture.whenStable();
      };

      return { fixture, host: fixture.componentInstance, root, type, ...finders(root) };
    };

    it('writes a chip click into the form model', async () => {
      const { fixture, host, numberChips } = await setupForm();

      numberChips()[2].click();
      await fixture.whenStable();

      expect(host.model().estimate).toBe(25);
    });

    it('writes typed Other minutes into the form model', async () => {
      const { fixture, host, other, type } = await setupForm();

      other().click();
      await fixture.whenStable();
      await type('90');

      expect(host.model().estimate).toBe(90);
    });

    it('shows a value set on the model', async () => {
      const { fixture, host, otherInput, pressedMinutes } = await setupForm();

      host.model.set({ estimate: 15 });
      await fixture.whenStable();

      expect(pressedMinutes()).toEqual(['15 min']);

      host.model.set({ estimate: 30 });
      await fixture.whenStable();

      expect(otherInput()?.value).toBe('30');
    });

    it('shows the null validation error only after touch', async () => {
      const { fixture, chips, error } = await setupForm();

      expect(error()).toBeNull();

      chips()[0].dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(squash(error()?.textContent)).toBe('Error: Pick an estimate');
    });

    it('focuses the control through focusBoundControl', async () => {
      const { fixture, host, chips } = await setupForm();

      document.body.appendChild(fixture.nativeElement);
      host.f.estimate().focusBoundControl();

      expect(document.activeElement).toBe(chips()[0]);
    });
  });
});
