// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, anArea, aReviewItem, aState, aTask } from '../../test/builders';
import { type Change, ChangeEntity, ChangeOp, type DomainState } from '../commands/command';
import type { Area } from '../area';
import type { ReviewItem } from '../review';
import type { Settings } from '../settings';
import { type BlockerLink, type Task, TaskStatus } from '../task';
import { applyChanges } from './apply-changes';

const putTask = (after: Task): Change => ({
  entity: ChangeEntity.Task,
  op: ChangeOp.Put,
  id: after.id,
  after,
});

const putBlocker = (after: BlockerLink): Change => ({
  entity: ChangeEntity.Blocker,
  op: ChangeOp.Put,
  id: after.id,
  after,
});

const removeBlocker = (id: string): Change => ({
  entity: ChangeEntity.Blocker,
  op: ChangeOp.Remove,
  id,
});

const putArea = (after: Area): Change => ({
  entity: ChangeEntity.Area,
  op: ChangeOp.Put,
  id: after.id,
  after,
});

const putReview = (after: ReviewItem): Change => ({
  entity: ChangeEntity.ReviewItem,
  op: ChangeOp.Put,
  id: after.id,
  after,
});

const putSettings = (after: Settings): Change => ({
  entity: ChangeEntity.Settings,
  op: ChangeOp.Put,
  after,
});

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const T1 = aTask({ id: 'T1' });

const T2 = aTask({ id: 'T2' });

const T3 = aTask({ id: 'T3' });

describe('applyChanges task put', () => {
  it.each([TaskStatus.Open, TaskStatus.Delegated] as const)(
    'appends a %s Task that is not in the set',
    (status) => {
      const t1 = aTask({ id: 'T1', status });
      const result = applyChanges(aState({ tasks: [T2] }), [putTask(t1)]);

      expect(result.tasks).toEqual([T2, t1]);
      expect(result.tasks[1]).toBe(t1);
    },
  );

  it.each([TaskStatus.Open, TaskStatus.Delegated] as const)(
    'replaces a known Task by %s at the same index',
    (status) => {
      const updated = aTask({ id: 'T2', status, title: 'New', version: 2 });
      const result = applyChanges(aState({ tasks: [T1, T2, T3] }), [putTask(updated)]);

      expect(result.tasks).toEqual([T1, updated, T3]);
      expect(result.tasks[1]).toBe(updated);
    },
  );

  it.each([TaskStatus.Done, TaskStatus.Dropped, TaskStatus.Skipped] as const)(
    'removes the Task and its own links on a %s put, keeping links that name it as blocker',
    (status) => {
      const state = aState({
        tasks: [T1, T2],
        links: [aLink('T1', 'T2', 'L1'), aLink('T2', 'T3', 'L2')],
      });

      const result = applyChanges(state, [putTask(aTask({ id: 'T2', status }))]);

      expect(result.tasks).toEqual([T1]);
      expect(result.links).toEqual([aLink('T1', 'T2', 'L1')]);
    },
  );

  it.each([TaskStatus.Done, TaskStatus.Dropped, TaskStatus.Skipped] as const)(
    'removes a %s Task together with every link it owns',
    (status) => {
      const state = aState({
        tasks: [T1, T2],
        links: [aLink('T1', 'T2', 'L1'), aLink('T1', 'T3', 'L3')],
      });

      const result = applyChanges(state, [putTask(aTask({ id: 'T1', status }))]);

      expect(result.tasks).toEqual([T2]);
      expect(result.links).toEqual([]);
    },
  );

  it('keeps the links array when a closed Task has no links', () => {
    const state = aState({ tasks: [T1, T2], links: [aLink('T2', 'T3', 'L2')] });

    const result = applyChanges(state, [putTask(aTask({ id: 'T1', status: TaskStatus.Done }))]);

    expect(result.tasks).toEqual([T2]);
    expect(result.links).toBe(state.links);
  });

  it('returns the same state for a Done put of an unknown Task', () => {
    const state = aState({ tasks: [T1], links: [aLink('T1', 'T2')] });

    const result = applyChanges(state, [putTask(aTask({ id: 'T9', status: TaskStatus.Done }))]);

    expect(result).toBe(state);
  });

  it('keeps links, areas, review items and settings identities on a single Task put', () => {
    const state = aState({
      tasks: [T1],
      links: [aLink('T1', 'T2')],
      areas: [anArea({ id: 'A1' })],
      reviewItems: [aReviewItem({ id: 'R1' })],
    });

    const result = applyChanges(state, [putTask(T2)]);

    expect(result).not.toBe(state);
    expect(result.tasks).not.toBe(state.tasks);
    expect(result.links).toBe(state.links);
    expect(result.areas).toBe(state.areas);
    expect(result.reviewItems).toBe(state.reviewItems);
    expect(result.settings).toBe(state.settings);
  });

  it('counts a put that deep-equals the stored Task as a change and stores the after object', () => {
    const state = aState({ tasks: [T1] });
    const same = { ...T1 };

    const result = applyChanges(state, [putTask(same)]);

    expect(result).not.toBe(state);
    expect(result.tasks[0]).toBe(same);
  });
});

