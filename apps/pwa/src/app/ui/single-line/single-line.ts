// SPDX-License-Identifier: EUPL-1.2

// A one-line field is a one-row textarea, not a text input: Chrome on Android shows its passwords, cards and addresses
// bar above the keyboard on every text input, whatever its autocomplete, and never on a textarea. These helpers give
// such a textarea a text input's behaviour. Its markup is a `.asys-field__box` around a `textarea.asys-field__line`
// with `rows="1"`: a textarea scrolls its text into its own padding, so the box draws the border and padding.

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
 * Handles a keydown or beforeinput as a text input would: a line break is never inserted, and Enter submits the form
 * implicitly. It returns nothing, because Angular prevents the default of an event whose template handler returns false.
 */
export const enterAsInput = (event: Event): void => {
  if (breaksLine(event)) {
    event.preventDefault();
    submitImplicitly(event.target as HTMLTextAreaElement);
  }
};

/** A press on the box around the line, outside the line itself, focuses the line and keeps the keyboard up. */
export const pressBox = (event: MouseEvent): void => {
  const box = event.currentTarget;

  if (event.target === box && box instanceof HTMLElement) {
    event.preventDefault();
    box.querySelector('textarea')?.focus();
  }
};
