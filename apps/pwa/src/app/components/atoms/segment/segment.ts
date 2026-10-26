// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

/**
 * One choice that stays pressed. The consumer binds `[pressed]`, the native `[disabled]` and `(click)` on the
 * button. A stacked num Segment holds `<span class="asys-segment__value">` and `<span class="asys-segment__unit">`
 * and takes an `aria-label` that reads as one ("45 min").
 */
@Component({
  selector: 'button[asys-segment]',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-segment',
    type: 'button',
    '[attr.aria-pressed]': "pressed() ? 'true' : 'false'",
    '[class.asys-segment--num]': 'num()',
    '[class.asys-segment--stacked]': 'stacked()',
  },
  template: '<ng-content />',
  styleUrl: './segment.css',
})
export class Segment {
  /** Whether this choice is the chosen one. */
  readonly pressed = input<boolean>(false);

  /** Shows the content in the mono font with tabular figures. */
  readonly num = input<boolean>(false);

  /** Stacks a value above its unit. */
  readonly stacked = input<boolean>(false);
}
