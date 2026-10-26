// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, output, viewChild, ViewEncapsulation } from '@angular/core';
import type { DateSpec, LocalDate } from '@asys/domain';

import { Icon, IconName } from '../../atoms/icon/icon';
import { dayLabel } from '../../support/day-label';
import { FieldRow } from '../field-row/field-row';

/** A Due or Available from as a row: the date button and a split time button. It holds no Sheet. */
@Component({
  selector: 'div[asys-date-row]',
  imports: [FieldRow, Icon],
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-date-row' },
  template: `<button
      asys-field-row
      class="asys-date-row__open"
      [label]="label()"
      [value]="dateText()"
      [set]="value() !== null"
      [disabled]="disabled()"
      [attr.aria-describedby]="describedBy()"
      (click)="openDate.emit()"
      (blur)="dayBlur.emit()"
    ></button>
    @if (value(); as spec) {
      <button
        type="button"
        class="asys-num asys-date-row__time"
        aria-haspopup="dialog"
        [class.asys-date-row__time--set]="spec.time !== undefined"
        [disabled]="disabled()"
        [attr.aria-label]="timeLabel()"
        (click)="openTime.emit()"
      >
        <asys-icon [name]="Clock" />
        @if (spec.time) {
          {{ spec.time }}
        }
      </button>
    }`,
  styleUrl: './date-row.css',
})
export class DateRow {
  readonly label = input.required<string>();

  readonly noneLabel = input.required<string>();

  readonly value = input<DateSpec | null>(null);

  readonly today = input.required<LocalDate>();

  readonly timePrefix = input.required<string>();

  readonly disabled = input(false);

  readonly describedBy = input<string | null>(null);

  readonly openDate = output<void>();

  readonly openTime = output<void>();

  /** The day button lost focus. */
  readonly dayBlur = output<void>();

  protected readonly Clock = IconName.Clock;

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

  private readonly day = viewChild(FieldRow);

  /** Focuses the day button. */
  focus(options?: FocusOptions): void {
    this.day()?.focus(options);
  }
}
