// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aReviewItem, aState, aTask } from '../../test/builders';
import { TaskStatus } from '../task/task';
import { inboxTasks, openReviewItems } from './inbox';

const ids = (items: readonly { readonly id: string }[]): readonly string[] =>
  items.map((item) => item.id);

describe('inboxTasks', () => {
  const a = aTask({ id: 'a', createdAt: 300, important: null });
  const b = aTask({ id: 'b', createdAt: 100, estimateMinutes: null });
  const c = aTask({ id: 'c', createdAt: 100, important: null });
  const d = aTask({ id: 'd', createdAt: 50, important: true, estimateMinutes: 30 });
  const e = aTask({ id: 'e', createdAt: 10, status: TaskStatus.Delegated, important: null });

  it('keeps the Inbox Tasks, oldest first, then by id', () => {
    const state = aState({ tasks: [a, b, c, d, e] });
    expect(ids(inboxTasks(state))).toStrictEqual(['b', 'c', 'a']);
  });

  it('returns the same Task objects and does not mutate state.tasks', () => {
    const tasks = [a, b, c, d, e];
    const result = inboxTasks(aState({ tasks }));
    expect(result[0]).toBe(b);
    expect(result[2]).toBe(a);
    expect(tasks).toStrictEqual([a, b, c, d, e]);
  });

  it('returns an empty list when no Task is in the Inbox', () => {
    expect(inboxTasks(aState({ tasks: [d, e] }))).toStrictEqual([]);
    expect(inboxTasks(aState())).toStrictEqual([]);
  });

  it('orders equal createdAt by id in code-unit order, not by locale', () => {
    const lower = aTask({ id: 'b', createdAt: 1, important: null });
    const upper = aTask({ id: 'B', createdAt: 1, important: null });
    expect(ids(inboxTasks(aState({ tasks: [lower, upper] })))).toStrictEqual(['B', 'b']);
  });
});

describe('openReviewItems', () => {
  it('keeps the unresolved items, oldest first, then by id', () => {
    const r2 = aReviewItem({ id: 'r2', createdAt: 200 });
    const r1 = aReviewItem({ id: 'r1', createdAt: 200 });
    const r0 = aReviewItem({ id: 'r0', createdAt: 100 });
    const rx = aReviewItem({ id: 'rx', createdAt: 1, resolvedAt: 5 });
    const items = [r2, r1, r0, rx];
    const result = openReviewItems(aState({ reviewItems: items }));
    expect(ids(result)).toStrictEqual(['r0', 'r1', 'r2']);
    expect(result[0]).toBe(r0);
    expect(items).toStrictEqual([r2, r1, r0, rx]);
  });

  it('returns an empty list when every item is resolved or there are none', () => {
    const rx = aReviewItem({ id: 'rx', resolvedAt: 5 });
    expect(openReviewItems(aState({ reviewItems: [rx] }))).toStrictEqual([]);
    expect(openReviewItems(aState())).toStrictEqual([]);
  });
});
