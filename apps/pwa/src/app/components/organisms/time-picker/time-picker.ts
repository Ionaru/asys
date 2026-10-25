// SPDX-License-Identifier: EUPL-1.2
import { Component, input, output, ViewEncapsulation } from '@angular/core';
import { isLocalTime, type LocalTime } from '@asys/domain';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { Input } from '../../atoms/input/input';
import { Label } from '../../atoms/label/label';

let nextId = 0;

const TIMES: readonly LocalTime[] = ['09:00', '10:00', '12:00', '14:00', '17:00', '18:00'];

/** The body of a time sheet: six common times and a native time input. It emits, it never stores. */
@Component({
  selector: 'asys-time-picker',
  imports: [Button, Input, Label],
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (context()) {
      <p class="asys-time-pick__context">{{ context() }}</p>
    }
    <div class="asys-time-pick__chips" role="group" aria-label="Times">
      @for (time of times; track time) {
        <button
          type="button"
          class="asys-num asys-time-pick__chip"
          [attr.aria-pressed]="value() === time ? 'true' : 'false'"
          (click)="pick.emit(time)"
        >
          {{ time }}
        </button>
      }
    </div>
    <div class="asys-field asys-time-pick__other">
      <label asys-label [for]="otherId">Other time</label>
      <input
        #otherInput
        asys-input
        class="asys-num"
        type="time"
        [id]="otherId"
        [value]="value() ?? ''"
        (change)="typeTime(otherInput.value)"
      />
    </div>
    @if (value() !== null) {
      <button
        asys-button
        type="button"
        [variant]="Variant.Secondary"
        [block]="true"
        (click)="remove.emit()"
      >
        Remove time
      </button>
    }
  `,
  styleUrl: './time-picker.css',
})
export class TimePicker {
  protected readonly Variant = ButtonVariant;

  protected readonly times = TIMES;

  protected readonly otherId = `asys-time-pick-${nextId++}-other`;

  readonly value = input<LocalTime | null>(null);

  /** What the time belongs to, such as 'Due tomorrow'. */
  readonly context = input<string>('');

  readonly pick = output<LocalTime>();

  readonly remove = output<void>();

  protected typeTime(text: string): void {
    const time = text.slice(0, 5);
    if (isLocalTime(time)) this.pick.emit(time);
  }
}
