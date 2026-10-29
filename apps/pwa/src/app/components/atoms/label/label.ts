// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../icon/icon';

/** Whether a Label marks its field as needed, and whether the person has missed it. */
export enum LabelNeed {
  None = 'none',
  Needed = 'needed',
  Missing = 'missing',
}

/**
 * The design system label, applied as `asys-label` to a `label`, a `legend`, or the `span` that names a
 * group. It can end with a "Needed" marker, in an alert form once the field has been missed.
 */
@Component({
  selector: 'label[asys-label], legend[asys-label], span[asys-label]',
  imports: [Icon],
  template: `
    <ng-content />
    @if (need() !== Need.None) {
      <span class="asys-label__need" [class.asys-label__need--missing]="need() === Need.Missing">
        @if (need() === Need.Missing) {
          <asys-icon [name]="Icons.CircleExclamation" />
        }
        Needed
      </span>
    }
  `,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-label' },
  styles: `
    .asys-label__need {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      margin-inline-start: var(--space-2);
      color: var(--ink-muted);
      font-weight: 400;
      letter-spacing: 0;

      & .asys-icon {
        font-size: 0.9375em;
      }
    }

    .asys-label__need--missing {
      color: var(--danger);
      font-weight: 700;
    }
  `,
})
export class Label {
  /** Marks the field as needed (`Needed`), or as needed and missed (`Missing`). */
  readonly need = input<LabelNeed>(LabelNeed.None);

  protected readonly Need = LabelNeed;

  protected readonly Icons = IconName;
}
