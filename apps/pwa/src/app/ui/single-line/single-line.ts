// SPDX-License-Identifier: EUPL-1.2
import { Directive, ElementRef, inject, input, output } from '@angular/core';

import { InputBox } from '../input-box/input-box';

/** The input types that HTML's implicit submission counts: with one of these, a form without a submit button stays. */
const BLOCKS_IMPLICIT_SUBMISSION = new Set([
  'text',
  'search',
  'url',
  'tel',
  'email',
  'password',
  'date',
  'month',
  'week',
  'time',
  'datetime-local',
  'number',
]);

/**
 * Whether a keydown or beforeinput would break the line: Enter outside an IME composition, or the line break a phone
 * keyboard sends, often with no Enter keydown before it.
 */
export const breaksLine = (event: Event): boolean =>
  event instanceof KeyboardEvent
    ? event.key === 'Enter' && !event.isComposing
    : event instanceof InputEvent &&
      (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph');

/** Turns each line break in the field into a space, keeping the selection where it was, and returns the new value. */
export const flattenLines = (field: HTMLTextAreaElement): string => {
  // A textarea's value holds its line breaks as LF only, so each becomes one space and the selection keeps its offsets.
  const value = field.value.replaceAll('\n', ' ');

  if (value !== field.value) {
    const { selectionStart, selectionEnd } = field;

    field.value = value;
    field.setSelectionRange(selectionStart, selectionEnd);
  }

  return value;
};

/**
 * Does what Enter does in a text input: clicks the form's first submit button, which does nothing while that button is
 * disabled. A form without one is submitted only when it has no other field that implicit submission counts.
 */
export const submitImplicitly = (field: HTMLTextAreaElement): void => {
  const form = field.form;

  if (form === null) {
    return;
  }

  const controls = Array.from(form.elements);
  const button = controls.find(
    (control): control is HTMLButtonElement | HTMLInputElement =>
      (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) &&
      control.type === 'submit',
  );

  if (button !== undefined) {
    button.click();
  } else if (
    !controls.some(
      (control) =>
        control instanceof HTMLInputElement && BLOCKS_IMPLICIT_SUBMISSION.has(control.type),
    )
  ) {
    form.requestSubmit();
  }
};

/**
 * A one-line field is a one-row textarea, not a text input: Chrome on Android shows its passwords, cards and addresses
 * bar above the keyboard on every text input, whatever its autocomplete, and never on a textarea. This directive gives
 * such a textarea a text input's behaviour: a line break is never inserted, and Enter submits the form implicitly.
 * Inside an `asys-input-box` the textarea is the box's borderless control, because a textarea scrolls its text into its
 * own padding, so the box draws the border and padding.
 */
@Directive({
  selector: 'textarea[asys-single-line]',
  host: {
    rows: '1',
    '[class.asys-input-box__control]': 'box !== null',
    '[attr.wrap]': 'box === null ? null : "off"',
    '(input)': 'flatten()',
    '(keydown)': 'breakLine($event)',
    '(beforeinput)': 'breakLine($event)',
  },
})
export class SingleLine {
  readonly #field = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);

  protected readonly box = inject(InputBox, { optional: true });

  /** Whether Enter submits the form implicitly. A field that handles Enter itself turns it off. */
  readonly submitOnEnter = input<boolean>(true);

  /** Emits the text on every input, once its line breaks have become spaces. */
  readonly lineChange = output<string>();

  /** Emits when Enter, or the line break of a phone keyboard, was prevented, before any submission. */
  readonly lineBreak = output<void>();

  protected flatten(): void {
    this.lineChange.emit(flattenLines(this.#field.nativeElement));
  }

  /** It returns nothing, because Angular prevents the default of an event whose handler returns false. */
  protected breakLine(event: Event): void {
    if (!breaksLine(event)) {
      return;
    }

    event.preventDefault();
    this.lineBreak.emit();

    if (this.submitOnEnter()) {
      submitImplicitly(this.#field.nativeElement);
    }
  }
}
