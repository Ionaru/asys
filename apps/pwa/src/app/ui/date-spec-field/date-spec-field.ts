// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, model, viewChild, ViewEncapsulation } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import type { DateSpec } from '@asys/domain';

import { Button, ButtonSize, ButtonVariant } from '../button/button';
import { FieldControl } from '../field-control/field-control';

let nextId = 0;

/** A date with an optional time and a Clear button, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-date-spec-field',
  imports: [Button],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './date-spec-field.component.html',
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
export class DateSpecField extends FieldControl implements FormValueControl<DateSpec | null> {
  readonly value = model<DateSpec | null>(null);

  readonly legend = input.required<string>();

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly dateId = `asys-date-spec-${nextId}-date`;

  protected readonly timeId = `asys-date-spec-${nextId}-time`;

  protected override readonly messageParagraphId = `asys-date-spec-${nextId++}-message`;

  private readonly dateInput = viewChild<ElementRef<HTMLInputElement>>('dateInput');

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
