// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';

import { Button, ButtonVariant } from '../button/button';

/** An inline confirmation of a destructive action. Focus starts on Cancel, Escape cancels. */
@Component({
  selector: 'asys-inline-confirm',
  imports: [Button],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="asys-confirm"
      role="group"
      [attr.aria-label]="message()"
      (keydown.escape)="cancel.emit()"
    >
      <p class="asys-confirm__message">{{ message() }}</p>
      <div class="asys-button-group">
        <button
          asys-button
          type="button"
          [variant]="Variants.Danger"
          [disabled]="busy()"
          (click)="confirm.emit()"
        >
          {{ confirmLabel() }}
        </button>
        <button
          asys-button
          type="button"
          [variant]="Variants.Quiet"
          class="asys-confirm__cancel"
          (click)="cancel.emit()"
        >
          Cancel
        </button>
      </div>
    </div>
  `,
  styles: `
    .asys-confirm {
      margin-top: var(--space-3);
      padding: var(--space-3);
      background: var(--sunken);
      border-radius: var(--radius-md);
    }

    .asys-confirm__message {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class InlineConfirm {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly #injector = inject(Injector);

  protected readonly Variants = ButtonVariant;

  readonly message = input.required<string>();

  readonly confirmLabel = input.required<string>();

  readonly busy = input<boolean>(false);

  readonly confirm = output<void>();

  readonly cancel = output<void>();

  constructor() {
    afterNextRender(
      () => this.#host.nativeElement.querySelector<HTMLElement>('.asys-confirm__cancel')?.focus(),
      { injector: this.#injector },
    );
  }
}
