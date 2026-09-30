// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aLink, aReviewItem, aState, aTask, anArea } from '../../test/builders';
import { PERSONAL_ACTIVE_HOURS } from '../area';
import { applyCommand } from './apply-command';
import { addBlocker, removeBlocker } from './blocker-commands';
import { createArea, updateArea } from './area-commands';
import {
  type Command,
  type DomainState,
  type TransitionResult,
  CommandTag,
  TransitionResultTag,
} from './command';
import { resolveReviewItem } from './review-commands';
import { setTimeZone, setUrgencyWindow } from './settings-commands';
import {
  captureTask,
  completeTask,
  dropTask,
  editTask,
  logProgress,
  triageTask,
} from './task-commands';

const now = Date.parse('2026-10-14T08:00:00.000Z');

const state: DomainState = aState({
  tasks: [
    aTask({ id: 'A' }),
    aTask({ id: 'B' }),
    aTask({ id: 'inbox', estimateMinutes: null, important: null }),
  ],
  links: [aLink('A', 'B', 'l1')],
  areas: [anArea({ id: 'work' })],
  reviewItems: [aReviewItem({ id: 'r1' })],
});

const table: readonly (readonly [
  string,
  Command,
  (s: DomainState, c: never, n: number) => TransitionResult,
])[] = [
  [
    'CaptureTask',
    { _tag: CommandTag.CaptureTask, taskId: 'new', title: 'New', captureText: 'New' },
    captureTask,
  ],
  [
    'TriageTask',
    { _tag: CommandTag.TriageTask, taskId: 'inbox', important: true, estimateMinutes: 15 },
    triageTask,
  ],
  ['EditTask', { _tag: CommandTag.EditTask, taskId: 'A', patch: { title: 'Edited' } }, editTask],
  ['LogProgress', { _tag: CommandTag.LogProgress, taskId: 'A', remainingMinutes: 10 }, logProgress],
  ['CompleteTask', { _tag: CommandTag.CompleteTask, taskId: 'A' }, completeTask],
  ['DropTask', { _tag: CommandTag.DropTask, taskId: 'A' }, dropTask],
  [
    'AddBlocker',
    { _tag: CommandTag.AddBlocker, linkId: 'l2', taskId: 'B', blockerId: 'inbox' },
    addBlocker,
  ],
  ['RemoveBlocker', { _tag: CommandTag.RemoveBlocker, linkId: 'l1' }, removeBlocker],
  [
    'CreateArea',
    {
      _tag: CommandTag.CreateArea,
      areaId: 'home',
      name: 'Home',
      activeHours: PERSONAL_ACTIVE_HOURS,
      defaultPrivacy: null,
    },
    createArea,
  ],
  [
    'UpdateArea',
    { _tag: CommandTag.UpdateArea, areaId: 'work', patch: { name: 'Office' } },
    updateArea,
  ],
  ['SetTimeZone', { _tag: CommandTag.SetTimeZone, timeZone: 'UTC' }, setTimeZone],
  ['SetUrgencyWindow', { _tag: CommandTag.SetUrgencyWindow, days: 5 }, setUrgencyWindow],
  [
    'ResolveReviewItem',
    { _tag: CommandTag.ResolveReviewItem, reviewItemId: 'r1' },
    resolveReviewItem,
  ],
];

describe('applyCommand', () => {
  it('covers all 13 command tags', () => {
    expect(new Set(table.map(([tag]) => tag)).size).toBe(13);
  });

  it.each(table)('dispatches %s to its transition', (_tag, command, transition) => {
    const result = applyCommand(state, command, now);
    expect(result).toEqual(transition(state, command as never, now));
    expect(result._tag).toBe(TransitionResultTag.Applied);
    expect('changes' in result ? result.changes.length : 0).toBeGreaterThan(0);
  });

  it('throws an Error naming an unknown tag', () => {
    const unknown = { _tag: 'Nope' } as unknown as Command;
    expect(() => applyCommand(state, unknown, now)).toThrow(Error);
    expect(() => applyCommand(state, unknown, now)).toThrow(/Nope/);
  });
});
