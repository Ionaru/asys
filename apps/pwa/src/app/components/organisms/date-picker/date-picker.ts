// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, output, signal, ViewEncapsulation } from '@angular/core';
import { addDays, isLocalDate, isoWeekdayOf, type LocalDate } from '@asys/domain';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { FieldError } from '../../atoms/field-error/field-error';
import { Input } from '../../atoms/input/input';
import { Label } from '../../atoms/label/label';
import { Segment } from '../../atoms/segment/segment';
import { Calendar } from '../../molecules/calendar/calendar';
import { dayLabel } from '../../support/day-label';

let nextId = 0;

/** The body of a date sheet: quick dates, a two-week calendar and a native date input. It emits, it never stores. */
@Component({
  selector: 'asys-date-picker',
  imports: [Button, Calendar, FieldError, Input, Label, Segment],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './date-picker.component.html',
  styleUrl: './date-picker.css',
})
export class DatePicker {
  protected readonly Variant = ButtonVariant;

  protected readonly otherId = `asys-date-picker-${nextId++}-other`;

  protected readonly errorId = `asys-date-picker-${nextId - 1}-error`;

  /** Whether the last typed date was before today. */
  protected readonly pastTyped = signal(false);

  readonly today = input.required<LocalDate>();

  /** The date now chosen. */
  readonly value = input<LocalDate | null>(null);

  readonly removeLabel = input.required<string>();

  readonly pick = output<LocalDate>();

  readonly remove = output<void>();

  protected readonly chips = computed(() => {
    const today = this.today();
    const afterTomorrow = addDays(today, 2);
    const monday = addDays(afterTomorrow, (8 - isoWeekdayOf(afterTomorrow)) % 7);
    return [today, addDays(today, 1), monday].map((date) => ({
      date,
      label: dayLabel(date, today),
    }));
  });

  protected choose(date: LocalDate): void {
    this.pastTyped.set(false);
    this.pick.emit(date);
  }

  protected typeDate(text: string): void {
    if (text === '') {
      this.pastTyped.set(false);
    } else if (isLocalDate(text)) {
      if (text < this.today()) {
        this.pastTyped.set(true);
      } else {
        this.choose(text);
      }
    }
  }
}
