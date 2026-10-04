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
import { formatMinutes } from '@asys/domain';

import { Button, ButtonVariant } from '../button/button';

let nextId = 0;

const WHOLE_MINUTES = /^\d+$/;

/** The inline form that lowers a Task's Estimate to the time still needed. */
@Component({
  selector: 'asys-log-progress-form',
  imports: [Button],
  encapsulation: ViewEncapsulation.None,
  template: `
    <form class="asys-progress" (submit)="submit($event)" (keydown.escape)="cancel.emit()">
      <label class="asys-field__label" [for]="inputId">Time still needed</label>
      <input
        #control
        class="asys-field__input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        [id]="inputId"
        [attr.aria-invalid]="error() ? 'true' : null"
        [attr.aria-describedby]="messageId"
      />
      @if (error()) {
        <p class="asys-field__error" [id]="messageId">
          <span class="asys-field__error-word">Error:</span>
          Use whole minutes from 1 to {{ estimateMinutes() - 1 }}.
        </p>
      } @else {
        <p class="asys-field__hint" [id]="messageId">Whole minutes, less than {{ formatted() }}.</p>
      }
      <div class="asys-button-group">
        <button asys-button type="submit" [variant]="Variants.Primary" [disabled]="busy()">
          Save
        </button>
        <button asys-button type="button" [variant]="Variants.Quiet" (click)="cancel.emit()">
          Cancel
        </button>
      </div>
    </form>
  `,
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly injector = inject(Injector);

  private readonly uid = nextId++;

  protected readonly Variants = ButtonVariant;

  protected readonly inputId = `asys-progress-input-${this.uid}`;

  protected readonly messageId = `asys-progress-message-${this.uid}`;

  protected readonly error = signal(false);

  /** The stored Estimate, at least 2. */
  readonly estimateMinutes = input.required<number>();

  readonly busy = input<boolean>(false);

  readonly save = output<number>();

  readonly cancel = output<void>();

  constructor() {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLInputElement>('input')?.focus(),
      { injector: this.injector },
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
      this.host.nativeElement.querySelector<HTMLInputElement>('input')?.value ?? ''
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
