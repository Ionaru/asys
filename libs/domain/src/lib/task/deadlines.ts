// SPDX-License-Identifier: MPL-2.0

import { dueInstant, type Instant, type TimeZone } from '../time';
import { TaskStatus, type BlockerLink, type Task } from './task';

const MS_PER_MINUTE = 60_000;

export const isOverdue = (task: Task, now: Instant, timeZone: TimeZone): boolean => {
  return (
    (task.status === TaskStatus.Open || task.status === TaskStatus.Delegated) &&
    task.due !== null &&
    now > dueInstant(task.due, timeZone)
  );
};

export interface DeadlineIndex {
  effectiveDue(task: Task): Instant | null;
  latestStart(task: Task): Instant | null;
}

interface Computed {
  readonly effectiveDue: Instant | null;
  readonly latestStart: Instant | null;
}

interface Walk {
  readonly value: Computed;
  // Smallest stack depth of an on-stack Task this walk skipped (Infinity when none).
  readonly low: number;
}

/**
 * Indexes the graph once so effective due and Latest start can be asked for many Tasks in linear
 * time. A Task already on the current path contributes nothing; a result is shared between calls
 * only when its walk skipped no on-stack Task, so it cannot depend on the path that reached it.
 */
export const deadlineIndex = (
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  timeZone: TimeZone,
): DeadlineIndex => {
  const tasksById = new Map<string, Task>();
  for (const task of tasks) if (!tasksById.has(task.id)) tasksById.set(task.id, task);
  const dependentsByBlocker = new Map<string, string[]>();
  for (const link of links) {
    const dependents = dependentsByBlocker.get(link.blockerId);
    if (dependents === undefined) dependentsByBlocker.set(link.blockerId, [link.taskId]);
    else dependents.push(link.taskId);
  }
  const memo = new Map<string, Computed>();
  const onStack = new Map<string, number>();

  const walk = (task: Task, depth: number): Walk => {
    onStack.set(task.id, depth);
    let min: Instant | null = task.due === null ? null : dueInstant(task.due, timeZone);
    let low = Infinity;
    for (const id of dependentsByBlocker.get(task.id) ?? []) {
      const dependent = tasksById.get(id);
      if (dependent === undefined) continue;
      if (dependent.status !== TaskStatus.Open && dependent.status !== TaskStatus.Delegated)
        continue;
      const stackDepth = onStack.get(id);
      let start: Instant | null;
      if (stackDepth !== undefined) {
        low = Math.min(low, stackDepth);
        continue;
      }
      const known = memo.get(id);
      if (known !== undefined) {
        start = known.latestStart;
      } else {
        const child = walk(dependent, depth + 1);
        start = child.value.latestStart;
        low = Math.min(low, child.low);
      }
      if (start !== null && (min === null || start < min)) min = start;
    }
    onStack.delete(task.id);
    const value: Computed = {
      effectiveDue: min,
      latestStart: min === null ? null : min - (task.estimateMinutes ?? 0) * MS_PER_MINUTE,
    };
    if (low > depth && tasksById.get(task.id) === task) memo.set(task.id, value);
    return { value, low };
  };

  const compute = (task: Task): Computed => {
    const known = tasksById.get(task.id) === task ? memo.get(task.id) : undefined;
    return known ?? walk(task, 0).value;
  };

  return {
    effectiveDue: (task) => compute(task).effectiveDue,
    latestStart: (task) => compute(task).latestStart,
  };
};

export const effectiveDue = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  timeZone: TimeZone,
): Instant | null => {
  return deadlineIndex(tasks, links, timeZone).effectiveDue(task);
};

export const latestStart = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
  timeZone: TimeZone,
): Instant | null => {
  return deadlineIndex(tasks, links, timeZone).latestStart(task);
};
