// SPDX-License-Identifier: EUPL-1.2
import {
  CommandTag,
  inboxCount,
  isBlocked,
  TaskKind,
  TaskStatus,
  type BlockerLink,
  type CompleteTask,
  type DomainState,
  type DropTask,
  type Instant,
  type Task,
  type TriageTask,
} from '@asys/domain';

import { applyHolds, isStillHeld, type Hold } from './held-state';

const AT = Date.UTC(2026, 9, 3, 10, 0, 0) as Instant;

const task = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
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
  ...overrides,
});

const domainState = (tasks: readonly Task[], extra: Partial<DomainState> = {}): DomainState => ({
  tasks,
  links: [],
  areas: [],
  reviewItems: [],
  settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
  ...extra,
});

const complete = (taskId: string): CompleteTask => ({ _tag: CommandTag.CompleteTask, taskId });

const holdOf = (taskId: string, key = `hold-${taskId}`): Hold => ({
  key,
  command: complete(taskId),
  at: AT,
});

const triage = (taskId: string, overrides: Partial<TriageTask> = {}): TriageTask => ({
  _tag: CommandTag.TriageTask,
  taskId,
  important: true,
  estimateMinutes: 15,
  expect: { status: TaskStatus.Open },
  ...overrides,
});

const drop = (taskId: string): DropTask => ({
  _tag: CommandTag.DropTask,
  taskId,
  expect: { status: TaskStatus.Open },
});

const triageHold = (taskId: string, key = `triage-${taskId}`): Hold => ({
  key,
  command: triage(taskId),
  at: AT,
});

const dropHold = (taskId: string, key = `drop-${taskId}`): Hold => ({
  key,
  command: drop(taskId),
  at: AT,
});

const taskOf = (state: DomainState, id: string): Task | undefined =>
  state.tasks.find((t) => t.id === id);

const idsOf = (state: DomainState): readonly string[] => state.tasks.map((t) => t.id);

describe('applyHolds', () => {
  it('removes a held Open Task', () => {
    const synced = domainState([task({ id: 'A', title: 'A' }), task({ id: 'B', title: 'B' })]);

    const result = applyHolds(synced, [holdOf('A')]);

    expect(idsOf(result)).toEqual(['B']);
  });

  it('returns synced itself when there are no holds', () => {
    const synced = domainState([task({ id: 'A', title: 'A' })]);

    expect(applyHolds(synced, [])).toBe(synced);
  });

  it('returns synced itself when the held Task is missing', () => {
    const synced = domainState([task({ id: 'B', title: 'B' })]);

    expect(applyHolds(synced, [holdOf('A')])).toBe(synced);
  });

  it('returns synced itself when the held Task is already Done, and it is no longer held', () => {
    const synced = domainState([
      task({ id: 'A', title: 'A', status: TaskStatus.Done, closedAt: AT }),
    ]);
    const hold = holdOf('A');

    expect(applyHolds(synced, [hold])).toBe(synced);
    expect(isStillHeld(synced, hold)).toBe(false);
  });

  it('applies several holds in order', () => {
    const synced = domainState([
      task({ id: 'A', title: 'A' }),
      task({ id: 'B', title: 'B' }),
      task({ id: 'C', title: 'C' }),
    ]);

    const result = applyHolds(synced, [holdOf('A'), holdOf('B')]);

    expect(idsOf(result)).toEqual(['C']);
  });

  it('skips a hold that does not apply and still applies the others', () => {
    const synced = domainState([task({ id: 'A', title: 'A' }), task({ id: 'B', title: 'B' })]);

    const result = applyHolds(synced, [holdOf('missing'), holdOf('A')]);

    expect(idsOf(result)).toEqual(['B']);
  });

  it('drops the Inbox count by 1 when an Inbox Task is held', () => {
    const synced = domainState([
      task({ id: 'A', title: 'A', important: null }),
      task({ id: 'B', title: 'B', important: null }),
    ]);

    const result = applyHolds(synced, [holdOf('A')]);

    expect(inboxCount(synced)).toBe(2);
    expect(inboxCount(result)).toBe(1);
  });

  it('keeps the link of a Task that waits for the held Task, and unblocks that Task', () => {
    const a = task({ id: 'A', title: 'A' });
    const c = task({ id: 'C', title: 'C' });
    const link: BlockerLink = { id: 'l1', taskId: 'C', blockerId: 'A' };
    const synced = domainState([a, c], { links: [link] });
    expect(isBlocked(c, synced.tasks, synced.links)).toBe(true);

    const result = applyHolds(synced, [holdOf('A')]);

    expect(idsOf(result)).toEqual(['C']);
    expect(result.links).toEqual([link]);
    expect(isBlocked(c, result.tasks, result.links)).toBe(false);
  });
});

