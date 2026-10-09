// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../icon/icon';

/** The Capture button that opens quick add: a plus, the word and, when some failed, how many. */
@Component({
  selector: 'button[asys-capture-button]',
  imports: [Icon],
  template: `<asys-icon [name]="IconName.Plus" /><span class="asys-capture__label">Capture</span>
    @if (count() > 0) {
      &ngsp;<span class="asys-capture__count"
        >{{ count() }}<span class="asys-visually-hidden"> not captured</span></span
      >
    }`,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-capture',
    type: 'button',
  },
  styles: `
    .asys-capture {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      min-height: var(--tap-target-large);
      padding: var(--space-2) var(--space-5) var(--space-2) var(--space-4);
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--signal);
      color: var(--on-signal);
      cursor: pointer;
      white-space: nowrap;
      font-family: var(--font-sans);
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 700;
    }

    .asys-capture .asys-icon {
      font-size: 1.125em;
    }

    .asys-capture:active {
      opacity: 0.85;
    }

    .asys-capture__count {
      min-width: calc(var(--line-height-label) + var(--space-1));
      padding: 0 var(--space-1);
      border-radius: var(--radius-pill);
      background: var(--on-signal);
      color: var(--signal);
      text-align: center;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
    }

    [data-theme='drive'] .asys-capture {
      min-height: var(--tap-target-drive);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
    }
  `,
})
export class CaptureButton {
  readonly count = input<number>(0);

  protected readonly IconName = IconName;
}
