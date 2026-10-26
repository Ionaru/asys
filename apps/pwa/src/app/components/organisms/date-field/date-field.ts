// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  input,
  model,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { formatDay, type DateSpec, type LocalDate, type LocalTime } from '@asys/domain';

import { DatePicker } from '../date-picker/date-picker';
import { FieldControl } from '../../support/field-control';
import { FieldError } from '../../atoms/field-error/field-error';
import { DateRow } from '../../molecules/date-row/date-row';
import { Sheet } from '../sheet/sheet';
import { TimePicker } from '../time-picker/time-picker';

let nextId = 0;

/** A Due or Available from as a row: the date opens a sheet, a split button beside it opens the time sheet. */
@Component({
  selector: 'asys-date-field',
  imports: [DateRow, DatePicker, FieldError, Sheet, TimePicker],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './date-field.component.html',
})
export class DateField extends FieldControl implements FormValueControl<DateSpec | null> {
  readonly value = model<DateSpec | null>(null);

  readonly label = input.required<string>();

  readonly noneLabel = input.required<string>();

  readonly removeLabel = input.required<string>();

  readonly timePrefix = input.required<string>();

  readonly today = input.required<LocalDate>();

  protected override readonly messageParagraphId = `asys-date-field-${nextId++}-message`;

  protected readonly dateOpen = signal(false);

  protected readonly timeOpen = signal(false);

  protected readonly timeContext = computed(() => {
    const value = this.value();
    return value === null ? '' : `${this.label()} ${formatDay(value.date, this.today())}`;
  });

  private readonly row = viewChild(DateRow);

  /** Focuses the row button, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.row()?.focus(options);
  }

  protected pickDate(date: LocalDate): void {
    const time = this.value()?.time;
    this.value.set(time === undefined ? { date } : { date, time });
    this.dateOpen.set(false);
  }

  protected removeDate(): void {
    this.value.set(null);
    this.dateOpen.set(false);
  }

  protected pickTime(time: LocalTime): void {
    const current = this.value();
    if (current !== null) {
      this.value.set({ date: current.date, time });
    }
    this.timeOpen.set(false);
  }

  protected removeTime(): void {
    const current = this.value();
    if (current !== null) {
      this.value.set({ date: current.date });
    }
    this.timeOpen.set(false);
  }
}
