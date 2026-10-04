// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  output,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { FormValueControl, ValidationError } from '@angular/forms/signals';

let nextId = 0;

/** One choice of a select field. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** A select, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-select-field',
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
        <p class="asys-field__error" [id]="messageParagraphId">
          <span class="asys-field__error-word">Error:</span> {{ message() }}
        </p>
      } @else if (hint()) {
        <p class="asys-field__hint" [id]="messageParagraphId">{{ hint() }}</p>
      }
    </div>
  `,
})
export class SelectField implements FormValueControl<string> {
  readonly value = model<string>('');

  readonly label = input.required<string>();

  readonly options = input.required<readonly SelectOption[]>();

  readonly hint = input<string | undefined>();

  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = input<boolean>(false);

  readonly disabled = input<boolean>(false);

  readonly touch = output<void>();

  protected readonly controlId = `asys-select-field-${nextId}`;

  protected readonly messageParagraphId = `asys-select-field-${nextId++}-message`;

  private readonly control = viewChild<ElementRef<HTMLSelectElement>>('control');

  protected readonly showError = computed(() => this.touched() && this.errors().length > 0);

  protected readonly message = computed(() => this.errors()[0]?.message ?? 'Check this value');

  protected readonly messageId = computed(() =>
    this.showError() || this.hint() ? this.messageParagraphId : null,
  );

  /** Focuses the native select, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}
