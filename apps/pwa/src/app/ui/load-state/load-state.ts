// SPDX-License-Identifier: EUPL-1.2
import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { Button, ButtonVariant } from '../button/button';
import { IconName } from '../icon/icon';

/** The "Loading…" line of a screen, or its could-not-load alert with a retry button. */
@Component({
  selector: 'asys-load-state',
  imports: [Button],
  template: `
    @if (failed()) {
      <p role="alert">ASYS could not load your Tasks.</p>
      <button
        asys-button
        type="button"
        [variant]="Variant.Quiet"
        [icon]="Icons.RotateRight"
        (click)="retry.emit()"
      >
        Try again
      </button>
    } @else {
      <p>Loading…</p>
    }
  `,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-load-state' },
  styles: `
    .asys-load-state {
      display: contents;
    }
  `,
})
export class LoadState {
  readonly failed = input<boolean>(false);

  readonly retry = output<void>();

  protected readonly Variant = ButtonVariant;

  protected readonly Icons = IconName;
}
