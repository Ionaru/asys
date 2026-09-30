// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, aTask } from '../../test/builders';
import { blockedReasons, isBlocked, BlockedReasonTag } from './blocked';
import { TaskStatus } from './task';

const X = aTask({ id: 'X' });

const links = [aLink('X', 'A', 'l1'), aLink('X', 'B', 'l2')];

/** A blocker that is not in the Task list at all. */
enum Absent {
  Missing = 'missing',
}

type Case = [a: TaskStatus | Absent, b: TaskStatus | Absent, expected: readonly string[]];

const cases: Case[] = [
  [TaskStatus.Open, TaskStatus.Done, ['A']],
  [TaskStatus.Delegated, TaskStatus.Open, ['A', 'B']],
  [TaskStatus.Done, TaskStatus.Dropped, []],
  [TaskStatus.Skipped, TaskStatus.Done, []],
  [TaskStatus.Skipped, TaskStatus.Skipped, []],
  [Absent.Missing, TaskStatus.Done, []],
  [Absent.Missing, TaskStatus.Open, ['B']],
];

const build = (a: TaskStatus | Absent, b: TaskStatus | Absent) => [
  ...(a === Absent.Missing ? [] : [aTask({ id: 'A', status: a })]),
  ...(b === Absent.Missing ? [] : [aTask({ id: 'B', status: b })]),
];

describe('blockedReasons', () => {
  it.each(cases)('with blocker A %s and blocker B %s gives %j', (a, b, expected) => {
    const tasks = build(a, b);
    const reasons = blockedReasons(X, tasks, links);
    expect(reasons).toStrictEqual(
      expected.length === 0 ? [] : [{ _tag: BlockedReasonTag.BlockedBy, taskIds: expected }],
    );
    expect(isBlocked(X, tasks, links)).toBe(expected.length > 0);
  });

  it('ignores a link that blocks another Task', () => {
    const tasks = [aTask({ id: 'A', status: TaskStatus.Open })];
    const other = [aLink('Y', 'A')];
    expect(blockedReasons(X, tasks, other)).toStrictEqual([]);
    expect(isBlocked(X, tasks, other)).toBe(false);
  });

  it('returns no reasons when there are no links', () => {
    expect(blockedReasons(X, [aTask({ id: 'A' })], [])).toStrictEqual([]);
  });

  it('sorts blocker ids by UTF-16 code unit, not by locale', () => {
    const tasks = [aTask({ id: 'b' }), aTask({ id: 'B' })];
    const ls = [aLink('X', 'b'), aLink('X', 'B')];
    expect(blockedReasons(X, tasks, ls)).toStrictEqual([
      { _tag: BlockedReasonTag.BlockedBy, taskIds: ['B', 'b'] },
    ]);
  });

  it('lists a blocker once when it is linked twice', () => {
    const tasks = [aTask({ id: 'A' })];
    const ls = [aLink('X', 'A', 'l1'), aLink('X', 'A', 'l2')];
    expect(blockedReasons(X, tasks, ls)).toStrictEqual([
      { _tag: BlockedReasonTag.BlockedBy, taskIds: ['A'] },
    ]);
  });

  it('ignores the status of the subject Task itself', () => {
    const done = aTask({ id: 'X', status: TaskStatus.Done });
    const tasks = [aTask({ id: 'A', status: TaskStatus.Open })];
    expect(blockedReasons(done, tasks, [aLink('X', 'A')])).toStrictEqual([
      { _tag: BlockedReasonTag.BlockedBy, taskIds: ['A'] },
    ]);
    expect(isBlocked(done, tasks, [aLink('X', 'A')])).toBe(true);
  });

  it('does not need the subject Task to be in the list', () => {
    const tasks = [aTask({ id: 'A' })];
    expect(blockedReasons(X, tasks, [aLink('X', 'A')])).toStrictEqual([
      { _tag: BlockedReasonTag.BlockedBy, taskIds: ['A'] },
    ]);
  });
});
