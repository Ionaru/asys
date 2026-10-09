// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, model, viewChild, ViewEncapsulation } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

import { FieldControl } from '../field-control/field-control';
import { FieldError } from '../field-error/field-error';

let nextId = 0;

/** A single or multi line text field, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-text-field',
  imports: [FieldError],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="asys-field"
      [class.asys-field--error]="showError()"
      [class.asys-field--disabled]="disabled()"
    >
      <label class="asys-field__label" [for]="controlId">{{ label() }}</label>
      @if (multiline()) {
        <textarea
          #control
          class="asys-field__input"
          [id]="controlId"
          [value]="value()"
          [disabled]="disabled()"
          [attr.placeholder]="placeholder()"
          [attr.autocomplete]="autocomplete()"
          [attr.autocapitalize]="autocapitalize()"
          [attr.spellcheck]="spellcheck() ? null : 'false'"
          [attr.aria-invalid]="showError() ? 'true' : null"
          [attr.aria-describedby]="messageId()"
          (input)="value.set(control.value)"
          (blur)="touch.emit()"
        ></textarea>
      } @else {
        <input
          #control
          class="asys-field__input"
          type="text"
          [id]="controlId"
          [value]="value()"
          [disabled]="disabled()"
          [attr.placeholder]="placeholder()"
          [attr.autocomplete]="autocomplete()"
          [attr.autocapitalize]="autocapitalize()"
          [attr.spellcheck]="spellcheck() ? null : 'false'"
          [attr.aria-invalid]="showError() ? 'true' : null"
          [attr.aria-describedby]="messageId()"
          (input)="value.set(control.value)"
          (blur)="touch.emit()"
        />
      }
      @if (showError()) {
        <p asys-field-error [id]="messageParagraphId">{{ message() }}</p>
      } @else if (hint()) {
        <p class="asys-field__hint" [id]="messageParagraphId">{{ hint() }}</p>
      }
    </div>
  `,
})
export class TextField extends FieldControl implements FormValueControl<string> {
  readonly value = model<string>('');

  readonly label = input.required<string>();

  readonly placeholder = input<string | undefined>();

  readonly multiline = input<boolean>(false);

  readonly autocomplete = input<string | undefined>();

  readonly spellcheck = input<boolean>(true);

  readonly autocapitalize = input<string | undefined>();

  protected readonly controlId = `asys-text-field-${nextId}`;

  protected override readonly messageParagraphId = `asys-text-field-${nextId++}-message`;

  private readonly control =
    viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('control');

  /** Focuses the native control, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}
