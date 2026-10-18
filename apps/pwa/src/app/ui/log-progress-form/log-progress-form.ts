// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommandTag, formatMinutes, type LogProgress, TaskStatus } from '@asys/domain';

import { Button, ButtonVariant } from '../../components/atoms/button/button';
import { TextField } from '../text-field/text-field';

const WHOLE_MINUTES = /^\d+$/;

/** The Command that lowers an Open Task's Estimate to the time still needed. */
export const logProgressCommand = (taskId: string, minutes: number): LogProgress => ({
  _tag: CommandTag.LogProgress,
  taskId,
  remainingMinutes: minutes,
  expect: { status: TaskStatus.Open },
});

/** The confirmation that follows a saved Log progress. */
export const estimateNowText = (minutes: number): string =>
  `Estimate is now ${formatMinutes(minutes)}.`;

/** The inline form that lowers a Task's Estimate to the time still needed. */
@Component({
  selector: 'asys-log-progress-form',
  imports: [Button, TextField],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './log-progress-form.component.html',
  styleUrl: './log-progress-form.css',
})
export class LogProgressForm {
  readonly #injector = inject(Injector);

  protected readonly Variants = ButtonVariant;

  private readonly field = viewChild.required(TextField);

  protected readonly text = signal('');

  protected readonly error = signal(false);

  /** The stored Estimate, at least 2. */
  readonly estimateMinutes = input.required<number>();

  readonly busy = input<boolean>(false);

  readonly save = output<number>();

  readonly cancel = output<void>();

  constructor() {
    afterNextRender(() => this.field().focus(), { injector: this.#injector });
  }

  protected readonly hint = computed(
    () => `Whole minutes, less than ${formatMinutes(this.estimateMinutes())}.`,
  );

  protected readonly errors = computed(() =>
    this.error()
      ? [{ kind: 'range', message: `Use whole minutes from 1 to ${this.estimateMinutes() - 1}.` }]
      : [],
  );

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    const text = this.text().trim();
    const minutes = WHOLE_MINUTES.test(text) ? Number(text) : Number.NaN;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > this.estimateMinutes() - 1) {
      this.error.set(true);
      return;
    }
    this.error.set(false);
    this.save.emit(minutes);
  }
}
