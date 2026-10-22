// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';
import { formatDay, type DateSpec, type LocalDate, type LocalTime } from '@asys/domain';

import { DatePick } from '../date-pick/date-pick';
import { dayLabel } from '../date-pick/day-label';
import { FieldControl } from '../../components/support/field-control';
import { FieldError } from '../../components/atoms/field-error/field-error';
import { Icon, IconName } from '../../components/atoms/icon/icon';
import { Sheet } from '../sheet/sheet';
import { TimePick } from '../time-pick/time-pick';

let nextId = 0;

/** A Due or Available from as a row: the date opens a sheet, a split button beside it opens the time sheet. */
@Component({
  selector: 'asys-date-spec-row',
  imports: [DatePick, FieldError, Icon, Sheet, TimePick],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './date-spec-row.component.html',
  styleUrl: './date-spec-row.css',
})
export class DateSpecRow extends FieldControl implements FormValueControl<DateSpec | null> {
  protected readonly Chevron = IconName.ChevronRight;

  protected readonly Clock = IconName.Clock;

  readonly value = model<DateSpec | null>(null);

  readonly label = input.required<string>();

  readonly noneLabel = input.required<string>();

  readonly removeLabel = input.required<string>();

  readonly timePrefix = input.required<string>();

  readonly today = input.required<LocalDate>();

  protected override readonly messageParagraphId = `asys-date-spec-row-${nextId++}-message`;

  protected readonly dateOpen = signal(false);

  protected readonly timeOpen = signal(false);

  protected readonly dateText = computed(() => {
    const value = this.value();
    return value === null ? this.noneLabel() : dayLabel(value.date, this.today());
  });

  protected readonly timeLabel = computed(() => {
    const time = this.value()?.time;
    return time === undefined
      ? `Add a time to ${this.label()}`
      : `${this.timePrefix()} ${time}, change time`;
  });

  protected readonly timeContext = computed(() => {
    const value = this.value();
    return value === null ? '' : `${this.label()} ${formatDay(value.date, this.today())}`;
  });

  private readonly row = viewChild<ElementRef<HTMLButtonElement>>('row');

  /** Focuses the row button, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.row()?.nativeElement.focus(options);
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
