// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandTag,
  TaskKind,
  TaskStatus,
  type BlockerLink,
  type Command,
  type DomainState,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../api/data-api';
import { Ids } from '../platform/ids';
import { CommandAttempts } from './command-attempts';
import { DataStore } from './data-store';
import { TaskBlockerActions } from './task-blocker-actions';

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const task = (id: string, title: string): Task => ({
  id,
  title,
  kind: TaskKind.Task,
  status: TaskStatus.Open,
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
  createdAt: 1,
  closedAt: null,
});

const link = (id: string, taskId: string, blockerId: string): BlockerLink => ({
  id,
  taskId,
  blockerId,
});

const STATE: DomainState = {
  tasks: [task('a', 'Alpha'), task('b', 'Bravo'), task('c', 'Charlie')],
  links: [link('l1', 'a', 'b')],
  areas: [],
  reviewItems: [],
  settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
};

const setup = () => {
  const taskId = signal('a');
  const busy = signal(false);
  const send = vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>(
    async () => FAILED,
  );
  let counter = 0;

  TestBed.configureTestingModule({
    providers: [
      TaskBlockerActions,
      CommandAttempts,
      { provide: Ids, useValue: { next: () => `id${++counter}` } },
      {
        provide: DataStore,
        useValue: { state: signal(STATE), send, awaitingSync: signal(new Set<string>()) },
      },
    ],
  });

  const actions = TestBed.inject(TaskBlockerActions);

  actions.connect(
    () => taskId(),
    () => busy(),
  );

  return { actions, taskId, busy, send };
};

describe('TaskBlockerActions', () => {
  it('follows a Task id that changes over time', () => {
    const { actions, taskId } = setup();

    expect(actions.blockedBy().map((row) => row.title)).toEqual(['Bravo']);
    expect(actions.blocks()).toEqual([]);

    taskId.set('b');

    expect(actions.blockedBy()).toEqual([]);
    expect(actions.blocks().map((row) => row.title)).toEqual(['Alpha']);
    expect(actions.candidates().map((row) => row.id)).toEqual(['c']);
  });

  it('shows nothing and sends nothing for no card (an empty id)', async () => {
    const { actions, taskId, send } = setup();

    taskId.set('');

    expect(actions.blockedBy()).toEqual([]);
    expect(actions.blocks()).toEqual([]);
    expect(actions.candidates()).toEqual([]);
    expect(await actions.add('c')).toBe(false);
    expect(await actions.remove('l1')).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('adds a blocker to the Task that is current when Add is tapped', async () => {
    const { actions, taskId, send } = setup();

    await actions.add('c');
    taskId.set('b');
    await actions.add('c');

    const [first, second] = send.mock.calls.map(([command]) => command);

    expect(first).toMatchObject({ _tag: CommandTag.AddBlocker, taskId: 'a', blockerId: 'c' });
    expect(second).toMatchObject({ _tag: CommandTag.AddBlocker, taskId: 'b', blockerId: 'c' });
    expect(second).not.toEqual(first);
  });

  it('retries a failed Add of the same Task with the same link id', async () => {
    const { actions, send } = setup();

    await actions.add('c');
    await actions.add('c');

    const [first, second] = send.mock.calls.map(([command]) => command);

    expect(first).toMatchObject({ _tag: CommandTag.AddBlocker, taskId: 'a', blockerId: 'c' });
    expect(second).toEqual(first);
  });

  it('clears the filter and the failure message when the Task changes', async () => {
    const { actions, taskId } = setup();

    actions.filter.set('char');
    await actions.add('c');

    expect(actions.message()).not.toBe('');

    taskId.set('b');

    expect(actions.filter()).toBe('');
    expect(actions.message()).toBe('');
  });

  it('leaves the new Task alone when an Add for the old one settles late', async () => {
    const { actions, taskId, send } = setup();
    let settle!: (outcome: CommandOutcome) => void;

    send.mockImplementationOnce(
      () =>
        new Promise<CommandOutcome>((resolve) => {
          settle = resolve;
        }),
    );

    const added = actions.add('c');

    taskId.set('b');
    actions.filter.set('char');
    settle(APPLIED);

    expect(await added).toBe(true);
    expect(actions.filter()).toBe('char');
  });
});
