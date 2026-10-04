// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, aTask } from '../../test/builders';
import { blockerCandidates, blocks, waitsFor } from './blockers';
import { TaskStatus } from './task';

const A = aTask({ id: 'A', title: 'Write' });
const B = aTask({ id: 'B', title: 'Book' });
const C = aTask({ id: 'C', title: 'Call' });
const D = aTask({ id: 'D', title: 'Done one', status: TaskStatus.Done });
const E = aTask({ id: 'E', title: 'Ask', status: TaskStatus.Delegated });
const F = aTask({ id: 'F', title: 'Book' });

const tasks = [A, B, C, D, E, F];

/** A waits for B, B waits for C. */
const links = [aLink('A', 'B'), aLink('B', 'C')];

const ids = (items: readonly { readonly id: string }[]): readonly string[] =>
  items.map((item) => item.id);

describe('waitsFor', () => {
  it('is true for a Task and itself, even without links', () => {
    expect(waitsFor([], 'a', 'a')).toBe(true);
  });

  it('is false without links between different Tasks', () => {
    expect(waitsFor([], 'a', 'b')).toBe(false);
  });

  it('follows links through other Tasks, in the blocked direction only', () => {
    expect(waitsFor(links, 'A', 'B')).toBe(true);
    expect(waitsFor(links, 'A', 'C')).toBe(true);
    expect(waitsFor(links, 'C', 'A')).toBe(false);
    expect(waitsFor(links, 'B', 'A')).toBe(false);
  });

  it('terminates on cyclic links', () => {
    const cyclic = [aLink('a', 'b'), aLink('b', 'a')];
    expect(waitsFor(cyclic, 'a', 'z')).toBe(false);
    expect(waitsFor(cyclic, 'a', 'b')).toBe(true);
  });
});

describe('blockerCandidates', () => {
  it('offers Open and Delegated Tasks that are not blockers yet, by title then id', () => {
    expect(ids(blockerCandidates(A, tasks, links))).toStrictEqual(['E', 'F', 'C']);
  });

  it('leaves out Tasks that already wait for the Task, directly or through others', () => {
    expect(ids(blockerCandidates(C, tasks, links))).toStrictEqual(['E', 'F']);
  });

  it('leaves out a Task that waits for it and one that is already its blocker', () => {
    expect(ids(blockerCandidates(B, tasks, links))).toStrictEqual(['E', 'F']);
  });

  it('orders equal titles by id, and leaves out the Task itself', () => {
    expect(ids(blockerCandidates(E, tasks, []))).toStrictEqual(['B', 'F', 'C', 'A']);
  });

  it('leaves out Done, Dropped and Skipped Tasks', () => {
    const closed = [
      aTask({ id: 'x1', status: TaskStatus.Dropped }),
      aTask({ id: 'x2', status: TaskStatus.Skipped }),
      aTask({ id: 'x3', status: TaskStatus.Done }),
      aTask({ id: 'ok' }),
    ];
    expect(ids(blockerCandidates(A, closed, []))).toStrictEqual(['ok']);
  });

  it('returns Tasks without mutating the input list', () => {
    const input = [...tasks];
    const result = blockerCandidates(A, input, links);
    expect(result[0]).toBe(E);
    expect(input).toStrictEqual(tasks);
  });
});

describe('blocks', () => {
  const blockedByB = [aLink('A', 'B'), aLink('C', 'B'), aLink('D', 'B')];

  it('lists the Open or Delegated Tasks that wait for the Task, by title then id', () => {
    expect(ids(blocks(B, tasks, blockedByB))).toStrictEqual(['C', 'A']);
  });

  it('is empty for a Task nothing waits for', () => {
    expect(blocks(A, tasks, blockedByB)).toStrictEqual([]);
  });

  it('only counts direct links', () => {
    expect(ids(blocks(C, tasks, links))).toStrictEqual(['B']);
  });

  it('lists a Task once when it is linked twice', () => {
    const twice = [aLink('A', 'B', 'l1'), aLink('A', 'B', 'l2')];
    expect(ids(blocks(B, tasks, twice))).toStrictEqual(['A']);
  });

  it('ignores a link whose Task is not in the list', () => {
    expect(blocks(B, tasks, [aLink('missing', 'B')])).toStrictEqual([]);
  });

  it('includes Delegated Tasks and orders equal titles by id', () => {
    const ls = [aLink('F', 'C'), aLink('B', 'C'), aLink('E', 'C')];
    expect(ids(blocks(C, tasks, ls))).toStrictEqual(['E', 'B', 'F']);
  });
});
