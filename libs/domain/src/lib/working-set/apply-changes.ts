// SPDX-License-Identifier: MPL-2.0

import { ChangeEntity, ChangeOp, type Change, type DomainState } from '../commands/command';
import { TaskStatus } from '../task';

interface HasId {
  readonly id: string;
}

const isLive = (status: TaskStatus): boolean => {
  return status === TaskStatus.Open || status === TaskStatus.Delegated;
};

const upsert = <T extends HasId>(items: readonly T[], item: T): readonly T[] => {
  const index = items.findIndex((candidate) => candidate.id === item.id);

  if (index === -1) {
    return [...items, item];
  }

  return items.map((candidate, at) => (at === index ? item : candidate));
};

const removeById = <T extends HasId>(items: readonly T[], id: string): readonly T[] => {
  return items.some((candidate) => candidate.id === id)
    ? items.filter((candidate) => candidate.id !== id)
    : items;
};

const applyChange = (state: DomainState, change: Change): DomainState => {
  switch (change.entity) {
    case ChangeEntity.Task: {
      if (isLive(change.after.status)) {
        return { ...state, tasks: upsert(state.tasks, change.after) };
      }

      const tasks = removeById(state.tasks, change.after.id);
      const links = state.links.some((link) => link.taskId === change.after.id)
        ? state.links.filter((link) => link.taskId !== change.after.id)
        : state.links;

      return tasks === state.tasks && links === state.links ? state : { ...state, tasks, links };
    }

    case ChangeEntity.Blocker: {
      if (change.op === ChangeOp.Remove) {
        const links = removeById(state.links, change.id);

        return links === state.links ? state : { ...state, links };
      }

      const link = change.after;
      const owner = state.tasks.find((task) => task.id === link.taskId);

      if (owner === undefined || !isLive(owner.status)) {
        return state;
      }

      return { ...state, links: upsert(state.links, link) };
    }

    case ChangeEntity.Area:
      return { ...state, areas: upsert(state.areas, change.after) };

    case ChangeEntity.ReviewItem: {
      if (change.after.resolvedAt === null) {
        return { ...state, reviewItems: upsert(state.reviewItems, change.after) };
      }

      const reviewItems = removeById(state.reviewItems, change.after.id);

      return reviewItems === state.reviewItems ? state : { ...state, reviewItems };
    }

    case ChangeEntity.Settings: {
      const same =
        change.after.timeZone === state.settings.timeZone &&
        change.after.urgencyWindowDays === state.settings.urgencyWindowDays;

      return same ? state : { ...state, settings: change.after };
    }
  }
};

/** Applies change-log entries, in order, to a working set, keeping it in the shape of the snapshot. */
export const applyChanges = (state: DomainState, changes: readonly Change[]): DomainState => {
  return changes.reduce(applyChange, state);
};
