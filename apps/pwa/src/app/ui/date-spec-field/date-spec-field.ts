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
import type { DateSpec } from '@asys/domain';

import { Button, ButtonSize, ButtonVariant } from '../button/button';

let nextId = 0;

/** A date with an optional time and a Clear button, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-date-spec-field',
  imports: [Button],
  encapsulation: ViewEncapsulation.None,
  template: `
    <fieldset
      class="asys-date-spec"
      [class.asys-field--error]="showError()"
      [class.asys-field--disabled]="disabled()"
    >
      <legend class="asys-field__label">{{ legend() }}</legend>
      <div class="asys-date-spec__row">
        <div class="asys-date-spec__part">
          <label class="asys-field__label" [for]="dateId">Date</label>
          <input
            #dateInput
            class="asys-field__input"
            type="date"
            [id]="dateId"
            [value]="value()?.date ?? ''"
            [disabled]="disabled()"
            [attr.aria-invalid]="showError() ? 'true' : null"
            [attr.aria-describedby]="messageId()"
            (input)="setDate(dateInput.value)"
            (blur)="touch.emit()"
          />
        </div>
        <div class="asys-date-spec__part">
          <label class="asys-field__label" [for]="timeId">Time</label>
          <input
            #timeInput
            class="asys-field__input"
            type="time"
            [id]="timeId"
            [value]="value()?.time ?? ''"
            [disabled]="disabled() || value() === null"
            [attr.aria-invalid]="showError() ? 'true' : null"
            [attr.aria-describedby]="messageId()"
            (input)="setTime(timeInput.value)"
            (blur)="touch.emit()"
          />
        </div>
        @if (value() !== null) {
          <button
            asys-button
            type="button"
            [variant]="Variant.Quiet"
            [size]="Size.Small"
            [disabled]="disabled()"
            (click)="clear()"
          >
            Clear
          </button>
        }
      </div>
      @if (showError()) {
        <p class="asys-field__error" [id]="messageParagraphId">
          <span class="asys-field__error-word">Error:</span> {{ message() }}
        </p>
      } @else if (hint()) {
        <p class="asys-field__hint" [id]="messageParagraphId">{{ hint() }}</p>
      }
    </fieldset>
  `,
  styles: `
    .asys-date-spec {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }

    .asys-date-spec__row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--space-2) var(--space-3);
    }

    .asys-date-spec__part {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
  `,
})
export class DateSpecField implements FormValueControl<DateSpec | null> {
  readonly value = model<DateSpec | null>(null);

  readonly legend = input.required<string>();

  readonly hint = input<string | undefined>();

  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = input<boolean>(false);

  readonly disabled = input<boolean>(false);

  readonly touch = output<void>();

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly dateId = `asys-date-spec-${nextId}-date`;

  protected readonly timeId = `asys-date-spec-${nextId}-time`;

  protected readonly messageParagraphId = `asys-date-spec-${nextId++}-message`;

  private readonly dateInput = viewChild<ElementRef<HTMLInputElement>>('dateInput');

  protected readonly showError = computed(() => this.touched() && this.errors().length > 0);

  protected readonly message = computed(() => this.errors()[0]?.message ?? 'Check this value');

  protected readonly messageId = computed(() =>
    this.showError() || this.hint() ? this.messageParagraphId : null,
  );

  protected setDate(date: string): void {
    if (date === '') {
      this.value.set(null);
      return;
    }
    const time = this.value()?.time;
    this.value.set(time === undefined ? { date } : { date, time });
  }

  protected setTime(time: string): void {
    const current = this.value();
    if (current === null) return;
    const trimmed = time.slice(0, 5);
    this.value.set(trimmed === '' ? { date: current.date } : { date: current.date, time: trimmed });
  }

  protected clear(): void {
    this.value.set(null);
    this.dateInput()?.nativeElement.focus();
  }

  /** Focuses the date input, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.dateInput()?.nativeElement.focus(options);
  }
}
