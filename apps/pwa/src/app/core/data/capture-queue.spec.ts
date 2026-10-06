// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { CommandTag, RejectedReason, type Command } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../api/data-api';
import { Ids } from '../platform/ids';
import { CaptureQueue } from './capture-queue';
import { CommandAttempts } from './command-attempts';
import { DataStore } from './data-store';

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const KEY_REUSED: CommandOutcome = { _tag: CommandOutcomeTag.KeyReused };

const REJECTED: CommandOutcome = {
  _tag: CommandOutcomeTag.Rejected,
  reason: RejectedReason.InvalidTitle,
};

const NOT_APPLICABLE = {
  _tag: CommandOutcomeTag.NotApplicable,
  reason: 'x',
  reviewItemId: 'r',
} as unknown as CommandOutcome;

const SIGNED_OUT: CommandOutcome = { _tag: CommandOutcomeTag.SignedOut };

const captureCommand = (taskId: string, title: string): Command => ({
  _tag: CommandTag.CaptureTask,
  taskId,
  title,
  captureText: title,
});

/** Lets every promise continuation that is already queued run. */
const flush = async (): Promise<void> => {
  for (let round = 0; round < 10; round += 1) {
    await Promise.resolve();
  }
};

describe('CaptureQueue', () => {
  let queue: CaptureQueue;
  let send: ReturnType<typeof vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>>;
  let resolvers: ((outcome: CommandOutcome) => void)[];

  /** Resolves the oldest send that is still unresolved. */
  const resolveNext = async (outcome: CommandOutcome): Promise<void> => {
    const resolve = resolvers.shift();

    if (resolve === undefined) {
      throw new Error('No send is pending');
    }

    resolve(outcome);
    await flush();
  };

  beforeEach(() => {
    let counter = 0;

    resolvers = [];
    send = vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>();
    send.mockImplementation(
      () =>
        new Promise<CommandOutcome>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    TestBed.configureTestingModule({
      providers: [
        CaptureQueue,
        CommandAttempts,
        { provide: DataStore, useValue: { send } },
        {
          provide: Ids,
          useValue: {
            next: () => {
              counter += 1;

              return `id-${counter}`;
            },
          },
        },
      ],
    });
    queue = TestBed.inject(CaptureQueue);
  });

  it('starts with no rows and no message', () => {
    expect(queue.failed()).toEqual([]);
    expect(queue.message()).toBeNull();
  });

  it('is not provided unless a screen provides it', () => {
    TestBed.resetTestingModule();

    expect(() => TestBed.inject(CaptureQueue)).toThrow();
  });

  it('sends a CaptureTask with the first id as taskId and the next as key', async () => {
    queue.submit('Buy milk');
    await flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
    expect(send.mock.calls[0]?.[1]).toBe('id-2');
  });

  it('sets the message and adds no row on Applied', async () => {
    queue.submit('Buy milk');
    await flush();
    await resolveNext(APPLIED);

    expect(queue.message()).toBe('Captured. It waits in the Inbox.');
    expect(queue.failed()).toEqual([]);
  });

  it('sends a second submit only after the first resolved, in order', async () => {
    queue.submit('Buy milk');
    await flush();
    queue.submit('Buy bread');
    await flush();

    expect(send).toHaveBeenCalledTimes(1);

    await resolveNext(APPLIED);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
    expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy bread'));
    expect(send.mock.calls[1]?.[1]).toBe('id-4');
  });

  it('sends the next capture after a failed one without waiting for a retry', async () => {
    queue.submit('Buy milk');
    await flush();
    queue.submit('Buy bread');
    await flush();
    await resolveNext(FAILED);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy bread'));
  });

  describe('outcomes', () => {
    it('keeps a Failed capture as a retryable row with the outcome message', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);

      expect(queue.failed()).toEqual([
        {
          id: 'id-1',
          text: 'Buy milk',
          message: 'ASYS cannot reach the server. Try again.',
          canRetry: true,
        },
      ]);
    });

    it('keeps a KeyReused capture as a retryable row with the generic message', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(KEY_REUSED);

      expect(queue.failed()).toEqual([
        {
          id: 'id-1',
          text: 'Buy milk',
          message: 'Something went wrong. Try again.',
          canRetry: true,
        },
      ]);
    });

    it('keeps a Rejected capture as a row that cannot be retried', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(REJECTED);

      expect(queue.failed()).toEqual([
        { id: 'id-1', text: 'Buy milk', message: 'Enter a title.', canRetry: false },
      ]);
    });

    it('keeps a NotApplicable capture as a row that cannot be retried', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(NOT_APPLICABLE);

      expect(queue.failed()).toEqual([
        {
          id: 'id-1',
          text: 'Buy milk',
          message: 'That no longer applied, so it waits in the Inbox as a Review item.',
          canRetry: false,
        },
      ]);
    });

    it('keeps the rows in the order they appeared', async () => {
      queue.submit('Buy milk');
      await flush();
      queue.submit('Buy bread');
      await flush();
      await resolveNext(FAILED);
      await resolveNext(REJECTED);

      expect(queue.failed().map((row) => row.text)).toEqual(['Buy milk', 'Buy bread']);
    });

    it('leaves existing rows in place when a later capture is Applied', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);
      queue.submit('Buy bread');
      await flush();
      await resolveNext(APPLIED);

      expect(queue.failed().map((row) => row.text)).toEqual(['Buy milk']);
      expect(queue.message()).toBe('Captured. It waits in the Inbox.');
    });
  });

  describe('SignedOut', () => {
    it('adds no row and no message', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(SIGNED_OUT);

      expect(queue.failed()).toEqual([]);
      expect(queue.message()).toBeNull();
    });

    it('drops the rows and the captures still waiting', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);
      queue.submit('Buy bread');
      await flush();
      queue.submit('Buy eggs');
      await flush();

      expect(queue.failed()).toHaveLength(1);

      await resolveNext(SIGNED_OUT);
      await flush();

      expect(queue.failed()).toEqual([]);
      expect(queue.message()).toBeNull();
      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry', () => {
    it('after Failed sends the same command with the same key and removes the row', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);

      queue.retry('id-1');
      await flush();

      expect(queue.failed()).toEqual([]);
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
      expect(send.mock.calls[1]?.[1]).toBe('id-2');
    });

    it('after KeyReused sends a copy with a new taskId and a new key', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(KEY_REUSED);

      queue.retry('id-1');
      await flush();

      expect(queue.failed()).toEqual([]);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy milk'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });

    it('leaves no row when the retry is Applied and says it is captured', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);
      queue.retry('id-1');
      await flush();
      await resolveNext(APPLIED);

      expect(queue.failed()).toEqual([]);
      expect(queue.message()).toBe('Captured. It waits in the Inbox.');
    });

    it('brings the row back when the retry fails again', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);
      queue.retry('id-1');
      await flush();
      await resolveNext(FAILED);

      expect(queue.failed().map((row) => row.id)).toEqual(['id-1']);
    });

    it('goes to the back of the queue behind captures that are waiting', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);
      queue.submit('Buy bread');
      await flush();

      queue.retry('id-1');
      await flush();

      expect(send).toHaveBeenCalledTimes(2);

      await resolveNext(APPLIED);

      expect(send).toHaveBeenCalledTimes(3);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy bread'));
      expect(send.mock.calls[2]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
    });

    it('does not reuse the key of another capture with the same text', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);
      queue.submit('Buy milk');
      await flush();
      await resolveNext(APPLIED);

      queue.retry('id-1');
      await flush();

      expect(send.mock.calls[2]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
      expect(send.mock.calls[2]?.[1]).toBe('id-2');
    });
  });

  describe('discard', () => {
    it('removes the row and sends nothing', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(REJECTED);

      queue.discard('id-1');
      await flush();

      expect(queue.failed()).toEqual([]);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('removes only the row with that id', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);
      queue.submit('Buy bread');
      await flush();
      await resolveNext(FAILED);

      queue.discard('id-1');

      expect(queue.failed().map((row) => row.text)).toEqual(['Buy bread']);
    });

    it('does nothing for an unknown id', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);

      queue.discard('nope');

      expect(queue.failed().map((row) => row.id)).toEqual(['id-1']);
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('drain', () => {
    it('resolves at once when idle', async () => {
      await expect(queue.drain()).resolves.toBeUndefined();
    });

    it('resolves at once when only rows are left', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(FAILED);

      await expect(queue.drain()).resolves.toBeUndefined();
    });

    it('waits for the send in flight and the captures queued behind it', async () => {
      let drained = false;

      queue.submit('Buy milk');
      await flush();
      queue.submit('Buy bread');
      await flush();
      void queue.drain().then(() => {
        drained = true;
      });
      await flush();

      expect(drained).toBe(false);

      await resolveNext(APPLIED);

      expect(drained).toBe(false);

      await resolveNext(APPLIED);

      expect(drained).toBe(true);
    });
  });

  describe('clearMessage', () => {
    it('sets the message to null', async () => {
      queue.submit('Buy milk');
      await flush();
      await resolveNext(APPLIED);

      queue.clearMessage();

      expect(queue.message()).toBeNull();
    });
  });
});
