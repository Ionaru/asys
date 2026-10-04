// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, ViewEncapsulation } from '@angular/core';

/** The status a badge shows. */
export enum StatusBadgeStatus {
  Overdue = 'overdue',
  Blocked = 'blocked',
  Delegated = 'delegated',
  Done = 'done',
  Dropped = 'dropped',
  Skipped = 'skipped',
  Queued = 'queued',
}

const STATUS_WORDS: Record<StatusBadgeStatus, string> = {
  [StatusBadgeStatus.Overdue]: 'Overdue',
  [StatusBadgeStatus.Blocked]: 'Blocked',
  [StatusBadgeStatus.Delegated]: 'Delegated',
  [StatusBadgeStatus.Done]: 'Done',
  [StatusBadgeStatus.Dropped]: 'Dropped',
  [StatusBadgeStatus.Skipped]: 'Skipped',
  [StatusBadgeStatus.Queued]: 'Queued',
};

/** A small badge naming the status of a Task or an item. */
@Component({
  selector: 'asys-status-badge',
  template: '{{ word() }}',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-badge',
    '[class.asys-badge--overdue]': 'status() === Statuses.Overdue',
    '[class.asys-badge--blocked]': 'status() === Statuses.Blocked',
    '[class.asys-badge--delegated]': 'status() === Statuses.Delegated',
    '[class.asys-badge--done]': 'status() === Statuses.Done',
    '[class.asys-badge--dropped]': 'status() === Statuses.Dropped',
    '[class.asys-badge--skipped]': 'status() === Statuses.Skipped',
    '[class.asys-badge--queued]': 'status() === Statuses.Queued',
  },
  styles: `
    .asys-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      min-height: calc(var(--line-height-label) + var(--space-2));
      padding: 0 var(--space-2);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--ink-muted);
      white-space: nowrap;
      font-family: var(--font-sans);
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .asys-badge--overdue {
      background: var(--danger-soft);
      color: var(--on-danger-soft);
    }

    .asys-badge--blocked {
      background: var(--sunken);
      border-color: var(--line-strong);
      color: var(--ink-muted);
    }

    .asys-badge--delegated {
      background: var(--signal-soft);
      color: var(--on-signal-soft);
    }

    .asys-badge--done::before {
      content: '';
      width: 4px;
      height: 8px;
      margin: 0 0 2px 1px;
      border: solid currentColor;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    .asys-badge--dropped {
      color: var(--ink-muted);
      text-decoration: line-through;
    }

    .asys-badge--skipped {
      color: var(--ink-muted);
      font-style: italic;
    }

    .asys-badge--queued {
      background: transparent;
      border-color: var(--line-strong);
      color: var(--ink-muted);
    }
  `,
})
export class StatusBadge {
  protected readonly Statuses = StatusBadgeStatus;

  readonly status = input.required<StatusBadgeStatus>();

  protected readonly word = computed(() => STATUS_WORDS[this.status()]);
}
