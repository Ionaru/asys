// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../icon/icon';

/**
 * An icon that says what a value means, then the value. Display only. The label is what screen readers
 * hear before the value (`Estimate:`). Put facts in a `ul.asys-facts`.
 */
@Component({
  selector: 'li[asys-fact]',
  imports: [Icon],
  template: `
    <asys-icon [name]="icon()" />
    <span class="asys-visually-hidden">{{ label() }}</span>
    <ng-content />
  `,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-fact',
    '[class.asys-fact--strong]': 'strong()',
  },
  styles: `
    .asys-facts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) var(--space-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .asys-fact {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      min-width: 0;
      color: var(--ink-muted);
      font-family: var(--font-sans);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
    }

    .asys-fact--strong {
      color: var(--ink);
      font-weight: 600;
    }

    .asys-fact .asys-num {
      font-weight: 500;
    }

    .asys-fact--strong .asys-num {
      font-weight: 600;
    }
  `,
})
export class Fact {
  readonly icon = input.required<IconName>();

  /** What screen readers hear before the value, such as `Estimate:`. */
  readonly label = input.required<string>();

  /** Draws the fact in full ink and a heavier weight. */
  readonly strong = input<boolean>(false);
}
