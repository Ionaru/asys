// SPDX-License-Identifier: EUPL-1.2
import { computed, inject, type Signal, Service, signal } from '@angular/core';
import { CommandTag, type Command } from '@asys/domain';

import { CommandOutcomeTag, isRetryable } from '../api/data-api';
import { Ids } from '../platform/ids';
import { CommandAttempts } from './command-attempts';
import { outcomeMessage } from './outcome-message';

type CaptureCommand = Extract<Command, { readonly _tag: CommandTag.CaptureTask }>;

/** A capture that was not sent, shown as a row with its reason. */
export interface FailedCapture {
  readonly id: string;
  readonly text: string;
  readonly message: string | null;
  readonly canRetry: boolean;
}

interface FailedEntry {
  readonly command: CaptureCommand;
  readonly outcomeTag: CommandOutcomeTag;
  readonly capture: FailedCapture;
}

const CAPTURED = 'Captured. It waits in the Inbox.';

/**
 * Sends captures one at a time, in the order submitted, and keeps the ones that did not go through
 * as rows. Provide it in the shell: `providers: [CaptureQueue]`.
 */
@Service({ autoProvided: false })
export class CaptureQueue {
  readonly #attempts = inject(CommandAttempts);

  readonly #ids = inject(Ids);

  readonly #waiting: CaptureCommand[] = [];

  readonly #entries = signal<readonly FailedEntry[]>([]);

  readonly #idleWaiters: (() => void)[] = [];

  #running = false;

  readonly #statusMessage = signal<string | null>(null);

  readonly failed: Signal<readonly FailedCapture[]> = computed(() =>
    this.#entries().map((entry) => entry.capture),
  );

  readonly message: Signal<string | null> = this.#statusMessage.asReadonly();

  /** Queues a capture of this (already trimmed) text. */
  submit(text: string): void {
    this.#enqueue({
      _tag: CommandTag.CaptureTask,
      taskId: this.#ids.next(),
      title: text,
      captureText: text,
    });
  }

  /** Queues the failed capture again: the same command after Failed, a fresh one after KeyReused. */
  retry(id: string): void {
    const entry = this.#entries().find((candidate) => candidate.capture.id === id);

    if (entry === undefined || !entry.capture.canRetry) {
      return;
    }

    this.#remove(id);

    if (entry.outcomeTag === CommandOutcomeTag.KeyReused) {
      this.#enqueue({ ...entry.command, taskId: this.#ids.next() });
    } else {
      this.#enqueue(entry.command);
    }
  }

  /** Drops the failed capture without sending anything. */
  discard(id: string): void {
    this.#remove(id);
  }

  /** Resolves once nothing is queued or in flight. */
  drain(): Promise<void> {
    if (!this.#running && this.#waiting.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.#idleWaiters.push(resolve);
    });
  }

  clearMessage(): void {
    this.#statusMessage.set(null);
  }

  #enqueue(command: CaptureCommand): void {
    this.#waiting.push(command);

    if (!this.#running) {
      void this.#run();
    }
  }

  #remove(id: string): void {
    this.#entries.update((entries) => entries.filter((entry) => entry.capture.id !== id));
  }

  #addFailure(
    command: CaptureCommand,
    outcomeTag: CommandOutcomeTag,
    message: string | null,
  ): void {
    const capture: FailedCapture = {
      id: command.taskId,
      text: command.title,
      message,
      canRetry: isRetryable(outcomeTag),
    };

    this.#entries.update((entries) => [...entries, { command, outcomeTag, capture }]);
  }

  async #run(): Promise<void> {
    this.#running = true;

    try {
      for (
        let command = this.#waiting.shift();
        command !== undefined;
        command = this.#waiting.shift()
      ) {
        const outcome = await this.#attempts.send(command);

        if (outcome._tag === CommandOutcomeTag.Applied) {
          this.#statusMessage.set(CAPTURED);
        } else if (outcome._tag === CommandOutcomeTag.SignedOut) {
          this.#waiting.length = 0;
          this.#entries.set([]);
          this.#statusMessage.set(null);
        } else {
          const message = outcomeMessage(outcome);

          this.#statusMessage.set(message);
          this.#addFailure(command, outcome._tag, message);
        }
      }
    } finally {
      this.#running = false;

      for (const resolve of this.#idleWaiters.splice(0)) {
        resolve();
      }
    }
  }
}
