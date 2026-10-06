// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import {
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  TaskKind,
  TaskStatus,
  type Command,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag, DataApi, type CommandOutcome } from '../api/data-api';
import { Haptics } from '../platform/haptics';
import { Ids } from '../platform/ids';
import { CommandAttempts } from './command-attempts';
import { DataStore } from './data-store';
import { DoneOrigin, DoneUndo, PauseReason, UNDO_WINDOW_MS } from './done-undo';

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const KEY_REUSED: CommandOutcome = { _tag: CommandOutcomeTag.KeyReused };

const REJECTED_NOT_FOUND: CommandOutcome = {
  _tag: CommandOutcomeTag.Rejected,
  reason: RejectedReason.NotFound,
};

const NOT_APPLICABLE: CommandOutcome = {
  _tag: CommandOutcomeTag.NotApplicable,
  reason: NotApplicableReason.NotOpen,
  reviewItemId: 'review-1',
};

const SIGNED_OUT: CommandOutcome = { _tag: CommandOutcomeTag.SignedOut };

const REVIEW_SENTENCE = 'That no longer applied, so it waits in the Inbox as a Review item.';

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

const A = task({ id: 'a', title: 'Pay the invoice' });

const B = task({ id: 'b', title: 'Call Marit' });

const completeCommand = (taskId: string): Command => ({
  _tag: CommandTag.CompleteTask,
  taskId,
  expect: { status: TaskStatus.Open },
});

const setVisibility = (value: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
};

