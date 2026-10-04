// SPDX-License-Identifier: MPL-2.0

import type { DomainState } from '../commands/command';
import type { ReviewItem } from '../review';
import { isInInbox, type Task } from '../task';

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The Tasks in the Inbox, oldest first: by createdAt, then id. */
export const inboxTasks = (state: DomainState): readonly Task[] => {
  return state.tasks
    .filter((task) => isInInbox(task))
    .sort((a, b) => a.createdAt - b.createdAt || compareStrings(a.id, b.id));
};

/** The unresolved Review items, oldest first: by createdAt, then id. */
export const openReviewItems = (state: DomainState): readonly ReviewItem[] => {
  return state.reviewItems
    .filter((item) => item.resolvedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt || compareStrings(a.id, b.id));
};
