// SPDX-License-Identifier: EUPL-1.2
import { computed, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  TaskStatus,
  type Command,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../api/data-api';
import { Ids } from '../platform/ids';
import { CommandAttempts } from './command-attempts';
import { DataStore } from './data-store';

const A: Command = { _tag: CommandTag.CompleteTask, taskId: 'a' };

const B: Command = { _tag: CommandTag.DropTask, taskId: 'b' };

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

/** A promise the test settles by hand. */
const deferred = <T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolveWith, rejectWith) => {
    resolve = resolveWith;
    reject = rejectWith;
  });

  return { promise, resolve, reject };
};

describe('CommandAttempts', () => {
  let attempts: CommandAttempts;
  let awaitingSync: ReturnType<typeof signal<ReadonlySet<string>>>;
  let next: ReturnType<typeof vi.fn<() => string>>;
  let send: ReturnType<typeof vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>>;

  beforeEach(() => {
    next = vi.fn<() => string>();
    next.mockReturnValueOnce('k1').mockReturnValueOnce('k2').mockReturnValueOnce('k3');
    send = vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>();
    awaitingSync = signal<ReadonlySet<string>>(new Set());
    TestBed.configureTestingModule({
      providers: [
        CommandAttempts,
        { provide: Ids, useValue: { next } },
        { provide: DataStore, useValue: { send, awaitingSync } },
      ],
    });
    attempts = TestBed.inject(CommandAttempts);
  });

  it('is not provided unless a screen provides it', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Ids, useValue: { next } }] });

    expect(() => TestBed.inject(CommandAttempts)).toThrow();
  });

  it('keyFor takes a new key from Ids for a new command', () => {
    expect(attempts.keyFor(A)).toBe('k1');
  });

  it('keyFor returns the same key for the same command again', () => {
    expect(attempts.keyFor(A)).toBe('k1');
    expect(attempts.keyFor(A)).toBe('k1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reuses the key after settle with Failed', () => {
    attempts.keyFor(A);
    attempts.settle(A, FAILED);

    expect(attempts.keyFor(A)).toBe('k1');
  });

  it.each<{ name: string; outcome: CommandOutcome }>([
    { name: 'Applied', outcome: APPLIED },
    {
      name: 'NotApplicable',
      outcome: {
        _tag: CommandOutcomeTag.NotApplicable,
        reason: NotApplicableReason.NotOpen,
        reviewItemId: 'r1',
      },
    },
    {
      name: 'Rejected',
      outcome: { _tag: CommandOutcomeTag.Rejected, reason: RejectedReason.Cycle },
    },
    { name: 'KeyReused', outcome: { _tag: CommandOutcomeTag.KeyReused } },
    { name: 'SignedOut', outcome: { _tag: CommandOutcomeTag.SignedOut } },
  ])('forgets the key after settle with $name', ({ outcome }) => {
    expect(attempts.keyFor(A)).toBe('k1');

    attempts.settle(A, outcome);

    expect(attempts.keyFor(A)).toBe('k2');
  });

  it('keeps a failing command key while another command is attempted and settled', () => {
    expect(attempts.keyFor(A)).toBe('k1');
    attempts.settle(A, FAILED);
    expect(attempts.keyFor(B)).toBe('k2');
    attempts.settle(B, APPLIED);

    expect(attempts.keyFor(A)).toBe('k1');
  });

  it('forgets a failed key once a command of the same kind on the same subject settles', () => {
    const three: Command = { _tag: CommandTag.SetUrgencyWindow, days: 3 };
    const five: Command = { _tag: CommandTag.SetUrgencyWindow, days: 5 };

    expect(attempts.keyFor(three)).toBe('k1');
    attempts.settle(three, FAILED);
    expect(attempts.keyFor(five)).toBe('k2');
    attempts.settle(five, APPLIED);

    expect(attempts.keyFor(three)).toBe('k3');
  });

  it('keeps a failed key when another kind of command on the same subject settles', () => {
    const zone: Command = { _tag: CommandTag.SetTimeZone, timeZone: 'Europe/London' };
    const window: Command = { _tag: CommandTag.SetUrgencyWindow, days: 5 };

    expect(attempts.keyFor(zone)).toBe('k1');
    attempts.settle(zone, FAILED);
    expect(attempts.keyFor(window)).toBe('k2');
    attempts.settle(window, APPLIED);

    expect(attempts.keyFor(zone)).toBe('k1');
  });

  it('settle of a command that has no key does not throw', () => {
    expect(() => attempts.settle(A, APPLIED)).not.toThrow();
  });

  it('shares a key between commands that differ only in key order', () => {
    const first: Command = {
      _tag: CommandTag.CompleteTask,
      taskId: 't1',
      expect: { status: TaskStatus.Open },
    };
    const second: Command = {
      expect: { status: TaskStatus.Open },
      taskId: 't1',
      _tag: CommandTag.CompleteTask,
    };

    expect(attempts.keyFor(first)).toBe('k1');
    expect(attempts.keyFor(second)).toBe('k1');
  });

  it('canonicalises nested objects', () => {
    const first: Command = {
      _tag: CommandTag.EditTask,
      taskId: 't1',
      patch: { title: 'x', notes: 'n' },
      expect: { status: TaskStatus.Open, version: 2 },
    };
    const second: Command = {
      _tag: CommandTag.EditTask,
      taskId: 't1',
      patch: { notes: 'n', title: 'x' },
      expect: { version: 2, status: TaskStatus.Open },
    };

    expect(attempts.keyFor(first)).toBe('k1');
    expect(attempts.keyFor(second)).toBe('k1');
  });

  it('treats an undefined property as absent', () => {
    const withUndefined: Command = {
      _tag: CommandTag.CompleteTask,
      taskId: 't1',
      expect: undefined,
    };
    const without: Command = { _tag: CommandTag.CompleteTask, taskId: 't1' };

    expect(attempts.keyFor(withUndefined)).toBe('k1');
    expect(attempts.keyFor(without)).toBe('k1');
  });

  it('send sends the command with its key and resolves the outcome', async () => {
    send.mockResolvedValue(APPLIED);

    await expect(attempts.send(A)).resolves.toBe(APPLIED);
    expect(send).toHaveBeenCalledExactlyOnceWith(A, 'k1');
  });

  it('send settles the attempt: the key survives Failed and is gone after Applied', async () => {
    send
      .mockResolvedValueOnce(FAILED)
      .mockResolvedValueOnce(APPLIED)
      .mockResolvedValueOnce(APPLIED);

    await attempts.send(A);
    await attempts.send(A);
    await attempts.send(A);

    expect(send.mock.calls.map(([, key]) => key)).toEqual(['k1', 'k1', 'k2']);
  });

  it('gives commands that differ in one field different keys', () => {
    const first: Command = { _tag: CommandTag.LogProgress, taskId: 't1', remainingMinutes: 5 };
    const second: Command = { _tag: CommandTag.LogProgress, taskId: 't1', remainingMinutes: 6 };

    expect(attempts.keyFor(first)).toBe('k1');
    expect(attempts.keyFor(second)).toBe('k2');
  });

  describe('busy', () => {
    it('is false for a subject nothing was sent for', () => {
      expect(attempts.busy('a')).toBe(false);
    });

    it('is true for the command subject while its send is in flight, and for no other', async () => {
      const pending = deferred<CommandOutcome>();

      send.mockReturnValue(pending.promise);

      const sending = attempts.send(A);

      expect(attempts.busy('a')).toBe(true);
      expect(attempts.busy('b')).toBe(false);

      pending.resolve(APPLIED);
      await sending;
    });

    it('uses the link id as the subject of a RemoveBlocker and the Task id for an AddBlocker', async () => {
      const pending = deferred<CommandOutcome>();

      send.mockReturnValue(pending.promise);

      const removing = attempts.send({ _tag: CommandTag.RemoveBlocker, linkId: 'l1' });

      expect(attempts.busy('l1')).toBe(true);

      pending.resolve(APPLIED);
      await removing;

      const adding = attempts.send({
        _tag: CommandTag.AddBlocker,
        linkId: 'l2',
        taskId: 't1',
        blockerId: 't2',
      });

      expect(attempts.busy('t1')).toBe(true);
      expect(attempts.busy('t2')).toBe(false);
      expect(attempts.busy('l2')).toBe(false);

      await adding;
    });

    it.each<{ name: string; outcome: CommandOutcome }>([
      { name: 'Applied', outcome: APPLIED },
      { name: 'Failed', outcome: FAILED },
    ])('is false again once the send resolves $name', async ({ outcome }) => {
      const pending = deferred<CommandOutcome>();

      send.mockReturnValue(pending.promise);

      const sending = attempts.send(A);

      pending.resolve(outcome);
      await sending;

      expect(attempts.busy('a')).toBe(false);
    });

    it('is false again once the send rejects, and the rejection reaches the caller', async () => {
      const pending = deferred<CommandOutcome>();

      send.mockReturnValue(pending.promise);

      const sending = attempts.send(A);

      expect(attempts.busy('a')).toBe(true);

      pending.reject(new Error('offline'));

      await expect(sending).rejects.toThrow('offline');
      expect(attempts.busy('a')).toBe(false);
    });

    it('stays true until every overlapping send of one subject has settled', async () => {
      const first = deferred<CommandOutcome>();
      const second = deferred<CommandOutcome>();

      send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      const sendingFirst = attempts.send(A);
      const sendingSecond = attempts.send({ _tag: CommandTag.DropTask, taskId: 'a' });

      first.resolve(APPLIED);
      await sendingFirst;

      expect(attempts.busy('a')).toBe(true);

      second.resolve(APPLIED);
      await sendingSecond;

      expect(attempts.busy('a')).toBe(false);
    });

    it('counts the subjects of overlapping sends apart', async () => {
      const first = deferred<CommandOutcome>();
      const second = deferred<CommandOutcome>();

      send.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

      const sendingA = attempts.send(A);
      const sendingB = attempts.send(B);

      first.resolve(APPLIED);
      await sendingA;

      expect(attempts.busy('a')).toBe(false);
      expect(attempts.busy('b')).toBe(true);

      second.resolve(APPLIED);
      await sendingB;
    });

    it('is true while awaitingSync holds the subject, with nothing in flight', () => {
      awaitingSync.set(new Set(['a']));

      expect(attempts.busy('a')).toBe(true);
      expect(attempts.busy('b')).toBe(false);

      awaitingSync.set(new Set());

      expect(attempts.busy('a')).toBe(false);
    });

    it('is true while in flight even when awaitingSync is empty, and while only awaitingSync holds it', async () => {
      const pending = deferred<CommandOutcome>();

      send.mockReturnValue(pending.promise);

      const sending = attempts.send(A);

      expect(awaitingSync().has('a')).toBe(false);
      expect(attempts.busy('a')).toBe(true);

      awaitingSync.set(new Set(['a']));
      pending.resolve(APPLIED);
      await sending;

      expect(attempts.busy('a')).toBe(true);
    });

    it('does not see sends of another instance', async () => {
      const other = Injector.create({
        providers: [CommandAttempts],
        parent: TestBed.inject(Injector),
      }).get(CommandAttempts);
      const pending = deferred<CommandOutcome>();

      send.mockReturnValue(pending.promise);

      const sending = other.send(A);

      expect(other.busy('a')).toBe(true);
      expect(attempts.busy('a')).toBe(false);

      pending.resolve(APPLIED);
      await sending;
    });

    it('is reactive: a computed over it follows the send', async () => {
      const busy = TestBed.runInInjectionContext(() => computed(() => attempts.busy('a')));
      const pending = deferred<CommandOutcome>();

      send.mockReturnValue(pending.promise);

      expect(busy()).toBe(false);

      const sending = attempts.send(A);

      expect(busy()).toBe(true);

      pending.resolve(APPLIED);
      await sending;

      expect(busy()).toBe(false);

      awaitingSync.set(new Set(['a']));

      expect(busy()).toBe(true);
    });
  });

  describe('track', () => {
    it('counts the subject as in flight while the work runs and resolves its result', async () => {
      const work = deferred<CommandOutcome>();
      const tracking = attempts.track('settings', () => work.promise);

      expect(attempts.busy('settings')).toBe(true);
      expect(attempts.busy('a')).toBe(false);

      work.resolve(APPLIED);

      await expect(tracking).resolves.toBe(APPLIED);
      expect(attempts.busy('settings')).toBe(false);
    });

    it('is false again once the work rejects, and the rejection reaches the caller', async () => {
      const work = deferred<CommandOutcome>();
      const tracking = attempts.track('settings', () => work.promise);

      work.reject(new Error('offline'));

      await expect(tracking).rejects.toThrow('offline');
      expect(attempts.busy('settings')).toBe(false);
    });

    it('shares its count with a send for the same subject', async () => {
      const work = deferred<CommandOutcome>();
      const pending = deferred<CommandOutcome>();

      send.mockReturnValue(pending.promise);

      const tracking = attempts.track('a', () => work.promise);
      const sending = attempts.send(A);

      pending.resolve(APPLIED);
      await sending;

      expect(attempts.busy('a')).toBe(true);

      work.resolve(APPLIED);
      await tracking;

      expect(attempts.busy('a')).toBe(false);
    });
  });
});
