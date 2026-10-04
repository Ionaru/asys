// SPDX-License-Identifier: EUPL-1.2
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

const A: Command = { _tag: CommandTag.CompleteTask, taskId: 'a' };

const B: Command = { _tag: CommandTag.DropTask, taskId: 'b' };

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

describe('CommandAttempts', () => {
  let attempts: CommandAttempts;
  let next: ReturnType<typeof vi.fn<() => string>>;

  beforeEach(() => {
    next = vi.fn<() => string>();
    next.mockReturnValueOnce('k1').mockReturnValueOnce('k2').mockReturnValueOnce('k3');
    TestBed.configureTestingModule({
      providers: [CommandAttempts, { provide: Ids, useValue: { next } }],
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

  it('gives commands that differ in one field different keys', () => {
    const first: Command = { _tag: CommandTag.LogProgress, taskId: 't1', remainingMinutes: 5 };
    const second: Command = { _tag: CommandTag.LogProgress, taskId: 't1', remainingMinutes: 6 };

    expect(attempts.keyFor(first)).toBe('k1');
    expect(attempts.keyFor(second)).toBe('k2');
  });
});
