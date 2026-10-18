// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../icon/icon';

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

const STATUS_ICONS: Record<StatusBadgeStatus, IconName> = {
  [StatusBadgeStatus.Overdue]: IconName.CircleExclamation,
  [StatusBadgeStatus.Blocked]: IconName.Ban,
  [StatusBadgeStatus.Delegated]: IconName.User,
  [StatusBadgeStatus.Done]: IconName.Check,
  [StatusBadgeStatus.Dropped]: IconName.Xmark,
  [StatusBadgeStatus.Skipped]: IconName.Forward,
  [StatusBadgeStatus.Queued]: IconName.CloudArrowUp,
};

/** A small badge naming the status of a Task or an item. */
@Component({
  selector: 'asys-status-badge',
  imports: [Icon],
  template: '<asys-icon [name]="icon()" />{{ word() }}',
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
  styleUrl: './status-badge.css',
})
export class StatusBadge {
  protected readonly Statuses = StatusBadgeStatus;

  readonly status = input.required<StatusBadgeStatus>();

  protected readonly word = computed(() => STATUS_WORDS[this.status()]);

  protected readonly icon = computed(() => STATUS_ICONS[this.status()]);
}
