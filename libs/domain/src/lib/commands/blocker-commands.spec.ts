// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, aState, aTask } from '../../test/builders';
import type { BlockerLink } from '../task';
import {
  type AddBlocker,
  ChangeEntity,
  ChangeOp,
  CommandTag,
  RejectedReason,
  TransitionResultTag,
} from './command';
import { addBlocker, removeBlocker } from './blocker-commands';
import { TaskStatus } from '../task/task';

const now = Date.parse('2026-10-14T08:00:00.000Z');

const rejected = (reason: RejectedReason) => ({ _tag: TransitionResultTag.Rejected, reason });

const tasks = ['A', 'B', 'C', 'D'].map((id) => aTask({ id }));

const add = (
  links: readonly BlockerLink[],
  taskId: string,
  blockerId: string,
  linkId = 'new',
  stateTasks = tasks,
) => {
  const command: AddBlocker = { _tag: CommandTag.AddBlocker, linkId, taskId, blockerId };
  return addBlocker(aState({ tasks: stateTasks, links }), command, now);
};

describe('addBlocker', () => {
  it('adds a link as one blocker put and nothing else', () => {
    expect(add([], 'A', 'B', 'l1')).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Blocker,
          op: ChangeOp.Put,
          id: 'l1',
          after: { id: 'l1', taskId: 'A', blockerId: 'B' },
        },
      ],
    });
  });

  it('rejects a Task blocking itself with self_link', () => {
    expect(add([], 'A', 'A')).toEqual(rejected(RejectedReason.SelfLink));
  });

  it('checks self_link before the Tasks exist', () => {
    expect(add([], 'Z', 'Z', 'new', [])).toEqual(rejected(RejectedReason.SelfLink));
  });

  it('rejects a missing blocked Task with not_found', () => {
    expect(add([], 'Z', 'B')).toEqual(rejected(RejectedReason.NotFound));
  });

  it('rejects a missing blocker Task with not_found', () => {
    expect(add([], 'A', 'Z')).toEqual(rejected(RejectedReason.NotFound));
  });

  it('rejects an existing link id with duplicate_id', () => {
    expect(add([aLink('A', 'B', 'l1')], 'C', 'D', 'l1')).toEqual(
      rejected(RejectedReason.DuplicateId),
    );
  });

  it('rejects the same pair under a new id with duplicate_link', () => {
    expect(add([aLink('A', 'B', 'l1')], 'A', 'B', 'l2')).toEqual(
      rejected(RejectedReason.DuplicateLink),
    );
  });

  it('rejects the direct reverse link with cycle', () => {
    expect(add([aLink('A', 'B', 'l1')], 'B', 'A', 'l2')).toEqual(rejected(RejectedReason.Cycle));
  });

  it('rejects a transitive cycle', () => {
    expect(add([aLink('A', 'B'), aLink('B', 'C')], 'C', 'A')).toEqual(
      rejected(RejectedReason.Cycle),
    );
  });

  it('accepts a shortcut link that is no cycle', () => {
    expect(add([aLink('A', 'B'), aLink('B', 'C')], 'A', 'C')._tag).toBe(
      TransitionResultTag.Applied,
    );
  });

  it('accepts a link that extends a chain without closing it', () => {
    expect(add([aLink('A', 'B')], 'C', 'A')._tag).toBe(TransitionResultTag.Applied);
  });

  it('checks duplicate_id before cycle', () => {
    expect(add([aLink('A', 'B', 'l1')], 'B', 'A', 'l1')).toEqual(
      rejected(RejectedReason.DuplicateId),
    );
  });

  it('checks duplicate_id before duplicate_link', () => {
    expect(add([aLink('A', 'B', 'l1')], 'A', 'B', 'l1')).toEqual(
      rejected(RejectedReason.DuplicateId),
    );
  });

  it('rejects a cycle closed through a branching graph', () => {
    const links = [aLink('X', 'P'), aLink('X', 'Q'), aLink('Q', 'Y')];
    const branching = ['X', 'P', 'Q', 'Y'].map((id) => aTask({ id }));
    expect(add(links, 'Y', 'X', 'new', branching)).toEqual(rejected(RejectedReason.Cycle));
  });

  it('terminates on a link set that already holds a cycle', () => {
    expect(add([aLink('C', 'D'), aLink('D', 'C')], 'A', 'C')._tag).toBe(
      TransitionResultTag.Applied,
    );
  });

  it('links Done and Dropped Tasks', () => {
    const done = [
      aTask({ id: 'A', status: TaskStatus.Done }),
      aTask({ id: 'B', status: TaskStatus.Dropped }),
    ];
    expect(add([], 'B', 'A', 'new', done)._tag).toBe(TransitionResultTag.Applied);
    expect(add([], 'A', 'B', 'new', done)._tag).toBe(TransitionResultTag.Applied);
  });
});

describe('removeBlocker', () => {
  it('removes an existing link', () => {
    const state = aState({ links: [aLink('A', 'B', 'l1')] });
    expect(removeBlocker(state, { _tag: CommandTag.RemoveBlocker, linkId: 'l1' }, now)).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [{ entity: ChangeEntity.Blocker, op: ChangeOp.Remove, id: 'l1' }],
    });
  });

  it('rejects a missing link with not_found', () => {
    expect(removeBlocker(aState(), { _tag: CommandTag.RemoveBlocker, linkId: 'l1' }, now)).toEqual(
      rejected(RejectedReason.NotFound),
    );
  });
});