describe('applyChanges blocker put', () => {
  it('appends a link in the same list after its Task was put', () => {
    const l1 = aLink('T1', 'T2', 'L1');

    const result = applyChanges(aState(), [putTask(T1), putBlocker(l1)]);

    expect(result.tasks).toEqual([T1]);
    expect(result.links).toEqual([l1]);
  });

  it('ignores a link that comes before its Task in the list', () => {
    const result = applyChanges(aState(), [putBlocker(aLink('T1', 'T2', 'L1')), putTask(T1)]);

    expect(result.tasks).toEqual([T1]);
    expect(result.links).toEqual([]);
  });

  it('returns the same state when the link Task is not in the set', () => {
    const state = aState({ tasks: [T2] });

    expect(applyChanges(state, [putBlocker(aLink('T1', 'T2', 'L1'))])).toBe(state);
  });

  it('ignores a link whose Task is no longer in the set after a Done put', () => {
    const state = aState({ tasks: [T1] });

    const result = applyChanges(state, [
      putTask(aTask({ id: 'T1', status: TaskStatus.Done })),
      putBlocker(aLink('T1', 'T2', 'L1')),
    ]);

    expect(result.tasks).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it('appends a link for a Delegated Task next to existing links', () => {
    const t1 = aTask({ id: 'T1', status: TaskStatus.Delegated });
    const l1 = aLink('T1', 'T2', 'L1');
    const l2 = aLink('T1', 'T3', 'L2');

    const result = applyChanges(aState({ tasks: [t1], links: [l1] }), [putBlocker(l2)]);

    expect(result.links).toEqual([l1, l2]);
  });

  it('replaces an existing link in place by id', () => {
    const l1 = aLink('T1', 'T2', 'L1');
    const l2 = aLink('T1', 'T3', 'L2');
    const l1b = aLink('T1', 'T9', 'L1');

    const result = applyChanges(aState({ tasks: [T1], links: [l1, l2] }), [putBlocker(l1b)]);

    expect(result.links).toEqual([l1b, l2]);
    expect(result.links[0]).toBe(l1b);
  });

  it('does not check that the blocker Task is in the set', () => {
    const l1 = aLink('T1', 'T-unknown', 'L1');

    const result = applyChanges(aState({ tasks: [T1] }), [putBlocker(l1)]);

    expect(result.links).toEqual([l1]);
  });
});

describe('applyChanges blocker remove', () => {
  it('removes the link with that id', () => {
    const l1 = aLink('T1', 'T2', 'L1');
    const l2 = aLink('T1', 'T3', 'L2');

    const result = applyChanges(aState({ tasks: [T1], links: [l1, l2] }), [removeBlocker('L1')]);

    expect(result.links).toEqual([l2]);
  });

  it('returns the same state for an unknown id', () => {
    const state = aState({ tasks: [T1], links: [aLink('T1', 'T2', 'L1')] });

    expect(applyChanges(state, [removeBlocker('nope')])).toBe(state);
  });
});

describe('applyChanges area put', () => {
  it('appends an unknown Area', () => {
    const a1 = anArea({ id: 'A1' });
    const a2 = anArea({ id: 'A2' });

    const result = applyChanges(aState({ areas: [a1] }), [putArea(a2)]);

    expect(result.areas).toEqual([a1, a2]);
  });

  it('replaces a known Area in place', () => {
    const a1 = anArea({ id: 'A1' });
    const a2 = anArea({ id: 'A2' });
    const a1b = anArea({ id: 'A1', name: 'Renamed', version: 2 });

    const result = applyChanges(aState({ areas: [a1, a2] }), [putArea(a1b)]);

    expect(result.areas).toEqual([a1b, a2]);
    expect(result.areas[0]).toBe(a1b);
  });

  it('keeps the other collections by identity', () => {
    const state = aState({ tasks: [T1], areas: [anArea({ id: 'A1' })] });

    const result = applyChanges(state, [putArea(anArea({ id: 'A2' }))]);

    expect(result.tasks).toBe(state.tasks);
    expect(result.links).toBe(state.links);
    expect(result.reviewItems).toBe(state.reviewItems);
    expect(result.settings).toBe(state.settings);
  });
});

describe('applyChanges review item put', () => {
  it('appends an unresolved unknown item', () => {
    const r1 = aReviewItem({ id: 'R1' });
    const r2 = aReviewItem({ id: 'R2' });

    const result = applyChanges(aState({ reviewItems: [r1] }), [putReview(r2)]);

    expect(result.reviewItems).toEqual([r1, r2]);
  });

  it('replaces an unresolved known item in place', () => {
    const r1 = aReviewItem({ id: 'R1' });
    const r2 = aReviewItem({ id: 'R2' });
    const r1b = aReviewItem({ id: 'R1', createdAt: 9 });

    const result = applyChanges(aState({ reviewItems: [r1, r2] }), [putReview(r1b)]);

    expect(result.reviewItems).toEqual([r1b, r2]);
    expect(result.reviewItems[0]).toBe(r1b);
  });

  it('removes the item when the put is resolved', () => {
    const r1 = aReviewItem({ id: 'R1' });
    const r2 = aReviewItem({ id: 'R2' });

    const result = applyChanges(aState({ reviewItems: [r1, r2] }), [
      putReview(aReviewItem({ id: 'R1', resolvedAt: 7 })),
    ]);

    expect(result.reviewItems).toEqual([r2]);
  });

  it('returns the same state when a resolved put names an unknown item', () => {
    const state = aState({ reviewItems: [aReviewItem({ id: 'R1' })] });

    expect(applyChanges(state, [putReview(aReviewItem({ id: 'R9', resolvedAt: 7 }))])).toBe(state);
  });
});

describe('applyChanges settings put', () => {
  it('replaces the settings when a value differs', () => {
    const next: Settings = { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 5 };
    const state = aState({ tasks: [T1] });

    const result = applyChanges(state, [putSettings(next)]);

    expect(result.settings).toBe(next);
    expect(result.tasks).toBe(state.tasks);
  });

  it('replaces the settings when only the time zone differs', () => {
    const next: Settings = { timeZone: 'UTC', urgencyWindowDays: 2 };

    expect(applyChanges(aState(), [putSettings(next)]).settings).toBe(next);
  });

  it('returns the same state when the settings are equal to the current ones', () => {
    const state = aState();

    expect(applyChanges(state, [putSettings({ ...state.settings })])).toBe(state);
  });
});

describe('applyChanges in general', () => {
  it('returns the same state for an empty list', () => {
    const state = aState({ tasks: [T1] });

    expect(applyChanges(state, [])).toBe(state);
  });

  it('returns the same state when every entry is a no-op', () => {
    const state = aState({ tasks: [T1], links: [aLink('T1', 'T2', 'L1')] });

    const result = applyChanges(state, [
      removeBlocker('nope'),
      putBlocker(aLink('T9', 'T1', 'L9')),
      putTask(aTask({ id: 'T9', status: TaskStatus.Dropped })),
      putReview(aReviewItem({ id: 'R9', resolvedAt: 1 })),
      putSettings({ ...state.settings }),
    ]);

    expect(result).toBe(state);
  });

  it('applies entries in order, each seeing the previous result', () => {
    const t1b = aTask({ id: 'T1', title: 'Second' });

    const result = applyChanges(aState(), [putTask(T1), putTask(t1b)]);

    expect(result.tasks).toEqual([t1b]);
  });

  it('does not mutate a deep-frozen input', () => {
    const state = aState({
      tasks: [T1, T2],
      links: [aLink('T1', 'T2', 'L1')],
      areas: [anArea({ id: 'A1' })],
      reviewItems: [aReviewItem({ id: 'R1' })],
    });
    const before = structuredClone(state);
    deepFreeze(state);

    const result = applyChanges(state, [
      putTask(aTask({ id: 'T1', status: TaskStatus.Done })),
      putTask(T3),
      putArea(anArea({ id: 'A2' })),
      putReview(aReviewItem({ id: 'R1', resolvedAt: 3 })),
      putSettings({ timeZone: 'UTC', urgencyWindowDays: 9 }),
    ]);

    expect(state).toEqual(before as DomainState);
    expect(result.tasks.map((task) => task.id)).toEqual(['T2', 'T3']);
  });
});
