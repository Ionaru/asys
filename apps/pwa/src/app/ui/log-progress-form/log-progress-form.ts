// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { CommandTag, formatMinutes, type LogProgress, TaskStatus } from '@asys/domain';

import { Button, ButtonVariant } from '../button/button';
import { FieldError } from '../field-error/field-error';

let nextId = 0;

const WHOLE_MINUTES = /^\d+$/;

/** The Command that lowers an open Task's Estimate to the time still needed. */
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
  imports: [Button, FieldError],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './log-progress-form.component.html',
  styleUrl: './log-progress-form.css',
})
export class LogProgressForm {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly #injector = inject(Injector);

  readonly #uid = nextId++;

  protected readonly Variants = ButtonVariant;

  protected readonly inputId = `asys-progress-input-${this.#uid}`;

  protected readonly messageId = `asys-progress-message-${this.#uid}`;

  protected readonly error = signal(false);

  /** The stored Estimate, at least 2. */
  readonly estimateMinutes = input.required<number>();

  readonly busy = input<boolean>(false);

  readonly save = output<number>();

  readonly cancel = output<void>();

  constructor() {
    afterNextRender(
      () => this.#host.nativeElement.querySelector<HTMLInputElement>('input')?.focus(),
      { injector: this.#injector },
    );
  }

  protected formatted(): string {
    return formatMinutes(this.estimateMinutes());
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    const text = (
      this.#host.nativeElement.querySelector<HTMLInputElement>('input')?.value ?? ''
    ).trim();
    const minutes = WHOLE_MINUTES.test(text) ? Number(text) : Number.NaN;
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > this.estimateMinutes() - 1) {
      this.error.set(true);
      return;
    }
    this.error.set(false);
    this.save.emit(minutes);
  }
}