describe('isStillHeld', () => {
  it('is true while the Task is Open', () => {
    const synced = domainState([task({ id: 'A', title: 'A' })]);

    expect(isStillHeld(synced, holdOf('A'))).toBe(true);
  });

  it('is false when the Task is missing', () => {
    expect(isStillHeld(domainState([]), holdOf('A'))).toBe(false);
  });
});

describe('applyHolds with a Triage hold', () => {
  it('sets Important and the Estimate on a Task in the Inbox, so the Inbox count drops', () => {
    const synced = domainState([
      task({ id: 'A', title: 'A', important: null, estimateMinutes: null }),
      task({ id: 'B', title: 'B', important: null }),
    ]);

    const result = applyHolds(synced, [triageHold('A')]);

    expect(taskOf(result, 'A')).toMatchObject({ important: true, estimateMinutes: 15 });
    expect(inboxCount(synced)).toBe(2);
    expect(inboxCount(result)).toBe(1);
  });

  it('skips the hold when the Task is no longer in the Inbox, so it keeps what was set elsewhere', () => {
    const synced = domainState([
      task({ id: 'A', title: 'A', important: false, estimateMinutes: 60 }),
    ]);

    const result = applyHolds(synced, [triageHold('A')]);

    expect(result).toBe(synced);
    expect(taskOf(result, 'A')).toMatchObject({ important: false, estimateMinutes: 60 });
  });

  it('skips the hold when the Task is missing or not Open, and returns synced itself', () => {
    const closed = domainState([
      task({ id: 'A', title: 'A', important: null, status: TaskStatus.Done, closedAt: AT }),
    ]);

    expect(applyHolds(closed, [triageHold('A'), triageHold('missing')])).toBe(closed);
  });

  it('applies a Triage hold after a Drop hold of another Task, in order', () => {
    const synced = domainState([
      task({ id: 'A', title: 'A', important: null }),
      task({ id: 'B', title: 'B', important: null }),
    ]);

    const result = applyHolds(synced, [dropHold('A'), triageHold('B')]);

    expect(idsOf(result)).toEqual(['B']);
    expect(taskOf(result, 'B')).toMatchObject({ important: true });
    expect(inboxCount(result)).toBe(0);
  });
});

describe('applyHolds with a Drop hold', () => {
  it('removes a held Open Task', () => {
    const synced = domainState([
      task({ id: 'A', title: 'A', important: null }),
      task({ id: 'B', title: 'B' }),
    ]);

    const result = applyHolds(synced, [dropHold('A')]);

    expect(idsOf(result)).toEqual(['B']);
    expect(inboxCount(result)).toBe(0);
  });

  it('returns synced itself when the Task is missing or already Dropped', () => {
    const dropped = domainState([
      task({ id: 'A', title: 'A', status: TaskStatus.Dropped, closedAt: AT }),
    ]);

    expect(applyHolds(dropped, [dropHold('A'), dropHold('missing')])).toBe(dropped);
  });
});

describe('isStillHeld with a Triage or Drop hold', () => {
  it('is true for a Triage while the synced Task is in the Inbox', () => {
    const synced = domainState([task({ id: 'A', title: 'A', important: null })]);

    expect(isStillHeld(synced, triageHold('A'))).toBe(true);
  });

  it('is false for a Triage when the synced Task is missing, closed or already triaged', () => {
    expect(isStillHeld(domainState([]), triageHold('A'))).toBe(false);
    expect(
      isStillHeld(
        domainState([
          task({ id: 'A', title: 'A', important: null, status: TaskStatus.Done, closedAt: AT }),
        ]),
        triageHold('A'),
      ),
    ).toBe(false);
    expect(isStillHeld(domainState([task({ id: 'A', title: 'A' })]), triageHold('A'))).toBe(false);
  });

  it('is true for a Drop while the synced Task is Open, false once it is closed or missing', () => {
    expect(isStillHeld(domainState([task({ id: 'A', title: 'A' })]), dropHold('A'))).toBe(true);
    expect(
      isStillHeld(
        domainState([task({ id: 'A', title: 'A', status: TaskStatus.Dropped, closedAt: AT })]),
        dropHold('A'),
      ),
    ).toBe(false);
    expect(isStillHeld(domainState([]), dropHold('A'))).toBe(false);
  });
});
