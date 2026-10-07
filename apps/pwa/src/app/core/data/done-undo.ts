// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, type Signal, Service, signal } from '@angular/core';
import { CommandTag, type CompleteTask, TaskStatus, type Task } from '@asys/domain';

import { CommandOutcomeTag, DataApi, isRetryable, type CommandOutcome } from '../api/data-api';
import { Haptics } from '../platform/haptics';
import { CommandAttempts } from './command-attempts';
import { DataStore } from './data-store';
import { outcomeMessage } from './outcome-message';

/** Where a Done came from: the button gets a haptic tick, a swipe already had its threshold tick. */
export enum DoneOrigin {
  Button = 'button',
  Swipe = 'swipe',
}

/** Why the Undo window is paused: the pointer or focus is inside the bar. */
export enum PauseReason {
  Pointer = 'pointer',
  Focus = 'focus',
}

/** How long a Done can be undone, in milliseconds. */
export const UNDO_WINDOW_MS = 5_000;

/** The Done whose Undo window is open. */
export interface PendingDone {
  readonly taskId: string;
  readonly title: string;
  readonly origin: DoneOrigin;
}

/** A Done that was not applied, with the sentence to show and what the person can do about it. */
export interface DoneFailure {
  readonly taskId: string;
  readonly title: string;
  readonly message: string;
  readonly canRetry: boolean;
  readonly closedElsewhere: boolean;
}

/** One line for the shell's status region; `seq` differs for every notice, so equal texts are announced again. */
export interface DoneNotice {
  readonly text: string;
  readonly seq: number;
}

/** The Done that was just undone, for Now and the shell to restore focus. */
export interface DoneUndone {
  readonly taskId: string;
  readonly seq: number;
}

interface Held {
  readonly task: Task;
  readonly command: CompleteTask;
  readonly key: string;
  readonly origin: DoneOrigin;
}

/**
 * Owns a Done's Undo window, its idempotency key and its send, so the key outlives Now and the
 * editor. Provide it in the shell: `providers: [CommandAttempts, CaptureQueue, DoneUndo]`.
 */
@Service({ autoProvided: false })
export class DoneUndo {
  readonly #dataStore = inject(DataStore);

  readonly #dataApi = inject(DataApi);

  readonly #attempts = inject(CommandAttempts);

  readonly #haptics = inject(Haptics);

  readonly #document = inject(DOCUMENT);

  readonly #destroyRef = inject(DestroyRef);

  readonly #view = this.#document.defaultView;

  readonly #pendingSignal = signal<PendingDone | null>(null);

  readonly #failureSignal = signal<DoneFailure | null>(null);

  readonly #noticeSignal = signal<DoneNotice | null>(null);

  readonly #undoneSignal = signal<DoneUndone | null>(null);

  readonly #focusSignal = signal(0);

  readonly #paused = new Set<PauseReason>();

  readonly #inflight = new Set<Promise<void>>();

  #held: Held | null = null;

  #failedTask: Task | null = null;

  #timer: ReturnType<typeof setTimeout> | null = null;

  #startedAt = 0;

  #remaining = UNDO_WINDOW_MS;

  #noticeSeq = 0;

  #undoneSeq = 0;

  readonly pending: Signal<PendingDone | null> = this.#pendingSignal.asReadonly();

  readonly failure: Signal<DoneFailure | null> = this.#failureSignal.asReadonly();

  readonly notice: Signal<DoneNotice | null> = this.#noticeSignal.asReadonly();

  readonly undone: Signal<DoneUndone | null> = this.#undoneSignal.asReadonly();

  readonly focusRequest: Signal<number> = this.#focusSignal.asReadonly();

