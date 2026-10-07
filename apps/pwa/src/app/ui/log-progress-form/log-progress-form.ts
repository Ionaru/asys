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
import { formatMinutes, type Task, TaskStatus } from '@asys/domain';

import { Button, ButtonVariant } from '../button/button';

let nextId = 0;

const WHOLE_MINUTES = /^\d+$/;

/** The time still needed is at least 1 minute and less than the Estimate, so the Estimate must be 2 or more. */
const MIN_LOGGABLE_ESTIMATE = 2;

/** Whether progress can be logged on the Task: it is open and its Estimate leaves room below it. */
export const canLogProgress = (task: Task | undefined): boolean =>
  task !== undefined &&
  task.status === TaskStatus.Open &&
  task.estimateMinutes !== null &&
  task.estimateMinutes >= MIN_LOGGABLE_ESTIMATE;

/** The inline form that lowers a Task's Estimate to the time still needed. */
@Component({
  selector: 'asys-log-progress-form',
  imports: [Button],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './log-progress-form.component.html',
  styles: `
    .asys-progress {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin-top: var(--space-3);
    }
  `,
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
