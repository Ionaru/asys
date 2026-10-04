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

/** A row of the picker list: the Task title, why it is there, its estimate and quadrant. Used as a link. */
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
      <span class="asys-picker-row__title"><ng-content /></span>
      <span class="asys-picker-row__reason">
        @if (overdue()) {
          <asys-status-badge [status]="Statuses.Overdue" />
        }
        <span class="asys-picker-row__reason-text">{{ reason() }}</span>
      </span>
    </span>
    <span class="asys-picker-row__side">
      <span class="asys-picker-row__estimate">{{ estimate() }}</span>
      @if (quadrant(); as q) {
        <asys-quadrant-chip [quadrant]="q" />
      }
    </span>
  `,
  styles: `
    .asys-picker-row,
    .asys-picker-row:visited {
      appearance: none;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: var(--space-3);
      align-items: start;
      width: 100%;
      min-height: var(--row-min);
      margin: 0;
      padding: var(--space-3) var(--space-4);
      background: var(--surface);
      color: var(--ink);
      border: 0;
      border-bottom: 1px solid var(--line);
      border-radius: 0;
      text-align: left;
      text-decoration: none;
      cursor: pointer;
      transition: background-color 150ms ease-out;
    }

    .asys-picker-row:active {
      background: var(--signal-soft);
    }

    .asys-picker-row__main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .asys-picker-row__title {
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }

    .asys-picker-row__reason {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-1) var(--space-2);
    }

    .asys-picker-row__reason-text {
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
      color: var(--ink-muted);
    }

    .asys-picker-row__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--space-1);
    }

    .asys-picker-row__estimate {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: var(--font-size-time);
      line-height: var(--line-height-time);
      font-weight: 500;
      color: var(--ink-muted);
    }

    .asys-picker-row--urgent-elsewhere {
      background: var(--sunken);
      border-top: 1px solid var(--line-strong);
      border-bottom: 1px solid var(--line-strong);
    }

    .asys-picker-row--waiting .asys-picker-row__title {
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
      font-weight: 400;
      color: var(--ink-muted);
    }

    [data-theme='drive'] .asys-picker-row {
      min-height: var(--tap-target-drive);
      padding: var(--space-4);
    }

    [data-theme='drive'] .asys-picker-row__title {
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    [data-theme='drive'] .asys-picker-row__estimate {
      display: none;
    }
  `,
})
export class PickerRow {
  protected readonly Variants = PickerRowVariant;

  protected readonly Statuses = StatusBadgeStatus;

  readonly reason = input.required<string>();

  readonly estimate = input.required<string>();

  readonly quadrant = input<Quadrant | undefined>();

  readonly overdue = input<boolean>(false);

  readonly variant = input<PickerRowVariant>(PickerRowVariant.Ranked);
}
