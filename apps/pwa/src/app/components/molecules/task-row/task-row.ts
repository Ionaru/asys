// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';
import { Quadrant } from '@asys/domain';

import { QuadrantLabel } from '../../atoms/quadrant-label/quadrant-label';
import { StatusBadge, StatusBadgeStatus } from '../../atoms/status-badge/status-badge';

/** The kind of row a picker list shows. */
export enum TaskRowVariant {
  Ranked = 'ranked',
  UrgentElsewhere = 'urgent-elsewhere',
  Waiting = 'waiting',
}

/**
 * A row of the picker list: the Task title, why it is there (led by a compact quadrant glyph) and its estimate.
 * Used as a link.
 */
@Component({
  selector: 'a[asys-task-row]',
  imports: [QuadrantLabel, StatusBadge],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-task-row',
    '[class.asys-task-row--waiting]': 'variant() === Variants.Waiting',
    '[class.asys-task-row--urgent-elsewhere]': 'variant() === Variants.UrgentElsewhere',
  },
  template: `
    <span class="asys-task-row__main">
      <span
        class="asys-task-row__title"
        [attr.data-task-id]="taskId()"
        [attr.data-focus-title]="taskId() === null ? null : ''"
        [attr.data-morph]="morph() ? '' : null"
        ><ng-content
      /></span>
      <span class="asys-task-row__reason">
        @if (quadrant(); as q) {
          <asys-quadrant-label [quadrant]="q" [compact]="true" />
        }
        @if (overdue()) {
          <asys-status-badge [status]="Statuses.Overdue" />
        }
        <span class="asys-task-row__reason-text">{{ reason() }}</span>
      </span>
    </span>
    <span class="asys-task-row__side">
      <span class="asys-num asys-task-row__estimate">{{ estimate() }}</span>
    </span>
  `,
  styleUrl: './task-row.css',
})
export class TaskRow {
  protected readonly Variants = TaskRowVariant;

  protected readonly Statuses = StatusBadgeStatus;

  readonly reason = input.required<string>();

  readonly estimate = input.required<string>();

  readonly quadrant = input<Quadrant | undefined>();

  readonly taskId = input<string | null>(null);

  readonly morph = input<boolean>(false);

  readonly overdue = input<boolean>(false);

  readonly variant = input<TaskRowVariant>(TaskRowVariant.Ranked);
}
