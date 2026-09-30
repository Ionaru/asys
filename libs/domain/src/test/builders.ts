// SPDX-License-Identifier: MPL-2.0

import { WORK_ACTIVE_HOURS, type Area } from '../lib/area';
import type { DomainState } from '../lib/commands/command';
import type { ReviewItem } from '../lib/review';
import type { Settings } from '../lib/settings';
import { blockedReasons } from '../lib/task/blocked';
import { type BlockerLink, type Task, TaskKind, TaskStatus } from '../lib/task/task';

/** A complete Task with neutral defaults; pass overrides for what a test cares about. */
export const aTask = (overrides: Partial<Task> & { readonly id: string }): Task => {
  return {
    kind: TaskKind.Task,
    status: TaskStatus.Open,
    title: `Task ${overrides.id}`,
    notes: '',
    captureText: '',
    areaId: null,
    availableFrom: null,
    due: null,
    estimateMinutes: 30,
    important: true,
    voice: null,
    privacy: null,
    dueMoveCount: 0,
    version: 1,
    createdAt: 0,
    closedAt: null,
    ...overrides,
  };
};

/** `taskId` is the blocked Task, `blockerId` the Task it waits for. */
export const aLink = (
  taskId: string,
  blockerId: string,
  id = `${taskId}<-${blockerId}`,
): BlockerLink => {
  return { id, taskId, blockerId };
};

/** A complete Area with neutral defaults; pass overrides for what a test cares about. */
export const anArea = (overrides: Partial<Area> & { readonly id: string }): Area => {
  return {
    name: `Area ${overrides.id}`,
    activeHours: WORK_ACTIVE_HOURS,
    defaultPrivacy: null,
    version: 1,
    ...overrides,
  };
};

/** An empty DomainState; pass overrides for the rows a test cares about. */
export const aState = (partial: Partial<DomainState> = {}): DomainState => {
  return {
    tasks: [],
    links: [],
    areas: [],
    reviewItems: [],
    settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
    ...partial,
  };
};

/** An open (unresolved) ReviewItem with neutral defaults; pass overrides for what a test cares about. */
export const aReviewItem = (
  overrides: Partial<ReviewItem> & { readonly id: string },
): ReviewItem => {
  return {
    kind: 'expectation_failed',
    subjects: [{ type: 'task', id: 't1' }],
    payload: { note: 'x' },
    dedupeKey: null,
    createdAt: 0,
    resolvedAt: null,
    ...overrides,
  };
};

/** The time zone every scenario test runs in. */
export const AMS = 'Europe/Amsterdam';

/** The Settings every scenario test runs with. */
export const AMS_SETTINGS: Settings = { timeZone: AMS, urgencyWindowDays: 2 };

/** The Tasks that currently block `task`, as the ids of its BlockedBy reason (empty when it is not Blocked). */
export const blockerIdsOf = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
): readonly string[] => {
  return blockedReasons(task, tasks, links).flatMap((reason) => reason.taskIds);
};
