// SPDX-License-Identifier: MPL-2.0

import { compareCodeUnits } from '../compare';
import { TaskStatus, type BlockerLink, type Task } from './task';

const byTitleThenId = (a: Task, b: Task): number =>
  compareCodeUnits(a.title, b.title) || compareCodeUnits(a.id, b.id);

const isActive = (task: Task): boolean =>
  task.status === TaskStatus.Open || task.status === TaskStatus.Delegated;

/** True when `from` is `target` or waits for it, directly or through other Tasks, following every link. */
export const waitsFor = (links: readonly BlockerLink[], from: string, target: string): boolean => {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const link of links) {
      if (link.taskId === current) stack.push(link.blockerId);
    }
  }
  return false;
};

/** The Tasks `task` may be made to wait for: Open or Delegated, not itself, not already its blockers, and not waiting for it. */
export const blockerCandidates = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
): readonly Task[] => {
  return tasks
    .filter(
      (candidate) =>
        isActive(candidate) &&
        candidate.id !== task.id &&
        !links.some((l) => l.taskId === task.id && l.blockerId === candidate.id) &&
        !waitsFor(links, candidate.id, task.id),
    )
    .sort(byTitleThenId);
};

/** The Open or Delegated Tasks that wait for `task` directly. */
export const blocks = (
  task: Task,
  tasks: readonly Task[],
  links: readonly BlockerLink[],
): readonly Task[] => {
  const waiting = new Set(links.filter((l) => l.blockerId === task.id).map((l) => l.taskId));

  return tasks.filter((t) => waiting.has(t.id) && isActive(t)).sort(byTitleThenId);
};
