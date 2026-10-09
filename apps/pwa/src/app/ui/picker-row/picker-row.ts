// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';
import { Quadrant } from '@asys/domain';

import { QuadrantChip } from '../quadrant-chip/quadrant-chip';
import { StatusBadge, StatusBadgeStatus } from '../status-badge/status-badge';

/** The kind of row a picker list shows. */
export enum PickerRowVariant {
  Ranked = 'ranked',
  UrgentElsewhere = 'urgent-elsewhere',
  Waiting = 'waiting',
}

/**
 * A row of the picker list: the Task title, why it is there (led by a compact quadrant glyph) and its estimate.
 * Used as a link.
 */
@Component({
  selector: 'a[asys-picker-row]',
  imports: [QuadrantChip, StatusBadge],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-picker-row',
    '[class.asys-picker-row--waiting]': 'variant() === Variants.Waiting',
    '[class.asys-picker-row--urgent-elsewhere]': 'variant() === Variants.UrgentElsewhere',
  },
  template: `
    <span class="asys-picker-row__main">
      <span
        class="asys-picker-row__title"
        [attr.data-task-id]="taskId()"
        [attr.data-morph]="morph() ? '' : null"
        ><ng-content
      /></span>
      <span class="asys-picker-row__reason">
        @if (quadrant(); as q) {
          <asys-quadrant-chip [quadrant]="q" [compact]="true" />
        }
        @if (overdue()) {
          <asys-status-badge [status]="Statuses.Overdue" />
        }
        <span class="asys-picker-row__reason-text">{{ reason() }}</span>
      </span>
    </span>
    <span class="asys-picker-row__side">
      <span class="asys-picker-row__estimate">{{ estimate() }}</span>
    </span>
  `,
  styleUrl: './picker-row.css',
})
export class PickerRow {
  protected readonly Variants = PickerRowVariant;

  protected readonly Statuses = StatusBadgeStatus;

  readonly reason = input.required<string>();

  readonly estimate = input.required<string>();

  readonly quadrant = input<Quadrant | undefined>();

  readonly taskId = input<string | null>(null);

  readonly morph = input<boolean>(false);

  readonly overdue = input<boolean>(false);

  readonly variant = input<PickerRowVariant>(PickerRowVariant.Ranked);
}
