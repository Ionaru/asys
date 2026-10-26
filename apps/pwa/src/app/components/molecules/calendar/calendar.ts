// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, output, ViewEncapsulation } from '@angular/core';
import { addDays, formatDate, isoWeekdayOf, type LocalDate } from '@asys/domain';

const WEEKDAY_HEADERS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CALENDAR_DAYS = 14;

/** Two weeks of days from this week's Monday, `div[asys-calendar]`. Days before today are disabled. It emits, it never stores. */
@Component({
  selector: 'div[asys-calendar]',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-calendar',
    role: 'group',
    '[attr.aria-label]': 'label()',
  },
  template: `
    @for (name of weekdays; track name) {
      <span class="asys-calendar__dow" aria-hidden="true">{{ name }}</span>
    }
    @for (day of days(); track day.date) {
      <button
        type="button"
        class="asys-num asys-calendar__day"
        [class.asys-calendar__day--today]="day.isToday"
        [attr.aria-label]="day.label"
        [attr.aria-pressed]="value() === day.date ? 'true' : 'false'"
        [attr.aria-current]="day.isToday ? 'date' : null"
        [disabled]="day.past"
        [textContent]="day.number"
        (click)="pick.emit(day.date)"
      ></button>
    }
  `,
  styleUrl: './calendar.css',
})
export class Calendar {
  protected readonly weekdays = WEEKDAY_HEADERS;

  readonly today = input.required<LocalDate>();

  /** The date now chosen. */
  readonly value = input<LocalDate | null>(null);

  readonly pick = output<LocalDate>();

  protected readonly label = computed(() => {
    const today = this.today();
    const first = this.#first();
    return `Days from ${formatDate(first, today)} to ${formatDate(addDays(first, CALENDAR_DAYS - 1), today)}`;
  });

  protected readonly days = computed(() => {
    const today = this.today();
    const first = this.#first();
    return Array.from({ length: CALENDAR_DAYS }, (_, index) => {
      const date = addDays(first, index);
      const isToday = date === today;
      const label = formatDate(date, today);
      return {
        date,
        number: String(Number(date.slice(8, 10))),
        label: isToday ? `Today, ${label}` : label,
        isToday,
        past: date < today,
      };
    });
  });

  readonly #first = computed(() => addDays(this.today(), 1 - isoWeekdayOf(this.today())));
}
