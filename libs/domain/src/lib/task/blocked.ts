// SPDX-License-Identifier: MPL-2.0

import { TaskStatus, type BlockerLink, type Task } from './task';

export enum BlockedReasonTag {
  BlockedBy = 'BlockedBy',
}

export interface BlockedBy {
  readonly _tag: BlockedReasonTag.BlockedBy;
  readonly taskIds: readonly string[];
}

/** A tagged union; later slices add members. */
export type BlockedReason = BlockedBy;

export const blockedReasons = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
): readonly BlockedReason[] => {
  const ids = new Set<string>();
  for (const link of links) {
    if (link.taskId !== task.id) continue;
    const blocker = tasks.find((t) => t.id === link.blockerId);
    if (
      blocker &&
      (blocker.status === TaskStatus.Open || blocker.status === TaskStatus.Delegated)
    ) {
      ids.add(blocker.id);
    }
  }
  if (ids.size === 0) return [];
  // Code-unit order on purpose: localeCompare would differ per runtime locale.
  const taskIds = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [{ _tag: BlockedReasonTag.BlockedBy, taskIds }];
};

export const isBlocked = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
): boolean => {
  return blockedReasons(task, tasks, links).length > 0;
};
