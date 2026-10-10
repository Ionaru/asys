// SPDX-License-Identifier: MPL-2.0

import type { DomainState } from '../commands/command';
import { compareCodeUnits } from '../compare';
import type { ReviewItem } from '../review';
import { isInInbox, type Task } from '../task';

/** The Tasks in the Inbox, oldest first: by createdAt, then id. */
export const inboxTasks = (state: DomainState): readonly Task[] => {
  return state.tasks
    .filter((task) => isInInbox(task))
    .sort((a, b) => a.createdAt - b.createdAt || compareCodeUnits(a.id, b.id));
};

/** The unresolved Review items, oldest first: by createdAt, then id. */
export const openReviewItems = (state: DomainState): readonly ReviewItem[] => {
  return state.reviewItems
    .filter((item) => item.resolvedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt || compareCodeUnits(a.id, b.id));
};
