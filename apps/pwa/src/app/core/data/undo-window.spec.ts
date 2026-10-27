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
  type TriageTask,
} from '@asys/domain';

import { CommandOutcomeTag, DataApi, type CommandOutcome } from '../api/data-api';
import { Haptics } from '../platform/haptics';
import { Ids } from '../platform/ids';
import { CommandAttempts } from './command-attempts';
import { DataStore } from './data-store';
import { DoneOrigin, PauseReason, UNDO_WINDOW_MS, UndoKind, UndoWindow } from './undo-window';

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

/** What `complete` announces: the Task is Done, and for how long Undo stays available. */
const doneAnnouncement = (title: string): string =>
  `“${title}” is Done. Undo is available for 5 seconds.`;

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

const triageCommand = (taskId: string): TriageTask => ({
  _tag: CommandTag.TriageTask,
  taskId,
  important: true,
  estimateMinutes: 15,
  expect: { status: TaskStatus.Open },
});

const dropCommand = (taskId: string): Command => ({
  _tag: CommandTag.DropTask,
  taskId,
  expect: { status: TaskStatus.Open },
});

const setVisibility = (value: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
};

describe('UndoWindow', () => {
  let undoWindow: UndoWindow;
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
    undoWindow.complete(A, DoneOrigin.Button);
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
        UndoWindow,
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
    undoWindow = TestBed.inject(UndoWindow);
    attempts = TestBed.inject(CommandAttempts);
  });

  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    vi.useRealTimers();
  });

  it('starts with nothing pending, shown or undone, and a focus request count of 0', () => {
    expect(undoWindow.pending()).toBeNull();
    expect(undoWindow.failure()).toBeNull();
    expect(undoWindow.notice()).toBeNull();
    expect(undoWindow.undone()).toBeNull();
    expect(undoWindow.focusRequest()).toBe(0);
  });

  describe('complete', () => {
    it('holds a CompleteTask with the first key, shows the Done and announces it', () => {
      undoWindow.complete(A, DoneOrigin.Button);

      expect(hold).toHaveBeenCalledTimes(1);
      expect(hold.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(hold.mock.calls[0]?.[1]).toBe('key-1');
      expect(undoWindow.pending()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: 'done',
        status: 'Done',
        undoLabel: 'Undo Done: Pay the invoice',
        origin: 'button',
        remainingMs: 5_000,
      });
      expect(tick).toHaveBeenCalledTimes(1);
      expect(undoWindow.notice()).toEqual({
        text: '“Pay the invoice” is Done. Undo is available for 5 seconds.',
        seq: 1,
      });
      expect(send).not.toHaveBeenCalled();
    });

    it('records a Swipe origin and gives no haptic tick', () => {
      undoWindow.complete(A, DoneOrigin.Swipe);

      expect(undoWindow.pending()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: 'done',
        status: 'Done',
        undoLabel: 'Undo Done: Pay the invoice',
        origin: 'swipe',
        remainingMs: 5_000,
      });
      expect(hold).toHaveBeenCalledTimes(1);
      expect(tick).not.toHaveBeenCalled();
    });

    it('opens the window with the whole of it remaining, whatever the origin', () => {
      undoWindow.complete(A, DoneOrigin.Button);

      expect(UNDO_WINDOW_MS).toBe(5_000);
      expect(undoWindow.pending()?.remainingMs).toBe(UNDO_WINDOW_MS);

      undoWindow.undo();
      undoWindow.complete(B, DoneOrigin.Swipe);

      expect(undoWindow.pending()?.remainingMs).toBe(UNDO_WINDOW_MS);
    });

    it('announces the Task as Done and how long Undo is available, in whole seconds', () => {
      undoWindow.complete(A, DoneOrigin.Button);

      expect(undoWindow.notice()?.text).toBe(doneAnnouncement('Pay the invoice'));
      expect(undoWindow.notice()?.text).toContain(`${UNDO_WINDOW_MS / 1000} seconds`);
    });

    it('does nothing for a Task that is already pending, and keeps its window', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(3_000);
      undoWindow.complete(A, DoneOrigin.Button);

      expect(hold).toHaveBeenCalledTimes(1);
      expect(tick).toHaveBeenCalledTimes(1);
      expect(undoWindow.notice()?.seq).toBe(1);

      await advance(1_999);

      expect(send).not.toHaveBeenCalled();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('numbers every notice with one counter, so identical texts still differ', () => {
      undoWindow.complete(A, DoneOrigin.Button);
      const first = undoWindow.notice();

      undoWindow.undo();
      undoWindow.complete(A, DoneOrigin.Button);
      const second = undoWindow.notice();

      expect(first?.text).toBe(second?.text);
      expect(first?.seq).toBe(1);
      expect(second?.seq).toBe(2);
    });
  });

  describe('the window', () => {
    it('sends nothing before 5_000 ms and sends once with the command and key at 5_000 ms', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(4_999);

      expect(send).not.toHaveBeenCalled();
      expect(undoWindow.pending()).not.toBeNull();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
      expect(undoWindow.pending()).toBeNull();
    });

    it('sends through DataStore.send and not through DataApi', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(runCommand).not.toHaveBeenCalled();
    });

    it('sends the earlier Done at once when another is completed, and gives the new one a full window', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(1_000);
      undoWindow.complete(B, DoneOrigin.Button);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
      expect(hold).toHaveBeenCalledTimes(2);
      expect(hold.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
      expect(hold.mock.calls[1]?.[1]).toBe('key-2');
      expect(undoWindow.pending()).toEqual({
        taskId: 'b',
        title: 'Call Marit',
        kind: 'done',
        status: 'Done',
        undoLabel: 'Undo Done: Call Marit',
        origin: 'button',
        remainingMs: 5_000,
      });
      expect(undoWindow.notice()).toEqual({ text: doneAnnouncement('Call Marit'), seq: 2 });

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
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(2_000);
      undoWindow.undo();

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.pending()).toBeNull();
      expect(undoWindow.undone()).toEqual({ taskId: 'a', kind: 'done', seq: 1 });

      await advance(10_000);

      expect(send).not.toHaveBeenCalled();
      expect(runCommand).not.toHaveBeenCalled();
    });

    it('does nothing when no Done is pending', () => {
      undoWindow.undo();

      expect(release).not.toHaveBeenCalled();
      expect(undoWindow.undone()).toBeNull();
    });

    it('counts undone with its own counter', () => {
      undoWindow.complete(A, DoneOrigin.Button);
      undoWindow.undo();
      undoWindow.complete(B, DoneOrigin.Button);
      undoWindow.undo();

      expect(undoWindow.undone()).toEqual({ taskId: 'b', kind: 'done', seq: 2 });
    });
  });

  describe('pausing', () => {
    it('keeps the remaining time while a pointer rests on the bar', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(1_000);
      undoWindow.pause(PauseReason.Pointer);
      await advance(10_000);

      expect(send).not.toHaveBeenCalled();

      undoWindow.resume(PauseReason.Pointer);
      await advance(3_999);

      expect(send).not.toHaveBeenCalled();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('stays paused until every reason is resumed', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(1_000);
      undoWindow.pause(PauseReason.Pointer);
      undoWindow.pause(PauseReason.Focus);
      undoWindow.resume(PauseReason.Pointer);
      await advance(10_000);

      expect(send).not.toHaveBeenCalled();

      undoWindow.resume(PauseReason.Focus);
      await advance(3_999);

      expect(send).not.toHaveBeenCalled();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('never touches pending, so the ring is left to pause itself and remainingMs stays whole', async () => {
      undoWindow.complete(A, DoneOrigin.Button);

      const before = undoWindow.pending();

      await advance(1_000);
      undoWindow.pause(PauseReason.Pointer);
      undoWindow.pause(PauseReason.Focus);
      await advance(2_000);

      expect(undoWindow.pending()).toBe(before);

      undoWindow.resume(PauseReason.Pointer);
      undoWindow.resume(PauseReason.Focus);
      await advance(500);

      expect(undoWindow.pending()).toBe(before);
      expect(undoWindow.pending()?.remainingMs).toBe(5_000);
    });

    it('treats a reason as a set, so pausing twice and resuming once runs the timer', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      undoWindow.pause(PauseReason.Pointer);
      undoWindow.pause(PauseReason.Pointer);
      undoWindow.resume(PauseReason.Pointer);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('starts a fresh window paused while a reason holds and the bar still shows', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      undoWindow.pause(PauseReason.Pointer);
      undoWindow.complete(B, DoneOrigin.Button);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(10_000);

      expect(send).toHaveBeenCalledTimes(1);

      undoWindow.resume(PauseReason.Pointer);
      await advance(4_999);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(1);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
    });

    it('forgets the reasons after undo, so the next window runs', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      undoWindow.pause(PauseReason.Pointer);
      undoWindow.undo();
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('forgets the reasons after the page goes hidden, so the next window runs', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      undoWindow.pause(PauseReason.Focus);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      setVisibility('visible');
      undoWindow.complete(B, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('b'));
    });

    it('forgets the reasons after a flush, so the next window runs', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      undoWindow.pause(PauseReason.Focus);

      const flushed = undoWindow.flush();

      await resolveSend(0, APPLIED);
      await flushed;
      undoWindow.complete(B, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
    });

    it('forgets the reasons once a failure is dismissed and no bar shows', async () => {
      await sendAWith(FAILED);
      undoWindow.pause(PauseReason.Focus);
      undoWindow.dismiss();
      undoWindow.complete(B, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
    });
  });

  describe('outcomes', () => {
    it('does nothing more for Applied', async () => {
      await sendAWith(APPLIED);

      expect(release).not.toHaveBeenCalled();
      expect(undoWindow.failure()).toBeNull();
      expect(undoWindow.notice()).toEqual({ text: doneAnnouncement('Pay the invoice'), seq: 1 });
    });

    it('forgets the key after Applied, so a later Done of the Task gets a new one', async () => {
      await sendAWith(APPLIED);
      undoWindow.complete(A, DoneOrigin.Button);

      expect(hold.mock.calls[1]?.[1]).toBe('key-2');
    });

    it('releases the key and shows a failure that never times out for Failed', async () => {
      await sendAWith(FAILED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: 'done',
        text: '“Pay the invoice” is not Done.',
        message: 'ASYS cannot reach the server. Try again.',
        canRetry: true,
        closedElsewhere: false,
      });
      expect(undoWindow.notice()).toEqual({
        text: '“Pay the invoice” is not Done. ASYS cannot reach the server. Try again.',
        seq: 2,
      });

      await advance(60_000);

      expect(undoWindow.failure()).not.toBeNull();
    });

    it('holds again with the same key on retry after Failed, with a fresh window', async () => {
      await sendAWith(FAILED);
      undoWindow.retry();

      expect(hold).toHaveBeenCalledTimes(2);
      expect(hold.mock.calls[1]?.[0]).toStrictEqual(completeCommand('a'));
      expect(hold.mock.calls[1]?.[1]).toBe('key-1');
      expect(undoWindow.pending()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: 'done',
        status: 'Done',
        undoLabel: 'Undo Done: Pay the invoice',
        origin: 'button',
        remainingMs: 5_000,
      });
      expect(undoWindow.failure()).toBeNull();

      await advance(4_999);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(1);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[1]).toBe('key-1');
    });

    it('offers a retry with a fresh key for KeyReused', async () => {
      await sendAWith(KEY_REUSED);

      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: 'done',
        text: '“Pay the invoice” is not Done.',
        message: 'Something went wrong. Try again.',
        canRetry: true,
        closedElsewhere: false,
      });

      undoWindow.retry();

      expect(hold.mock.calls[1]?.[1]).toBe('key-2');
    });

    it('offers no retry for Rejected', async () => {
      await sendAWith(REJECTED_NOT_FOUND);

      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: 'done',
        text: '“Pay the invoice” is not Done.',
        message: 'That Task or Area no longer exists.',
        canRetry: false,
        closedElsewhere: false,
      });
      expect(undoWindow.notice()?.text).toBe(
        '“Pay the invoice” is not Done. That Task or Area no longer exists.',
      );
    });

    it('shows the Review-item sentence alone for NotApplicable', async () => {
      await sendAWith(NOT_APPLICABLE);

      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: 'done',
        text: '“Pay the invoice” is not Done.',
        message: REVIEW_SENTENCE,
        canRetry: false,
        closedElsewhere: true,
      });
      expect(undoWindow.notice()?.text).toBe(REVIEW_SENTENCE);
    });

    it('releases the key and shows nothing for SignedOut', async () => {
      await sendAWith(SIGNED_OUT);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()).toBeNull();
      expect(undoWindow.notice()).toEqual({ text: doneAnnouncement('Pay the invoice'), seq: 1 });
    });

    it('ignores retry when the failure cannot be retried', async () => {
      await sendAWith(REJECTED_NOT_FOUND);
      undoWindow.retry();

      expect(hold).toHaveBeenCalledTimes(1);
      expect(undoWindow.pending()).toBeNull();
      expect(undoWindow.failure()).not.toBeNull();
    });

    it('ignores retry after NotApplicable', async () => {
      await sendAWith(NOT_APPLICABLE);
      undoWindow.retry();

      expect(hold).toHaveBeenCalledTimes(1);
      expect(undoWindow.pending()).toBeNull();
    });

    it('ignores retry when there is no failure', () => {
      undoWindow.retry();

      expect(hold).not.toHaveBeenCalled();
      expect(undoWindow.pending()).toBeNull();
    });

    it('clears the failure on dismiss', async () => {
      await sendAWith(FAILED);
      undoWindow.dismiss();

      expect(undoWindow.failure()).toBeNull();
      expect(undoWindow.pending()).toBeNull();
    });

    it('ignores retry after dismiss, because the failed Task is forgotten with the failure', async () => {
      await sendAWith(FAILED);
      undoWindow.dismiss();
      undoWindow.retry();

      expect(hold).toHaveBeenCalledTimes(1);
      expect(undoWindow.pending()).toBeNull();
      expect(undoWindow.failure()).toBeNull();
    });

    it('clears the failure when another Task is completed', async () => {
      await sendAWith(FAILED);
      undoWindow.complete(B, DoneOrigin.Button);

      expect(undoWindow.failure()).toBeNull();
      expect(undoWindow.pending()?.taskId).toBe('b');
    });
  });

  describe('a failure that arrives while another Done is pending', () => {
    /** A is sent when B is completed at 1_000 ms, and A fails at 3_000 ms, leaving B 3_000 ms. */
    const failAWhileBIsPending = async (): Promise<void> => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(1_000);
      undoWindow.complete(B, DoneOrigin.Button);
      await advance(2_000);
      await resolveSend(0, FAILED);
    };

    it('stops the timer of the pending Done until dismiss, then runs the time it had left', async () => {
      await failAWhileBIsPending();

      expect(undoWindow.failure()?.taskId).toBe('a');
      expect(undoWindow.pending()?.taskId).toBe('b');

      await advance(100_000);

      expect(send).toHaveBeenCalledTimes(1);

      undoWindow.dismiss();
      await advance(2_999);

      expect(send).toHaveBeenCalledTimes(1);

      await advance(1);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
      expect(send.mock.calls[1]?.[1]).toBe('key-2');
    });

    it('sets pending again with the time left when dismiss lets the displaced Done run again', async () => {
      await failAWhileBIsPending();

      expect(undoWindow.pending()?.remainingMs).toBe(5_000);

      undoWindow.dismiss();

      expect(undoWindow.pending()).toEqual({
        taskId: 'b',
        title: 'Call Marit',
        kind: 'done',
        status: 'Done',
        undoLabel: 'Undo Done: Call Marit',
        origin: 'button',
        remainingMs: 3_000,
      });
    });

    it.each([
      { elapsed: 500, left: 4_500 },
      { elapsed: 4_000, left: 1_000 },
    ])(
      'restarts the ring with $left ms after $elapsed ms of the window were used up',
      async ({ elapsed, left }) => {
        undoWindow.complete(A, DoneOrigin.Button);
        undoWindow.complete(B, DoneOrigin.Button);
        await advance(elapsed);
        await resolveSend(0, FAILED);
        undoWindow.dismiss();

        expect(undoWindow.pending()?.remainingMs).toBe(left);

        await advance(left - 1);

        expect(send).toHaveBeenCalledTimes(1);

        await advance(1);

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
      },
    );

    it('does not restart the timer when a pause reason is resumed during the displacement', async () => {
      await failAWhileBIsPending();
      undoWindow.pause(PauseReason.Focus);
      undoWindow.resume(PauseReason.Focus);
      await advance(100_000);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('does not run the timer after dismiss while a pause reason holds', async () => {
      await failAWhileBIsPending();
      undoWindow.pause(PauseReason.Pointer);
      undoWindow.dismiss();
      await advance(100_000);

      expect(send).toHaveBeenCalledTimes(1);

      undoWindow.resume(PauseReason.Pointer);
      await advance(3_000);

      expect(send).toHaveBeenCalledTimes(2);
    });

    it('ends the displacement on retry, which sends the pending Done at once and holds the failed Task again', async () => {
      await failAWhileBIsPending();
      undoWindow.retry();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(completeCommand('b'));
      expect(hold).toHaveBeenCalledTimes(3);
      expect(hold.mock.calls[2]?.[0]).toStrictEqual(completeCommand('a'));
      expect(hold.mock.calls[2]?.[1]).toBe('key-1');
      expect(undoWindow.pending()?.taskId).toBe('a');
      expect(undoWindow.pending()?.remainingMs).toBe(5_000);
      expect(undoWindow.failure()).toBeNull();
    });
  });

  describe('when the page goes away', () => {
    it('sends a pending Done through DataApi with keepalive on visibilitychange to hidden', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(runCommand.mock.calls[0]?.[1]).toBe('key-1');
      expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
      expect(send).not.toHaveBeenCalled();
      expect(undoWindow.pending()).toBeNull();

      window.dispatchEvent(new Event('pagehide'));
      await advance(10_000);

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
    });

    it('does not send on visibilitychange while the page is visible', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(runCommand).not.toHaveBeenCalled();
      expect(undoWindow.pending()?.taskId).toBe('a');

      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('releases the Task and shows the failure when the keepalive send fails', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await resolveRun(0, FAILED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: 'done',
        text: '“Pay the invoice” is not Done.',
        message: 'ASYS cannot reach the server. Try again.',
        canRetry: true,
        closedElsewhere: false,
      });

      undoWindow.retry();

      expect(hold.mock.calls[1]?.[1]).toBe('key-1');
    });

    it('settles the key when the keepalive send is Applied', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await resolveRun(0, APPLIED);

      expect(release).not.toHaveBeenCalled();
      expect(undoWindow.failure()).toBeNull();
      expect(attempts.keyFor(completeCommand('a'))).toBe('key-2');
    });

    it('sends a pending Done on pagehide alone', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(runCommand.mock.calls[0]?.[1]).toBe('key-1');
      expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
      expect(send).not.toHaveBeenCalled();
      expect(undoWindow.pending()).toBeNull();

      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await advance(10_000);

      expect(runCommand).toHaveBeenCalledTimes(1);
    });

    it('releases the Task and shows the failure when the pagehide send fails', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      window.dispatchEvent(new Event('pagehide'));
      await resolveRun(0, FAILED);

      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()?.taskId).toBe('a');
    });

    it('sends nothing with nothing pending', () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing for a Done that was undone', () => {
      undoWindow.complete(A, DoneOrigin.Button);
      undoWindow.undo();
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).not.toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('sends a pending Done at once and resolves after its outcome is handled', async () => {
      let resolved = false;

      undoWindow.complete(A, DoneOrigin.Button);
      const flushed = undoWindow.flush().then(() => {
        resolved = true;
      });

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
      expect(undoWindow.pending()).toBeNull();

      await advance(0);

      expect(resolved).toBe(false);

      await resolveSend(0, FAILED);
      await flushed;

      expect(resolved).toBe(true);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()?.taskId).toBe('a');
    });

    it('waits for a send that is already in flight', async () => {
      let resolved = false;

      undoWindow.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      const flushed = undoWindow.flush().then(() => {
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

      undoWindow.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      undoWindow.complete(B, DoneOrigin.Button);
      const flushed = undoWindow.flush().then(() => {
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
      const flushed = undoWindow.flush().then(() => {
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
      undoWindow.requestFocus();

      expect(undoWindow.focusRequest()).toBe(1);

      undoWindow.requestFocus();

      expect(undoWindow.focusRequest()).toBe(2);
    });
  });

  describe('when the service is destroyed', () => {
    it('sends nothing on later visibilitychange or pagehide', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
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
      undoWindow.complete(B, DoneOrigin.Button);
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
      undoWindow.complete(A, DoneOrigin.Button);
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
      undoWindow.complete(A, DoneOrigin.Button);
      TestBed.resetTestingModule();
      await resolveRun(0, FAILED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(undoWindow.failure()).toBeNull();
    });

    it('sends nothing with nothing held', async () => {
      TestBed.resetTestingModule();
      await advance(10_000);

      expect(runCommand).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
    });

    it('sends nothing for a Done that was undone', () => {
      undoWindow.complete(A, DoneOrigin.Button);
      undoWindow.undo();
      TestBed.resetTestingModule();

      expect(runCommand).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledTimes(1);
    });

    it('still releases and settles the key for a send in flight, and sets no signal', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      TestBed.resetTestingModule();

      expect(runCommand).not.toHaveBeenCalled();

      await resolveSend(0, KEY_REUSED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()).toBeNull();
      expect(attempts.keyFor(completeCommand('a'))).toBe('key-2');
    });

    it('still releases the key when a send in flight fails', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      TestBed.resetTestingModule();
      await resolveSend(0, FAILED);

      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.failure()).toBeNull();
    });

    it('does not release the key when a send in flight is Applied', async () => {
      undoWindow.complete(A, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);
      TestBed.resetTestingModule();
      await resolveSend(0, APPLIED);

      expect(release).not.toHaveBeenCalled();
    });
  });

  describe('waiting for the flushed edit', () => {
    /** A promise the test settles by hand, standing for the editor's `saver.idle()`. */
    const gate = () => {
      let resolve!: () => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });

      return { promise, resolve, reject };
    };

    it('sends the held Done only after `after` has settled, once its window has ended', async () => {
      const after = gate();

      undoWindow.complete(A, DoneOrigin.Button, after.promise);
      await advance(UNDO_WINDOW_MS);

      expect(send).not.toHaveBeenCalled();
      expect(undoWindow.pending()).toBeNull();

      after.resolve();
      await advance(0);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
      expect(runCommand).not.toHaveBeenCalled();
    });

    it('sends at the end of the window without waiting when `after` has already settled', async () => {
      undoWindow.complete(A, DoneOrigin.Button, Promise.resolve());
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('treats a rejected `after` as settled and sends anyway', async () => {
      const after = gate();

      undoWindow.complete(A, DoneOrigin.Button, after.promise);
      await advance(UNDO_WINDOW_MS);

      expect(send).not.toHaveBeenCalled();

      after.reject(new Error('the edit failed'));
      await advance(0);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
    });

    it('does not wait for `after` when the page is hidden', async () => {
      const after = gate();

      undoWindow.complete(A, DoneOrigin.Button, after.promise);
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
      expect(send).not.toHaveBeenCalled();
    });

    it('does not wait for `after` on pagehide', () => {
      const after = gate();

      undoWindow.complete(A, DoneOrigin.Button, after.promise);
      window.dispatchEvent(new Event('pagehide'));

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing for an Undo while `after` is pending, even once it settles', async () => {
      const after = gate();

      undoWindow.complete(A, DoneOrigin.Button, after.promise);
      await advance(1_000);
      undoWindow.undo();
      after.resolve();
      await advance(UNDO_WINDOW_MS);

      expect(send).not.toHaveBeenCalled();
      expect(runCommand).not.toHaveBeenCalled();
      expect(release).toHaveBeenCalledWith('key-1');
    });

    it('sends the earlier Done at once for a second Done, and it still awaits its own `after`', async () => {
      const afterA = gate();

      undoWindow.complete(A, DoneOrigin.Button, afterA.promise);
      await advance(1_000);
      undoWindow.complete(B, DoneOrigin.Button);
      await advance(0);

      expect(send).not.toHaveBeenCalled();
      expect(undoWindow.pending()?.taskId).toBe('b');

      afterA.resolve();
      await advance(0);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
    });

    it("does not make a later Done wait for the earlier one's `after`", async () => {
      const afterA = gate();

      undoWindow.complete(A, DoneOrigin.Button, afterA.promise);
      undoWindow.complete(B, DoneOrigin.Button);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('b'));
    });

    describe('a Done that waits for `after` when the page goes away', () => {
      /** A is completed with a pending `after` and its window has ended, so it waits outside the Undo slot. */
      const waitingA = async () => {
        const after = gate();

        undoWindow.complete(A, DoneOrigin.Button, after.promise);
        await advance(UNDO_WINDOW_MS);

        expect(send).not.toHaveBeenCalled();
        expect(runCommand).not.toHaveBeenCalled();

        return after;
      };

      const callsFor = (taskId: string) =>
        runCommand.mock.calls.filter(
          ([command]) => command._tag === CommandTag.CompleteTask && command.taskId === taskId,
        );

      it('sends it with keepalive on visibilitychange to hidden, and skips the normal send', async () => {
        const after = await waitingA();

        setVisibility('hidden');
        document.dispatchEvent(new Event('visibilitychange'));

        expect(runCommand).toHaveBeenCalledTimes(1);
        expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
        expect(runCommand.mock.calls[0]?.[1]).toBe('key-1');
        expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });

        after.resolve();
        await advance(0);

        expect(send).not.toHaveBeenCalled();
        expect(runCommand).toHaveBeenCalledTimes(1);
      });

      it('sends it with keepalive on pagehide, and skips the normal send', async () => {
        const after = await waitingA();

        window.dispatchEvent(new Event('pagehide'));

        expect(runCommand).toHaveBeenCalledTimes(1);
        expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
        expect(runCommand.mock.calls[0]?.[1]).toBe('key-1');
        expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });

        after.resolve();
        await advance(0);

        expect(send).not.toHaveBeenCalled();
        expect(runCommand).toHaveBeenCalledTimes(1);
      });

      it('sends it only once when both visibilitychange and pagehide fire', async () => {
        const after = await waitingA();

        setVisibility('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('pagehide'));
        after.resolve();
        await advance(0);

        expect(callsFor('a')).toHaveLength(1);
        expect(send).not.toHaveBeenCalled();
      });

      it('sends it with keepalive and releases it once when the service is destroyed', async () => {
        const after = await waitingA();

        TestBed.resetTestingModule();

        expect(runCommand).toHaveBeenCalledTimes(1);
        expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(completeCommand('a'));
        expect(runCommand.mock.calls[0]?.[1]).toBe('key-1');
        expect(runCommand.mock.calls[0]?.[2]).toStrictEqual({ keepalive: true });
        expect(release).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledWith('key-1');

        after.resolve();
        await advance(0);

        expect(send).not.toHaveBeenCalled();
        expect(runCommand).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
      });

      it('sends both a waiting Done and the Done that displaced it, each once with keepalive', async () => {
        const afterA = gate();

        undoWindow.complete(A, DoneOrigin.Button, afterA.promise);
        undoWindow.complete(B, DoneOrigin.Button);

        expect(send).not.toHaveBeenCalled();

        setVisibility('hidden');
        document.dispatchEvent(new Event('visibilitychange'));

        expect(runCommand).toHaveBeenCalledTimes(2);
        expect(callsFor('a')).toHaveLength(1);
        expect(callsFor('a')[0]?.[1]).toBe('key-1');
        expect(callsFor('a')[0]?.[2]).toStrictEqual({ keepalive: true });
        expect(callsFor('b')).toHaveLength(1);
        expect(callsFor('b')[0]?.[1]).toBe('key-2');
        expect(callsFor('b')[0]?.[2]).toStrictEqual({ keepalive: true });

        afterA.resolve();
        await advance(0);

        expect(send).not.toHaveBeenCalled();
        expect(runCommand).toHaveBeenCalledTimes(2);
      });

      it('does nothing more when the keepalive send is Applied, and settles the key', async () => {
        const after = await waitingA();

        window.dispatchEvent(new Event('pagehide'));
        await resolveRun(0, APPLIED);
        after.resolve();
        await advance(0);

        expect(release).not.toHaveBeenCalled();
        expect(undoWindow.failure()).toBeNull();
        expect(attempts.keyFor(completeCommand('a'))).toBe('key-2');
        expect(send).not.toHaveBeenCalled();
      });

      it('releases the Task and shows the failure when the keepalive send fails', async () => {
        const after = await waitingA();

        window.dispatchEvent(new Event('pagehide'));
        await resolveRun(0, FAILED);

        expect(release).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledWith('key-1');
        expect(undoWindow.failure()).toEqual({
          taskId: 'a',
          title: 'Pay the invoice',
          kind: 'done',
          text: '“Pay the invoice” is not Done.',
          message: 'ASYS cannot reach the server. Try again.',
          canRetry: true,
          closedElsewhere: false,
        });

        after.resolve();
        await advance(0);

        expect(send).not.toHaveBeenCalled();
      });

      it('still sends a Done that was held without `after` at once', async () => {
        undoWindow.complete(A, DoneOrigin.Button);
        await advance(UNDO_WINDOW_MS);

        expect(send).toHaveBeenCalledTimes(1);
        expect(runCommand).not.toHaveBeenCalled();

        window.dispatchEvent(new Event('pagehide'));

        expect(runCommand).not.toHaveBeenCalled();
      });

      it('lets flush resolve only once the converted keepalive send has been handled', async () => {
        let resolved = false;
        const after = await waitingA();
        const flushed = undoWindow.flush().then(() => {
          resolved = true;
        });

        await advance(0);

        expect(resolved).toBe(false);

        window.dispatchEvent(new Event('pagehide'));
        await advance(0);

        expect(runCommand).toHaveBeenCalledTimes(1);
        expect(resolved).toBe(false);

        await resolveRun(0, APPLIED);
        await flushed;

        expect(resolved).toBe(true);
        expect(send).not.toHaveBeenCalled();

        after.resolve();
        await advance(0);

        expect(send).not.toHaveBeenCalled();
      });
    });
  });

  describe('triage', () => {
    it('holds the command with its key, shows the status, label and announcement, and ticks', () => {
      const command = triageCommand('a');

      undoWindow.triage(A, command, 'Plan');

      expect(hold).toHaveBeenCalledTimes(1);
      expect(hold.mock.calls[0]?.[0]).toBe(command);
      expect(hold.mock.calls[0]?.[1]).toBe('key-1');
      expect(undoWindow.pending()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: UndoKind.Triage,
        status: 'Triaged as Plan',
        undoLabel: 'Undo Triage: Pay the invoice',
        origin: 'button',
        remainingMs: 5_000,
      });
      expect(undoWindow.notice()).toEqual({
        text: '“Pay the invoice” is triaged as Plan. Undo is available for 5 seconds.',
        seq: 1,
      });
      expect(tick).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
    });

    it('sends the command with its key when the window ends', async () => {
      const command = triageCommand('a');

      undoWindow.triage(A, command, 'Plan');
      await advance(4_999);

      expect(send).not.toHaveBeenCalled();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toBe(command);
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
      expect(undoWindow.pending()).toBeNull();
    });

    it('is ignored while a Triage of the Task is already held', () => {
      undoWindow.triage(A, triageCommand('a'), 'Plan');
      undoWindow.triage(A, triageCommand('a'), 'Do');

      expect(hold).toHaveBeenCalledTimes(1);
      expect(undoWindow.pending()?.status).toBe('Triaged as Plan');
    });

    it('is sent at once when a Done of the same Task follows, which is then held', () => {
      const command = triageCommand('a');

      undoWindow.triage(A, command, 'Plan');
      undoWindow.complete(A, DoneOrigin.Button);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toBe(command);
      expect(hold).toHaveBeenCalledTimes(2);
      expect(undoWindow.pending()).toMatchObject({ taskId: 'a', kind: UndoKind.Done });
    });

    it('is sent at once when a Drop of the same Task follows, which is then held', () => {
      const command = triageCommand('a');

      undoWindow.triage(A, command, 'Plan');
      undoWindow.drop(A);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toBe(command);
      expect(undoWindow.pending()).toMatchObject({ taskId: 'a', kind: UndoKind.Drop });
    });

    it('undo releases the key and reports the kind, and nothing is sent', async () => {
      undoWindow.triage(A, triageCommand('a'), 'Plan');
      undoWindow.undo();

      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.pending()).toBeNull();
      expect(undoWindow.undone()).toEqual({ taskId: 'a', kind: UndoKind.Triage, seq: 1 });

      await advance(10_000);

      expect(send).not.toHaveBeenCalled();
    });

    it('says the Task is not triaged when the send fails, and retries the same command with the same word', async () => {
      const command = triageCommand('a');

      undoWindow.triage(A, command, 'Plan');
      await advance(UNDO_WINDOW_MS);
      await resolveSend(0, FAILED);

      expect(undoWindow.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: UndoKind.Triage,
        text: '“Pay the invoice” is not triaged.',
        message: 'ASYS cannot reach the server. Try again.',
        canRetry: true,
        closedElsewhere: false,
      });
      expect(undoWindow.notice()?.text).toBe(
        '“Pay the invoice” is not triaged. ASYS cannot reach the server. Try again.',
      );

      undoWindow.retry();

      expect(hold).toHaveBeenCalledTimes(2);
      expect(hold.mock.calls[1]?.[0]).toBe(command);
      expect(hold.mock.calls[1]?.[1]).toBe('key-1');
      expect(undoWindow.pending()).toMatchObject({
        kind: UndoKind.Triage,
        status: 'Triaged as Plan',
        undoLabel: 'Undo Triage: Pay the invoice',
      });
    });

    it('shows the Review-item sentence alone when it was closed elsewhere', async () => {
      undoWindow.triage(A, triageCommand('a'), 'Plan');
      await advance(UNDO_WINDOW_MS);
      await resolveSend(0, NOT_APPLICABLE);

      expect(undoWindow.failure()?.text).toBe('“Pay the invoice” is not triaged.');
      expect(undoWindow.failure()?.closedElsewhere).toBe(true);
      expect(undoWindow.notice()?.text).toBe(REVIEW_SENTENCE);
    });

    it('sends an earlier Done at once when it is held, and is sent at once when a Done follows', async () => {
      undoWindow.complete(B, DoneOrigin.Button);
      undoWindow.triage(A, triageCommand('a'), 'Plan');

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(completeCommand('b'));

      undoWindow.complete(B, DoneOrigin.Button);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(triageCommand('a'));
      expect(send.mock.calls[1]?.[1]).toBe('key-2');
    });

    it('goes out at once with keepalive when the page is hidden', async () => {
      undoWindow.triage(A, triageCommand('a'), 'Plan');
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await advance(0);

      expect(runCommand).toHaveBeenCalledTimes(1);
      expect(runCommand.mock.calls[0]?.[0]).toStrictEqual(triageCommand('a'));
      expect(runCommand.mock.calls[0]?.[2]).toEqual({ keepalive: true });
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('drop', () => {
    it('holds a DropTask with the first key, shows the status, label and announcement, and ticks', () => {
      undoWindow.drop(A);

      expect(hold).toHaveBeenCalledTimes(1);
      expect(hold.mock.calls[0]?.[0]).toStrictEqual(dropCommand('a'));
      expect(hold.mock.calls[0]?.[1]).toBe('key-1');
      expect(undoWindow.pending()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: UndoKind.Drop,
        status: 'Dropped',
        undoLabel: 'Undo Drop: Pay the invoice',
        origin: 'button',
        remainingMs: 5_000,
      });
      expect(undoWindow.notice()).toEqual({
        text: '“Pay the invoice” is dropped. Undo is available for 5 seconds.',
        seq: 1,
      });
      expect(tick).toHaveBeenCalledTimes(1);
    });

    it('sends the command with its key when the window ends', async () => {
      undoWindow.drop(A);
      await advance(UNDO_WINDOW_MS);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(dropCommand('a'));
      expect(send.mock.calls[0]?.[1]).toBe('key-1');
    });

    it('sends an earlier Drop at once when another Task is dropped', async () => {
      undoWindow.drop(A);
      await advance(1_000);
      undoWindow.drop(B);

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(dropCommand('a'));
      expect(undoWindow.pending()?.taskId).toBe('b');
      expect(undoWindow.pending()?.remainingMs).toBe(5_000);
    });

    it('undo releases the key and reports the kind, and nothing is sent', async () => {
      undoWindow.drop(A);
      undoWindow.undo();

      expect(release).toHaveBeenCalledWith('key-1');
      expect(undoWindow.undone()).toEqual({ taskId: 'a', kind: UndoKind.Drop, seq: 1 });

      await advance(10_000);

      expect(send).not.toHaveBeenCalled();
    });

    it('says the Task is not dropped when the send fails, and retries with a Drop of the same Task', async () => {
      undoWindow.drop(A);
      await advance(UNDO_WINDOW_MS);
      await resolveSend(0, FAILED);

      expect(undoWindow.failure()).toEqual({
        taskId: 'a',
        title: 'Pay the invoice',
        kind: UndoKind.Drop,
        text: '“Pay the invoice” is not dropped.',
        message: 'ASYS cannot reach the server. Try again.',
        canRetry: true,
        closedElsewhere: false,
      });
      expect(undoWindow.notice()?.text).toBe(
        '“Pay the invoice” is not dropped. ASYS cannot reach the server. Try again.',
      );

      undoWindow.retry();

      expect(hold).toHaveBeenCalledTimes(2);
      expect(hold.mock.calls[1]?.[0]).toStrictEqual(dropCommand('a'));
      expect(undoWindow.pending()).toMatchObject({
        kind: UndoKind.Drop,
        status: 'Dropped',
        undoLabel: 'Undo Drop: Pay the invoice',
      });
    });

    it('pauses and resumes its window like a Done', async () => {
      undoWindow.drop(A);
      await advance(2_000);
      undoWindow.pause(PauseReason.Pointer);
      await advance(10_000);

      expect(send).not.toHaveBeenCalled();

      undoWindow.resume(PauseReason.Pointer);
      await advance(2_999);

      expect(send).not.toHaveBeenCalled();

      await advance(1);

      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('Done copy', () => {
    it('says Done, labels the button with the Task and counts the kind', () => {
      undoWindow.complete(A, DoneOrigin.Button);

      expect(undoWindow.pending()).toMatchObject({
        kind: UndoKind.Done,
        status: 'Done',
        undoLabel: 'Undo Done: Pay the invoice',
      });

      undoWindow.undo();

      expect(undoWindow.undone()).toEqual({ taskId: 'a', kind: UndoKind.Done, seq: 1 });
    });
  });
});
