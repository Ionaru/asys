// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, validate, type ValidationError } from '@angular/forms/signals';

import { EstimatePicker, EstimateLayout } from './estimate-picker';

const RANGE_ERROR = 'Error: Use whole minutes from 1 to 100000.';

@Component({
  imports: [EstimatePicker],
  template: `
    <asys-estimate-picker
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
  readonly field = viewChild.required(EstimatePicker);

  readonly value = signal<number | null>(null);

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

@Component({
  imports: [EstimatePicker],
  template: `
    <asys-estimate-picker legend="Custom legend" />
    <asys-estimate-picker hint="Some hint" />
  `,
})
class Pair {}

@Component({
  imports: [EstimatePicker, FormField],
  template: `<asys-estimate-picker [formField]="f.estimate" />`,
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
    Array.from(
      root().querySelectorAll<HTMLButtonElement>('div.asys-estimate__chips > button.asys-segment'),
    );
  const numberChips = (): HTMLButtonElement[] =>
    chips().filter((b) => b.classList.contains('asys-segment--num'));
  const other = (): HTMLButtonElement => chips()[6];
  const otherInput = (): HTMLTextAreaElement | null =>
    root().querySelector<HTMLTextAreaElement>('textarea.asys-input-box__control');
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
    const input = finders(root).otherInput() as HTMLTextAreaElement;

    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };

  return { fixture, host, root, type, ...finders(root) };
};

describe('EstimatePicker', () => {
  describe('markup', () => {
    it('renders a fieldset with the default legend', async () => {
      const { root } = await setup();

      expect(root().querySelector('fieldset.asys-estimate')).not.toBeNull();
      expect(
        root().querySelector('fieldset > legend.asys-estimate__legend')?.textContent?.trim(),
      ).toBe('Estimate');
      expect(root().querySelector('legend.asys-estimate__legend.asys-label')).not.toBeNull();
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
      expect(chips().every((b) => b.classList.contains('asys-segment'))).toBe(true);
      expect(numberChips()).toHaveLength(6);
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
      expect(other().classList.contains('asys-segment--num')).toBe(false);
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

      const input = otherInput() as HTMLTextAreaElement;

      expect(input).not.toBeNull();
      // A one-row textarea, because Chrome on Android shows its autofill bar on every text input.
      expect(input.rows).toBe(1);
      expect(input.parentElement?.tagName).toBe('ASYS-INPUT-BOX');
      expect(input.parentElement?.classList.contains('asys-input-box')).toBe(true);
      expect(input.getAttribute('inputmode')).toBe('numeric');
      expect(input.closest('div.asys-field.asys-estimate__other > asys-input-box')).not.toBeNull();
      expect(
        input.closest('div.asys-estimate__other')?.querySelector(':scope > label.asys-label')
          ?.textContent,
      ).toContain('Minutes');
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

      const input = otherInput() as HTMLTextAreaElement;

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
      (otherInput() as HTMLTextAreaElement).dispatchEvent(new Event('blur'));
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

      const fields = fixture.nativeElement.querySelectorAll('asys-estimate-picker');
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
        const input = finders(root).otherInput() as HTMLTextAreaElement;

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

@Component({
  imports: [EstimatePicker],
  template: `
    <asys-estimate-picker
      [layout]="layout"
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
class RulerHost {
  readonly layout = EstimateLayout.Ruler;

  readonly field = viewChild.required(EstimatePicker);

  readonly value = signal<number | null>(null);

  readonly hint = signal<string | undefined>(undefined);

  readonly errors = signal<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = signal(false);

  readonly disabled = signal(false);

  readonly touches = signal(0);
}

const setupRuler = async () => {
  const fixture = TestBed.createComponent(RulerHost);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const group = (): HTMLElement =>
    root().querySelector('[role="group"].asys-estimate') as HTMLElement;
  const legend = (): HTMLElement | null => root().querySelector('.asys-estimate__legend');
  const cells = (): HTMLButtonElement[] =>
    Array.from(
      root().querySelectorAll<HTMLButtonElement>('div.asys-estimate__ruler > button.asys-segment'),
    );
  const toggle = (): HTMLButtonElement =>
    root().querySelector('button.asys-estimate__other-toggle') as HTMLButtonElement;
  const otherInput = (): HTMLTextAreaElement | null =>
    root().querySelector<HTMLTextAreaElement>('textarea.asys-input-box__control');
  const error = (): HTMLElement | null => root().querySelector('p.asys-field__error');
  const typeEvent = async (text: string, event: 'input' | 'change') => {
    const input = otherInput() as HTMLTextAreaElement;

    input.value = text;
    input.dispatchEvent(new Event(event, { bubbles: true }));
    await fixture.whenStable();
  };

  return { fixture, host, root, group, legend, cells, toggle, otherInput, error, typeEvent };
};

describe('EstimatePicker Ruler layout', () => {
  it('is a group named by its legend, not a fieldset or a chip row', async () => {
    const { root, group, legend } = await setupRuler();

    expect(group().classList.contains('asys-estimate--ruler')).toBe(true);
    expect(root().querySelector('fieldset')).toBeNull();
    expect(root().querySelector('div.asys-estimate__chips')).toBeNull();
    expect(legend()?.textContent?.trim()).toBe('Estimate');
    expect(legend()?.tagName).toBe('SPAN');
    expect(legend()?.classList.contains('asys-label')).toBe(true);
    expect(legend()?.id).not.toBe('');
    expect(group().getAttribute('aria-labelledby')).toBe(legend()?.id);
  });

  it('renders six cells with the number and the unit, and the whole text as the label', async () => {
    const { cells } = await setupRuler();

    expect(cells().every((b) => b.getAttribute('type') === 'button')).toBe(true);
    expect(cells()).toHaveLength(6);
    expect(
      cells().every(
        (b) =>
          b.classList.contains('asys-segment--stacked') &&
          b.classList.contains('asys-segment--num'),
      ),
    ).toBe(true);
    expect(
      cells().map((b) => [
        b.querySelector('.asys-segment__value')?.textContent?.trim(),
        b.querySelector('.asys-segment__unit')?.textContent?.trim(),
        b.getAttribute('aria-label'),
      ]),
    ).toEqual([
      ['5', 'min', '5 min'],
      ['15', 'min', '15 min'],
      ['25', 'min', '25 min'],
      ['45', 'min', '45 min'],
      ['1', 'h', '1 h'],
      ['2', 'h', '2 h'],
    ]);
  });

  it('sets the minutes of each cell when clicked', async () => {
    const { fixture, host, cells } = await setupRuler();

    for (const [index, minutes] of [5, 15, 25, 45, 60, 120].entries()) {
      cells()[index].click();
      await fixture.whenStable();

      expect(host.value()).toBe(minutes);
    }
  });

  it('presses exactly the cell equal to the value', async () => {
    const { fixture, host, cells } = await setupRuler();

    host.value.set(45);
    await fixture.whenStable();

    expect(cells().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'false',
      'true',
      'false',
      'false',
    ]);
  });

  it('disables the cells when the control is disabled', async () => {
    const { fixture, host, cells } = await setupRuler();

    host.disabled.set(true);
    await fixture.whenStable();

    expect(cells().every((b) => b.disabled)).toBe(true);
  });

  it('emits touch when a cell blurs', async () => {
    const { fixture, host, cells } = await setupRuler();

    document.body.appendChild(fixture.nativeElement);
    cells()[0].focus();
    cells()[0].blur();
    await fixture.whenStable();

    expect(host.touches()).toBe(1);
  });

  it('focuses the first cell from focus()', async () => {
    const { fixture, host, cells } = await setupRuler();

    document.body.appendChild(fixture.nativeElement);
    host.field().focus();

    expect(document.activeElement).toBe(cells()[0]);
  });

  it('wires the error paragraph to every cell', async () => {
    const { fixture, host, root, cells } = await setupRuler();

    host.errors.set([{ kind: 'x', message: 'Pick an estimate' }]);
    host.touched.set(true);
    await fixture.whenStable();

    const message = root().querySelector('p[asys-field-error]') as HTMLElement;

    expect(message).not.toBeNull();
    expect(message.id).not.toBe('');
    expect(cells().length).toBe(6);
    expect(cells().every((b) => b.getAttribute('aria-describedby') === message.id)).toBe(true);
  });

  it('wires the hint to every cell', async () => {
    const { fixture, host, root, cells } = await setupRuler();

    host.hint.set('How long it takes');
    await fixture.whenStable();

    const hint = root().querySelector('.asys-field__hint') as HTMLElement;

    expect(hint).not.toBeNull();
    expect(hint.id).not.toBe('');
    expect(cells().every((b) => b.getAttribute('aria-describedby') === hint.id)).toBe(true);
  });

  describe('Other', () => {
    it('is a quiet toggle labelled Other that opens the minutes input', async () => {
      const { fixture, toggle, otherInput } = await setupRuler();

      expect(toggle().textContent?.trim()).toBe('Other');
      expect(toggle().getAttribute('type')).toBe('button');
      expect(toggle().getAttribute('aria-pressed')).toBe('false');
      expect(otherInput()).toBeNull();

      toggle().click();
      await fixture.whenStable();

      expect(otherInput()).not.toBeNull();
      expect(Array.from(otherInput()?.labels ?? []).map((l) => l.textContent?.trim())).toEqual([
        'Minutes',
      ]);
      expect(toggle().getAttribute('aria-pressed')).toBe('true');
    });

    it('opens with the stored custom value', async () => {
      const { fixture, host, toggle, otherInput, cells } = await setupRuler();

      host.value.set(42);
      await fixture.whenStable();

      expect(toggle().getAttribute('aria-pressed')).toBe('true');
      expect(otherInput()?.value).toBe('42');
      expect(cells().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    });

    it('does not commit typed digits on input', async () => {
      const { fixture, host, toggle, typeEvent } = await setupRuler();

      host.value.set(25);
      await fixture.whenStable();
      toggle().click();
      await fixture.whenStable();
      await typeEvent('4', 'input');
      await typeEvent('42', 'input');

      expect(host.value()).toBe(25);
    });

    it('commits the typed minutes once on change', async () => {
      const { fixture, host, toggle, typeEvent, error } = await setupRuler();
      const seen: (number | null)[] = [];

      toggle().click();
      await fixture.whenStable();
      host.value.set(null);
      await typeEvent('4', 'input');
      await typeEvent('42', 'input');

      expect(host.value()).toBeNull();

      await typeEvent('42', 'change');
      seen.push(host.value());

      expect(seen).toEqual([42]);
      expect(error()).toBeNull();
    });

    it('commits the typed minutes on Enter, as a text input fires change on Enter', async () => {
      const { fixture, host, toggle, typeEvent, otherInput } = await setupRuler();
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });

      toggle().click();
      await fixture.whenStable();
      host.value.set(null);
      await typeEvent('42', 'input');
      otherInput()?.dispatchEvent(enter);
      await fixture.whenStable();

      expect(enter.defaultPrevented).toBe(true);
      expect(host.value()).toBe(42);
      expect(otherInput()?.value).toBe('42');
    });

    it('commits a phone keyboard line break the same way', async () => {
      const { fixture, host, toggle, typeEvent, otherInput } = await setupRuler();
      const lineBreak = new InputEvent('beforeinput', {
        inputType: 'insertLineBreak',
        bubbles: true,
        cancelable: true,
      });

      toggle().click();
      await fixture.whenStable();
      host.value.set(null);
      await typeEvent('42', 'input');
      otherInput()?.dispatchEvent(lineBreak);
      await fixture.whenStable();

      expect(lineBreak.defaultPrevented).toBe(true);
      expect(host.value()).toBe(42);
    });

    it('leaves typing and Escape alone', async () => {
      const { fixture, toggle, otherInput } = await setupRuler();

      toggle().click();
      await fixture.whenStable();

      const keys = ['4', 'Escape'].map(
        (key) => new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );

      for (const key of keys) {
        otherInput()?.dispatchEvent(key);
      }

      expect(keys.map((key) => key.defaultPrevented)).toEqual([false, false]);
    });

    it('turns a pasted line break into a space', async () => {
      const { fixture, toggle, typeEvent, otherInput } = await setupRuler();

      toggle().click();
      await fixture.whenStable();
      await typeEvent('4\n2', 'input');

      expect(otherInput()?.value).toBe('4 2');
    });

    it('shows no error while typing invalid text, and the error on change', async () => {
      const { fixture, host, toggle, typeEvent, error } = await setupRuler();

      toggle().click();
      await fixture.whenStable();
      await typeEvent('abc', 'input');

      expect(error()).toBeNull();

      await typeEvent('abc', 'change');

      expect(host.value()).toBeNull();
      expect(error()?.textContent?.replace(/\s+/g, ' ').trim()).toBe(RANGE_ERROR);
    });

    it('sets null without an error when emptied on change', async () => {
      const { fixture, host, toggle, typeEvent, error } = await setupRuler();

      toggle().click();
      await fixture.whenStable();
      await typeEvent('40', 'change');

      expect(host.value()).toBe(40);

      await typeEvent('', 'change');

      expect(host.value()).toBeNull();
      expect(error()).toBeNull();
    });

    it('closes the input when a cell is clicked', async () => {
      const { fixture, host, cells, otherInput } = await setupRuler();

      host.value.set(20);
      await fixture.whenStable();
      cells()[1].click();
      await fixture.whenStable();

      expect(host.value()).toBe(15);
      expect(otherInput()).toBeNull();
    });
  });
});