describe('DoneUndo', () => {
  let doneUndo: DoneUndo;
  let attempts: CommandAttempts;
  let hold: ReturnType<typeof vi.fn<(command: Command, key: string) => void>>;
  let release: ReturnType<typeof vi.fn<(key: string) => void>>;
  let send: ReturnType<typeof vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>>;
  let runCommand: ReturnType<
    typeof vi.fn<
      (
        command: Command,
        key: string,
        options?: { readonly keepalive?: boolean },
      ) => Promise<CommandOutcome>
    >
  >;
  let tick: ReturnType<typeof vi.fn<() => void>>;
  let sendResolvers: ((outcome: CommandOutcome) => void)[];
  let runResolvers: ((outcome: CommandOutcome) => void)[];

  const advance = async (ms: number): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  const resolveSend = async (index: number, outcome: CommandOutcome): Promise<void> => {
    const resolve = sendResolvers[index];

    if (resolve === undefined) {
      throw new Error(`Send ${index} was never made`);
    }

    resolve(outcome);
    await advance(0);
  };

  const resolveRun = async (index: number, outcome: CommandOutcome): Promise<void> => {
    const resolve = runResolvers[index];

    if (resolve === undefined) {
      throw new Error(`runCommand ${index} was never made`);
    }

    resolve(outcome);
    await advance(0);
  };

  /** Holds A, lets its window end and answers the send. */
  const sendAWith = async (outcome: CommandOutcome): Promise<void> => {
    doneUndo.complete(A, DoneOrigin.Button);
    await advance(UNDO_WINDOW_MS);
    await resolveSend(0, outcome);
  };

  beforeEach(() => {
    let counter = 0;

    vi.useFakeTimers();
    sendResolvers = [];
    runResolvers = [];
    hold = vi.fn<(command: Command, key: string) => void>();
    release = vi.fn<(key: string) => void>();
    send = vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>();
    send.mockImplementation(
      () =>
        new Promise<CommandOutcome>((resolve) => {
          sendResolvers.push(resolve);
        }),
    );
    runCommand =
      vi.fn<
        (
          command: Command,
          key: string,
          options?: { readonly keepalive?: boolean },
        ) => Promise<CommandOutcome>
      >();
    runCommand.mockImplementation(
      () =>
        new Promise<CommandOutcome>((resolve) => {
          runResolvers.push(resolve);
        }),
    );
    tick = vi.fn<() => void>();

    TestBed.configureTestingModule({
      providers: [
        DoneUndo,
        CommandAttempts,
        { provide: DataStore, useValue: { hold, release, send } },
        { provide: DataApi, useValue: { runCommand } },
        {
          provide: Ids,
          useValue: {
            next: () => {
              counter += 1;

              return `key-${counter}`;
            },
          },
        },
        { provide: Haptics, useValue: { tick } },
      ],
    });
    doneUndo = TestBed.inject(DoneUndo);
    attempts = TestBed.inject(CommandAttempts);
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    vi.useRealTimers();
  });

  it('starts with nothing pending, shown or undone, and a focus request count of 0', () => {
    expect(doneUndo.pending()).toBeNull();
    expect(doneUndo.failure()).toBeNull();
    expect(doneUndo.notice()).toBeNull();
    expect(doneUndo.undone()).toBeNull();
    expect(doneUndo.focusRequest()).toBe(0);
  });

  describe('complete', () => {
    it('holds a CompleteTask with the first key, shows the Done and announces it', () => {
      doneUndo.complete(A, DoneOrigin.Button);

      expect(hold).toHaveBeenCalledTimes(1);
      expect(hold.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(hold.mock.calls[0]?.[1]).toBe('key-1');
      expect(doneUndo.pending()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        origin: 'button',
      });
      expect(tick).toHaveBeenCalledTimes(1);
      expect(doneUndo.notice()).toEqual({ text: '“Pay the invoice” is Done.', seq: 1 });
      expect(send).not.toHaveBeenCalled();
    });

    it('records a Swipe origin and gives no haptic tick', () => {
      doneUndo.complete(A, DoneOrigin.Swipe);

      expect(doneUndo.pending()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        origin: 'swipe',
      });
      expect(hold).toHaveBeenCalledTimes(1);
      expect(tick).not.toHaveBeenCalled();
    });

    it('does nothing for a Task that is already pending, and keeps its window', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(3_000);
      doneUndo.complete(A, DoneOrigin.Button);

      expect(hold).toHaveBeenCalledTimes(1);
      expect(tick).toHaveBeenCalledTimes(1);
      expect(doneUndo.notice()?.seq).toBe(1);

      await advance(1_999);

      expect(send).not.toHaveBeenCalled();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('numbers every notice with one counter, so identical texts still differ', () => {
      doneUndo.complete(A, DoneOrigin.Button);
      const first = doneUndo.notice();

      doneUndo.undo();
      doneUndo.complete(A, DoneOrigin.Button);
      const second = doneUndo.notice();

      expect(first?.text).toBe(second?.text);
      expect(first?.seq).toBe(1);
      expect(second?.seq).toBe(2);
    });
  });

  describe('the window', () => {
    it('sends nothing before 5_000 ms and sends once with the command and key at 5_000 ms', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(4_999);

      expect(send).not.toHaveBeenCalled();
      expect(doneUndo.pending()).not.toBeNull();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
      expect(doneUndo.pending()).toBeNull();
    });

    it('sends through DataStore.send and not through DataApi', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(runCommand).not.toHaveBeenCalled();
    });

    it('sends the earlier Done at once when another is completed, and gives the new one a full window', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(1_000);
      doneUndo.complete(B, DoneOrigin.Button);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
      expect(hold).toHaveBeenCalledTimes(2);
      expect(hold.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
      expect(hold.mock.calls[1]?.[1]).toBe('key-2');
      expect(doneUndo.pending()).toEqual({ taskId: 'b', title: 'Call Marit', origin: 'button' });
      expect(doneUndo.notice()).toEqual({ text: '“Call Marit” is Done.', seq: 2 });

      await advance(4_999);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(1);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
      expect(send.mock.calls[1]?.[1]).toBe('key-2');
    });
  });

  describe('undo', () => {
    it('releases the key, clears pending, records undone and never sends', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(2_000);
      doneUndo.undo();

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.pending()).toBeNull();
      expect(doneUndo.undone()).toEqual({ taskId: 'a', seq: 1 });

      await advance(10_000);

      expect(send).not.toHaveBeenCalled();
      expect(runCommand).not.toHaveBeenCalled();
    });

    it('does nothing when no Done is pending', () => {
      doneUndo.undo();

      expect(release).not.toHaveBeenCalled();
      expect(doneUndo.undone()).toBeNull();
    });

    it('counts undone with its own counter', () => {
      doneUndo.complete(A, DoneOrigin.Button);
      doneUndo.undo();
      doneUndo.complete(B, DoneOrigin.Button);
      doneUndo.undo();

      expect(doneUndo.undone()).toEqual({ taskId: 'b', seq: 2 });
    });
  });

  describe('pausing', () => {
    it('keeps the remaining time while a pointer rests on the bar', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(1_000);
      doneUndo.pause(PauseReason.Pointer);
      await advance(10_000);

      expect(send).not.toHaveBeenCalled();

      doneUndo.resume(PauseReason.Pointer);
      await advance(3_999);

      expect(send).not.toHaveBeenCalled();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('stays paused until every reason is resumed', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(1_000);
      doneUndo.pause(PauseReason.Pointer);
      doneUndo.pause(PauseReason.Focus);
      doneUndo.resume(PauseReason.Pointer);
      await advance(10_000);

      expect(send).not.toHaveBeenCalled();

      doneUndo.resume(PauseReason.Focus);
      await advance(3_999);

      expect(send).not.toHaveBeenCalled();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('treats a reason as a set, so pausing twice and resuming once runs the timer', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      doneUndo.pause(PauseReason.Pointer);
      doneUndo.pause(PauseReason.Pointer);
      doneUndo.resume(PauseReason.Pointer);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh window paused while a reason holds and the bar still shows', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      doneUndo.pause(PauseReason.Pointer);
      doneUndo.complete(B, DoneOrigin.Button);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(10_000);

      expect(send).toHaveBeenCalledTimes(1);

      doneUndo.resume(PauseReason.Pointer);
      await advance(4_999);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(1);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
    });

    it('forgets the reasons after undo, so the next window runs', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      doneUndo.pause(PauseReason.Pointer);
      doneUndo.undo();
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('forgets the reasons after the page goes hidden, so the next window runs', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      doneUndo.pause(PauseReason.Focus);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibility('visible');
      doneUndo.complete(B, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('b'));
    });

    it('forgets the reasons after a flush, so the next window runs', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      doneUndo.pause(PauseReason.Focus);

      const flushed = doneUndo.flush();

      await resolveSend(0, APPLIED);
      await flushed;
      doneUndo.complete(B, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
    });

    it('forgets the reasons once a failure is dismissed and no bar shows', async () => {
      await sendAWith(FAILED);
      doneUndo.pause(PauseReason.Focus);
      doneUndo.dismiss();
      doneUndo.complete(B, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
    });
  });

  describe('outcomes', () => {
    it('does nothing more for Applied', async () => {
      await sendAWith(APPLIED);

      expect(release).not.toHaveBeenCalled();
      expect(doneUndo.failure()).toBeNull();
      expect(doneUndo.notice()).toEqual({ text: '“Pay the invoice” is Done.', seq: 1 });
    });

    it('forgets the key after Applied, so a later Done of the Task gets a new one', async () => {
      await sendAWith(APPLIED);
      doneUndo.complete(A, DoneOrigin.Button);

      expect(hold.mock.calls[1]?.[1]).toBe('key-2');
    });

    it('releases the key and shows a failure that never times out for Failed', async () => {
      await sendAWith(FAILED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        message: 'ASYS cannot reach the server. Try again.',
        canRetry: true,
        closedElsewhere: false,
      });
      expect(doneUndo.notice()).toEqual({
        text: '“Pay the invoice” is not Done. ASYS cannot reach the server. Try again.',
        seq: 2,
      });

      await advance(60_000);

      expect(doneUndo.failure()).not.toBeNull();
    });

    it('holds again with the same key on retry after Failed, with a fresh window', async () => {
      await sendAWith(FAILED);
      doneUndo.retry();

      expect(hold).toHaveBeenCalledTimes(2);
      expect(hold.mock.calls[1]?.[0]).toStrictEqual(completeCommand('a'));
      expect(hold.mock.calls[1]?.[1]).toBe('key-1');
      expect(doneUndo.pending()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        origin: 'button',
      });
      expect(doneUndo.failure()).toBeNull();

      await advance(4_999);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(1);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[1]).toBe('key-1');
    });

    it('offers a retry with a fresh key for KeyReused', async () => {
      await sendAWith(KEY_REUSED);

      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        message: 'Something went wrong. Try again.',
        canRetry: true,
        closedElsewhere: false,
      });

      doneUndo.retry();

      expect(hold.mock.calls[1]?.[1]).toBe('key-2');
    });

    it('offers no retry for Rejected', async () => {
      await sendAWith(REJECTED_NOT_FOUND);

      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        message: 'That Task or Area no longer exists.',
        canRetry: false,
        closedElsewhere: false,
      });
      expect(doneUndo.notice()?.text).toBe(
        '“Pay the invoice” is not Done. That Task or Area no longer exists.',
      );
    });

    it('shows the Review-item sentence alone for NotApplicable', async () => {
      await sendAWith(NOT_APPLICABLE);

      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        message: REVIEW_SENTENCE,
        canRetry: false,
        closedElsewhere: true,
      });
      expect(doneUndo.notice()?.text).toBe(REVIEW_SENTENCE);
    });

    it('releases the key and shows nothing for SignedOut', async () => {
      await sendAWith(SIGNED_OUT);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()).toBeNull();
      expect(doneUndo.notice()).toEqual({ text: '“Pay the invoice” is Done.', seq: 1 });
    });

    it('ignores retry when the failure cannot be retried', async () => {
      await sendAWith(REJECTED_NOT_FOUND);
      doneUndo.retry();

      expect(hold).toHaveBeenCalledTimes(1);
      expect(doneUndo.pending()).toBeNull();
      expect(doneUndo.failure()).not.toBeNull();
    });

    it('ignores retry after NotApplicable', async () => {
      await sendAWith(NOT_APPLICABLE);
      doneUndo.retry();

      expect(hold).toHaveBeenCalledTimes(1);
      expect(doneUndo.pending()).toBeNull();
    });

    it('ignores retry when there is no failure', () => {
      doneUndo.retry();

      expect(hold).not.toHaveBeenCalled();
      expect(doneUndo.pending()).toBeNull();
    });

    it('clears the failure on dismiss', async () => {
      await sendAWith(FAILED);
      doneUndo.dismiss();

      expect(doneUndo.failure()).toBeNull();
    });

    it('clears the failure when another Task is completed', async () => {
      await sendAWith(FAILED);
      doneUndo.complete(B, DoneOrigin.Button);

      expect(doneUndo.failure()).toBeNull();
      expect(doneUndo.pending()?.taskId).toBe('b');
    });
  });

  describe('a failure that arrives while another Done is pending', () => {
    /** A is sent when B is completed at 1_000 ms, and A fails at 3_000 ms, leaving B 3_000 ms. */
    const failAWhileBIsPending = async (): Promise<void> => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(1_000);
      doneUndo.complete(B, DoneOrigin.Button);
      await advance(2_000);
      await resolveSend(0, FAILED);
    };

    it('stops the timer of the pending Done until dismiss, then runs the time it had left', async () => {
      await failAWhileBIsPending();

      expect(doneUndo.failure()?.taskId).toBe('a');
      expect(doneUndo.pending()?.taskId).toBe('b');

      await advance(100_000);

      expect(send).toHaveBeenCalledTimes(1);

      doneUndo.dismiss();
      await advance(2_999);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(1);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
      expect(send.mock.calls[1]?.[1]).toBe('key-2');
    });

    it('does not restart the timer when a pause reason is resumed during the displacement', async () => {
      await failAWhileBIsPending();
      doneUndo.pause(PauseReason.Focus);
      doneUndo.resume(PauseReason.Focus);
      await advance(100_000);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('does not run the timer after dismiss while a pause reason holds', async () => {
      await failAWhileBIsPending();
      doneUndo.pause(PauseReason.Pointer);
      doneUndo.dismiss();
      await advance(100_000);

      expect(send).toHaveBeenCalledTimes(1);

      doneUndo.resume(PauseReason.Pointer);
      await advance(3_000);

      expect(send).toHaveBeenCalledTimes(2);
    });

    it('ends the displacement on retry, which sends the pending Done at once and holds the failed Task again', async () => {
      await failAWhileBIsPending();
      doneUndo.retry();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
      expect(hold).toHaveBeenCalledTimes(3);
      expect(hold.mock.calls[2]?.[0]).toStrictEqual(completeCommand('a'));
      expect(hold.mock.calls[2]?.[1]).toBe('key-1');
      expect(doneUndo.pending()?.taskId).toBe('a');
      expect(doneUndo.failure()).toBeNull();
    });
  });

  describe('when the page goes away', () => {
    it('sends a pending Done through DataApi with keepalive on visibilitychange to hidden', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(runCommand.mock.calls[0]?.[1]).toBe('key-1');
      expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
      expect(send).not.toHaveBeenCalled();
      expect(doneUndo.pending()).toBeNull();

      window.dispatchEvent(new Event('pagehide'));
      await advance(10_000);

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
    });

    it('does not send on visibilitychange while the page is visible', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(runCommand).not.toHaveBeenCalled();
      expect(doneUndo.pending()?.taskId).toBe('a');

      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('releases the Task and shows the failure when the keepalive send fails', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await resolveRun(0, FAILED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        message: 'ASYS cannot reach the server. Try again.',
        canRetry: true,
        closedElsewhere: false,
      });

      doneUndo.retry();

      expect(hold.mock.calls[1]?.[1]).toBe('key-1');
    });

    it('settles the key when the keepalive send is Applied', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await resolveRun(0, APPLIED);

      expect(release).not.toHaveBeenCalled();
      expect(doneUndo.failure()).toBeNull();
      expect(attempts.keyFor(completeCommand('a'))).toBe('key-2');
    });

    it('sends a pending Done on pagehide alone', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(runCommand.mock.calls[0]?.[1]).toBe('key-1');
      expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
      expect(send).not.toHaveBeenCalled();
      expect(doneUndo.pending()).toBeNull();

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await advance(10_000);

      expect(runCommand).toHaveBeenCalledTimes(1);
    });

    it('releases the Task and shows the failure when the pagehide send fails', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      window.dispatchEvent(new Event('pagehide'));
      await resolveRun(0, FAILED);

      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()?.taskId).toBe('a');
    });

    it('sends nothing with nothing pending', () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing for a Done that was undone', () => {
      doneUndo.complete(A, DoneOrigin.Button);
      doneUndo.undo();
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).not.toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('sends a pending Done at once and resolves after its outcome is handled', async () => {
      let resolved = false;

      doneUndo.complete(A, DoneOrigin.Button);
      const flushed = doneUndo.flush().then(() => {
        resolved = true;
      });

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
      expect(doneUndo.pending()).toBeNull();

      await advance(0);

      expect(resolved).toBe(false);

      await resolveSend(0, FAILED);
      await flushed;

      expect(resolved).toBe(true);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()?.taskId).toBe('a');
    });

    it('waits for a send that is already in flight', async () => {
      let resolved = false;

      doneUndo.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      const flushed = doneUndo.flush().then(() => {
        resolved = true;
      });

      await advance(0);

      expect(send).toHaveBeenCalledTimes(1);
      expect(resolved).toBe(false);

      await resolveSend(0, APPLIED);
      await flushed;

      expect(resolved).toBe(true);
    });

    it('waits for both the pending Done and a send already in flight', async () => {
      let resolved = false;

      doneUndo.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      doneUndo.complete(B, DoneOrigin.Button);
      const flushed = doneUndo.flush().then(() => {
        resolved = true;
      });

      expect(send).toHaveBeenCalledTimes(2);

      await resolveSend(1, APPLIED);

      expect(resolved).toBe(false);

      await resolveSend(0, APPLIED);
      await flushed;

      expect(resolved).toBe(true);
    });

    it('resolves at once with nothing pending and nothing in flight, without a timer', async () => {
      let resolved = false;
      const flushed = doneUndo.flush().then(() => {
        resolved = true;
      });

      await advance(0);

      expect(resolved).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(send).not.toHaveBeenCalled();

      await flushed;
    });
  });

  describe('requestFocus', () => {
    it('raises focusRequest by 1 each time', () => {
      doneUndo.requestFocus();

      expect(doneUndo.focusRequest()).toBe(1);

      doneUndo.requestFocus();

      expect(doneUndo.focusRequest()).toBe(2);
    });
  });

  describe('when the service is destroyed', () => {
    it('sends nothing on later visibilitychange or pagehide', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      TestBed.resetTestingModule();

      expect(runCommand).toHaveBeenCalledTimes(1);

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
      await advance(10_000);

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
    });

    it('no longer listens for visibilitychange or pagehide', async () => {
      TestBed.resetTestingModule();
      doneUndo.complete(B, DoneOrigin.Button);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));
      await advance(10_000);

      expect(runCommand).not.toHaveBeenCalledWith(
        completeCommand('b'),
        expect.anything(),
        expect.anything(),
      );
      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing on visibilitychange with nothing held', () => {
      TestBed.resetTestingModule();
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('sends a held Done at once through DataApi with keepalive and releases it once', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      TestBed.resetTestingModule();

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(runCommand.mock.calls[0]?.[1]).toBe('key-1');
      expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(send).not.toHaveBeenCalled();

      await advance(10_000);

      expect(send).not.toHaveBeenCalled();
      expect(runCommand).toHaveBeenCalledTimes(1);
    });

    it('does not release or show the outcome of that send', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      TestBed.resetTestingModule();
      await resolveRun(0, FAILED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(doneUndo.failure()).toBeNull();
    });

    it('sends nothing with nothing held', async () => {
      TestBed.resetTestingModule();
      await advance(10_000);

      expect(runCommand).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    });

    it('sends nothing for a Done that was undone', () => {
      doneUndo.complete(A, DoneOrigin.Button);
      doneUndo.undo();
      TestBed.resetTestingModule();

      expect(runCommand).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('still releases and settles the key for a send in flight, and sets no signal', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      TestBed.resetTestingModule();

      expect(runCommand).not.toHaveBeenCalled();

      await resolveSend(0, KEY_REUSED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()).toBeNull();
      expect(attempts.keyFor(completeCommand('a'))).toBe('key-2');
    });

    it('still releases the key when a send in flight fails', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      TestBed.resetTestingModule();
      await resolveSend(0, FAILED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(doneUndo.failure()).toBeNull();
    });

    it('does not release the key when a send in flight is Applied', async () => {
      doneUndo.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      TestBed.resetTestingModule();
      await resolveSend(0, APPLIED);

      expect(release).not.toHaveBeenCalled();
    });
  });
});
