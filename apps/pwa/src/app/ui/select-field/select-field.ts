// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, model, viewChild, ViewEncapsulation } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

import { FieldControl } from '../field-control/field-control';
import { FieldError } from '../field-error/field-error';

let nextId = 0;

/** One choice of a select field. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** A select, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-select-field',
  imports: [FieldError],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="asys-field"
      [class.asys-field--error]="showError()"
      [class.asys-field--disabled]="disabled()"
    >
      <label class="asys-field__label" [for]="controlId">{{ label() }}</label>
      <select
        #control
        class="asys-field__input"
        [id]="controlId"
        [disabled]="disabled()"
        [attr.aria-invalid]="showError() ? 'true' : null"
        [attr.aria-describedby]="messageId()"
        (change)="value.set(control.value)"
        (blur)="touch.emit()"
      >
        @for (option of options(); track option.value) {
          <option [value]="option.value" [selected]="option.value === value()">
            {{ option.label }}
          </option>
        }
      </select>
      @if (showError()) {
        <p asys-field-error [id]="messageParagraphId">{{ message() }}</p>
      } @else if (hint()) {
        <p class="asys-field__hint" [id]="messageParagraphId">{{ hint() }}</p>
      }
    </div>
  `,
})
export class SelectField extends FieldControl implements FormValueControl<string> {
  readonly value = model<string>('');

  readonly label = input.required<string>();

  readonly options = input.required<readonly SelectOption[]>();

  protected readonly controlId = `asys-select-field-${nextId}`;

  protected override readonly messageParagraphId = `asys-select-field-${nextId++}-message`;

  private readonly control = viewChild<ElementRef<HTMLSelectElement>>('control');

  /** Focuses the native select, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}
