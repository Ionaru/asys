// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

/**
 * A link to another screen from inside text or a list. Routing stays with `RouterLink` (or `href`) on the same
 * element.
 */
@Component({
  selector: 'a[asys-link]',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-link',
    '[class.asys-link--block]': 'block()',
  },
  template: '<ng-content />',
  styles: `
    .asys-link {
      color: var(--signal);
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 0.2em;
    }

    .asys-link--block {
      display: flex;
      align-items: center;
      min-height: var(--tap-target);

      [data-theme='drive'] & {
        min-height: var(--tap-target-drive);
      }
    }
  `,
})
export class Link {
  /** A Link on a line of its own, at least `tap-target` tall. */
  readonly block = input<boolean>(false);
}
