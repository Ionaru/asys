// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

/** A row of Buttons, `div[asys-button-group]`. The Buttons arrive projected. */
@Component({
  selector: 'div[asys-button-group]',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-button-group',
    '[class.asys-button-group--fill]': 'fill()',
  },
  template: '<ng-content />',
  styles: `
    .asys-button-group {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    /* Fill shares the row in equal widths, never narrower than the words, and stacks when they no longer fit. */
    .asys-button-group--fill > .asys-button {
      flex: 1 1 0;
      min-width: min-content;
      padding-inline: var(--space-2);
      white-space: nowrap;
    }
  `,
})
export class ButtonGroup {
  /** Buttons share the row in equal widths, the decision on a card. */
  readonly fill = input<boolean>(false);
}