  constructor() {
    this.#document.addEventListener('visibilitychange', this.#onVisibilityChange);
    this.#view?.addEventListener('pagehide', this.#onPageHide);

    this.#destroyRef.onDestroy(() => {
      this.#document.removeEventListener('visibilitychange', this.#onVisibilityChange);
      this.#view?.removeEventListener('pagehide', this.#onPageHide);

      const held = this.#take();

      if (held !== null) {
        void this.#dataApi.runCommand(held.command, held.key, { keepalive: true });
        this.#dataStore.release(held.key);
      }
    });
  }

  /** Hides the Task at once and opens its Undo window; an earlier Done is sent without waiting. */
  complete(task: Task, origin: DoneOrigin): void {
    if (this.#held?.task.id === task.id) {
      return;
    }

    this.#failureSignal.set(null);
    this.#failedTask = null;

    const earlier = this.#take();

    if (earlier !== null) {
      void this.#dispatch(earlier, false);
    }

    const command: CompleteTask = {
      _tag: CommandTag.CompleteTask,
      taskId: task.id,
      expect: { status: TaskStatus.Open },
    };
    const key = this.#attempts.keyFor(command);

    this.#dataStore.hold(command, key);
    this.#held = { task, command, key, origin };
    this.#remaining = UNDO_WINDOW_MS;
    this.#pendingSignal.set({ taskId: task.id, title: task.title, origin });
    this.#announce(`“${task.title}” is Done.`);
    this.#syncTimer();

    if (origin === DoneOrigin.Button) {
      this.#haptics.tick();
    }
  }

  /** Takes the pending Done back: releases the hold and sends nothing. */
  undo(): void {
    const held = this.#take();

    if (held === null) {
      return;
    }

    this.#dataStore.release(held.key);
    this.#undoneSeq += 1;
    this.#undoneSignal.set({ taskId: held.task.id, seq: this.#undoneSeq });
    this.#clearPausesWhenIdle();
  }

  /** Sends a pending Done at once and resolves when every send in flight has been handled. */
  flush(): Promise<void> {
    this.#sendHeld(false);

    if (this.#inflight.size === 0) {
      return Promise.resolve();
    }

    return Promise.allSettled(this.#inflight).then(() => undefined);
  }

  /** Holds the failed Task again with the key it has now: the same after Failed, a fresh one after KeyReused. */
  retry(): void {
    const task = this.#failedTask;

    if (task === null || !this.#failureSignal()?.canRetry) {
      return;
    }

    this.complete(task, DoneOrigin.Button);
  }

  /** Closes the failure or notice; a displaced Done's window runs again for the time it had left. */
  dismiss(): void {
    this.#failureSignal.set(null);
    this.#failedTask = null;
    this.#syncTimer();
    this.#clearPausesWhenIdle();
  }

  pause(reason: PauseReason): void {
    if (this.#held === null && this.#failureSignal() === null) {
      return;
    }

    this.#paused.add(reason);
    this.#syncTimer();
  }

  resume(reason: PauseReason): void {
    this.#paused.delete(reason);
    this.#syncTimer();
  }

  /** Asks the bar to take focus; the bar watches `focusRequest`. */
  requestFocus(): void {
    this.#focusSignal.update((count) => count + 1);
  }

  readonly #onVisibilityChange = (): void => {
    if (this.#document.visibilityState === 'hidden') {
      this.#sendHeld(true);
    }
  };

  readonly #onPageHide = (): void => {
    this.#sendHeld(true);
  };

  readonly #onWindowEnd = (): void => {
    this.#sendHeld(false);
  };

  /** Sends the pending Done now, if there is one; with `keepalive`, the request outlives the page. */
  #sendHeld(keepalive: boolean): void {
    const held = this.#take();

    if (held !== null) {
      void this.#dispatch(held, keepalive);
      this.#clearPausesWhenIdle();
    }
  }

  /** Stops the timer and empties the slot; the caller sends or releases what it got. */
  #take(): Held | null {
    const held = this.#held;

    this.#held = null;

    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    if (held !== null) {
      this.#pendingSignal.set(null);
    }

    return held;
  }

  /** Runs the timer only while a Done is pending, no pause reason holds and no failure displaces the bar. */
  #syncTimer(): void {
    const shouldRun =
      !this.#destroyRef.destroyed &&
      this.#held !== null &&
      this.#paused.size === 0 &&
      this.#failureSignal() === null;

    if (shouldRun && this.#timer === null) {
      this.#startedAt = Date.now();
      this.#timer = setTimeout(this.#onWindowEnd, this.#remaining);
    } else if (!shouldRun && this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
      this.#remaining = Math.max(0, this.#remaining - (Date.now() - this.#startedAt));
    }
  }

  /** A bar that is removed never reports pointerleave or focusout, so a stale reason would freeze the next window. */
  #clearPausesWhenIdle(): void {
    if (this.#held === null && this.#failureSignal() === null) {
      this.#paused.clear();
    }
  }

  #announce(text: string): void {
    this.#noticeSeq += 1;
    this.#noticeSignal.set({ text, seq: this.#noticeSeq });
  }

  #dispatch(held: Held, keepalive: boolean): Promise<void> {
    const run = async (): Promise<void> => {
      const outcome = keepalive
        ? await this.#dataApi.runCommand(held.command, held.key, { keepalive: true })
        : await this.#dataStore.send(held.command, held.key);

      this.#attempts.settle(held.command, outcome);
      this.#handle(held, outcome);
    };
    const promise: Promise<void> = run().finally(() => {
      this.#inflight.delete(promise);
    });

    this.#inflight.add(promise);

    return promise;
  }

  #handle(held: Held, outcome: CommandOutcome): void {
    if (outcome._tag === CommandOutcomeTag.Applied) {
      return;
    }

    this.#dataStore.release(held.key);

    if (outcome._tag === CommandOutcomeTag.SignedOut || this.#destroyRef.destroyed) {
      return;
    }

    const message = outcomeMessage(outcome) ?? '';
    const title = held.task.title;
    const closedElsewhere = outcome._tag === CommandOutcomeTag.NotApplicable;

    this.#failureSignal.set({
      taskId: held.task.id,
      title,
      message,
      canRetry: isRetryable(outcome._tag),
      closedElsewhere,
    });
    // Closed elsewhere, the Task may well be Done, so the title line is left out.
    this.#announce(closedElsewhere ? message : `“${title}” is not Done. ${message}`);

    this.#failedTask = held.task;
    this.#syncTimer();
  }
}
