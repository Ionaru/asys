// SPDX-License-Identifier: MPL-2.0

import type { DomainState } from '../commands/command';
import { isInInbox } from '../task';

/** The number shown on the Inbox: Tasks in the Inbox plus unresolved Review items. */
export const inboxCount = (state: DomainState): number => {
  const tasks = state.tasks.filter((task) => isInInbox(task)).length;
  const reviewItems = state.reviewItems.filter((item) => item.resolvedAt === null).length;

  return tasks + reviewItems;
};
