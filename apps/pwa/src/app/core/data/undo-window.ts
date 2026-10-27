// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, type Signal, Service, signal } from '@angular/core';
import {
  CommandTag,
  type CompleteTask,
  type DropTask,
  type Task,
  TaskStatus,
  type TriageTask,
} from '@asys/domain';

import { CommandOutcomeTag, DataApi, isRetryable, type CommandOutcome } from '../api/data-api';
import { Haptics } from '../platform/haptics';
import { CommandAttempts } from './command-attempts';
import { DataStore } from './data-store';
import type { HeldCommand } from './held-state';
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

/** What the Undo window holds: a Done, a Triage or a Drop. */
export enum UndoKind {
  Done = 'done',
  Triage = 'triage',
  Drop = 'drop',
}

/** How long a Done, a Triage or a Drop can be undone, in milliseconds. */
export const UNDO_WINDOW_MS = 5_000;

/** The held command whose Undo window is open, with the copy its bar shows and how much of the window is left when it appears. */
export interface PendingUndo {
  readonly taskId: string;
  readonly title: string;
  readonly kind: UndoKind;
  /** The bar's status word: `Done`, `Triaged as Plan` or `Dropped`. */
  readonly status: string;
  /** The Undo button's accessible name, such as `Undo Done: <title>`. */
  readonly undoLabel: string;
  readonly origin: DoneOrigin;
  readonly remainingMs: number;
}

/** A held command that was not applied, with the sentence to show and what the person can do about it. */
export interface UndoFailure {
  readonly taskId: string;
  readonly title: string;
  readonly kind: UndoKind;
  /** The sentence that names the Task, such as `“<title>” is not Done.`, before the message. */
  readonly text: string;
  readonly message: string;
  readonly canRetry: boolean;
  readonly closedElsewhere: boolean;
}

/** One line for the shell's status region; `seq` differs for every notice, so equal texts are announced again. */
export interface UndoNotice {
  readonly text: string;
  readonly seq: number;
}

/** The Done, Triage or Drop that was just undone, for Now and the shell to restore focus. */
export interface Undone {
  readonly taskId: string;
  readonly kind: UndoKind;
  readonly seq: number;
}

interface Held {
  readonly task: Task;
  readonly kind: UndoKind;
  readonly command: HeldCommand;
  /** The Quadrant word a Triage was filed under, for its copy and for a retry; empty for the other kinds. */
  readonly quadrantWord: string;
  readonly key: string;
  readonly origin: DoneOrigin;
  /** Work this Done waits for before a normal send, such as an edit still being saved. */
  readonly after: Promise<void> | undefined;
}

const statusOf = (kind: UndoKind, quadrantWord: string): string => {
  switch (kind) {
    case UndoKind.Done:
      return 'Done';
    case UndoKind.Triage:
      return `Triaged as ${quadrantWord}`;
    case UndoKind.Drop:
      return 'Dropped';
  }
};

const undoLabelOf = (kind: UndoKind, title: string): string => {
  switch (kind) {
    case UndoKind.Done:
      return `Undo Done: ${title}`;
    case UndoKind.Triage:
      return `Undo Triage: ${title}`;
    case UndoKind.Drop:
      return `Undo Drop: ${title}`;
  }
};

const heldAnnouncementOf = (kind: UndoKind, title: string, quadrantWord: string): string => {
  const window = `Undo is available for ${UNDO_WINDOW_MS / 1000} seconds.`;

  switch (kind) {
    case UndoKind.Done:
      return `“${title}” is Done. ${window}`;
    case UndoKind.Triage:
      return `“${title}” is triaged as ${quadrantWord}. ${window}`;
    case UndoKind.Drop:
      return `“${title}” is dropped. ${window}`;
  }
};

const failureTextOf = (kind: UndoKind, title: string): string => {
  switch (kind) {
    case UndoKind.Done:
      return `“${title}” is not Done.`;
    case UndoKind.Triage:
      return `“${title}” is not triaged.`;
    case UndoKind.Drop:
      return `“${title}” is not dropped.`;
  }
};

/**
 * Owns the Undo window of a Done, a Triage or a Drop, its idempotency key and its send, so the key outlives
 * Now, the Inbox and the editor. Provide it in the shell: `providers: [CommandAttempts, CaptureQueue, UndoWindow]`.
 */
@Service({ autoProvided: false })
export class UndoWindow {
  readonly #dataStore = inject(DataStore);

  readonly #dataApi = inject(DataApi);

  readonly #attempts = inject(CommandAttempts);

  readonly #haptics = inject(Haptics);

  readonly #document = inject(DOCUMENT);

  readonly #destroyRef = inject(DestroyRef);

  readonly #view = this.#document.defaultView;

  readonly #pendingSignal = signal<PendingUndo | null>(null);

  /** The failure the shell shows, beside the held command it is about, which only `retry` needs. */
  readonly #failed = signal<{ readonly failure: UndoFailure; readonly held: Held } | null>(null);

  readonly #noticeSignal = signal<UndoNotice | null>(null);

  readonly #undoneSignal = signal<Undone | null>(null);

  readonly #focusSignal = signal(0);

  readonly #paused = new Set<PauseReason>();

  readonly #inflight = new Set<Promise<void>>();

  /**
   * Dones taken for a normal send that still wait for `after`, each with the function that wakes its run: with
   * the keepalive send a hide started, or with null after a destroy, which sends and releases it itself.
   */
  readonly #waiting = new Map<Held, (keepaliveSend: Promise<CommandOutcome> | null) => void>();

  #held: Held | null = null;

  #timer: ReturnType<typeof setTimeout> | null = null;

  #startedAt = 0;

  #remaining = UNDO_WINDOW_MS;

  #noticeSeq = 0;

  #undoneSeq = 0;

  readonly pending: Signal<PendingUndo | null> = this.#pendingSignal.asReadonly();

  readonly failure: Signal<UndoFailure | null> = computed(() => this.#failed()?.failure ?? null);

  readonly notice: Signal<UndoNotice | null> = this.#noticeSignal.asReadonly();

  readonly undone: Signal<Undone | null> = this.#undoneSignal.asReadonly();

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

      for (const [waiting, wake] of this.#waiting) {
        this.#waiting.delete(waiting);
        void this.#dataApi.runCommand(waiting.command, waiting.key, { keepalive: true });
        this.#dataStore.release(waiting.key);
        wake(null);
      }
    });
  }

  /**
   * Hides the Task at once and opens its Undo window; an earlier Done, Triage or Drop is sent without
   * waiting. A normal send first awaits `after` (a rejection counts as settled); a send with `keepalive`
   * does not wait.
   */
  complete(task: Task, origin: DoneOrigin, after?: Promise<void>): void {
    const command: CompleteTask = {
      _tag: CommandTag.CompleteTask,
      taskId: task.id,
      expect: { status: TaskStatus.Open },
    };

    this.#hold(task, UndoKind.Done, command, '', origin, after);
  }

  /**
   * Applies a Triage to the Task at once and opens its Undo window, as `complete` does for a Done.
   * `quadrantWord` is the Quadrant the Task lands in, as the bar says it ("Triaged as Plan").
   */
  triage(task: Task, command: TriageTask, quadrantWord: string): void {
    this.#hold(task, UndoKind.Triage, command, quadrantWord, DoneOrigin.Button, undefined);
  }

  /** Drops the Task at once and opens its Undo window, as `complete` does for a Done. */
  drop(task: Task): void {
    const command: DropTask = {
      _tag: CommandTag.DropTask,
      taskId: task.id,
      expect: { status: TaskStatus.Open },
    };

    this.#hold(task, UndoKind.Drop, command, '', DoneOrigin.Button, undefined);
  }

  /** Takes the pending command back: releases the hold and sends nothing. */
  undo(): void {
    const held = this.#take();

    if (held === null) {
      return;
    }

    this.#dataStore.release(held.key);
    this.#undoneSeq += 1;
    this.#undoneSignal.set({ taskId: held.task.id, kind: held.kind, seq: this.#undoneSeq });
    this.#clearPausesWhenIdle();
  }

  /** Sends the pending command at once and resolves when every send in flight has been handled. */
  flush(): Promise<void> {
    this.#sendHeld(false);

    if (this.#inflight.size === 0) {
      return Promise.resolve();
    }

    return Promise.allSettled(this.#inflight).then(() => undefined);
  }

  /** Holds the failed command again with the key it has now: the same after Failed, a fresh one after KeyReused. */
  retry(): void {
    const failed = this.#failed();

    if (failed === null || !failed.failure.canRetry) {
      return;
    }

    const { task, command, quadrantWord } = failed.held;

    switch (command._tag) {
      case CommandTag.CompleteTask:
        this.complete(task, DoneOrigin.Button);
        break;
      case CommandTag.TriageTask:
        this.triage(task, command, quadrantWord);
        break;
      case CommandTag.DropTask:
        this.drop(task);
        break;
    }
  }

  /** Closes the failure or notice; a displaced command's window runs again for the time it had left. */
  dismiss(): void {
    const displaced = this.#failed() !== null;

    this.#failed.set(null);
    this.#syncTimer();

    // The bar shows the displaced command again, so its ring starts where the timer is.
    if (displaced) {
      this.#pendingSignal.update((pending) =>
        pending === null ? null : { ...pending, remainingMs: this.#remaining },
      );
    }

    this.#clearPausesWhenIdle();
  }

  pause(reason: PauseReason): void {
    if (this.#held === null && this.#failed() === null) {
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

  /** Sends the pending command now, if there is one; with `keepalive`, the request outlives the page. */
  #sendHeld(keepalive: boolean): void {
    if (keepalive) {
      this.#sendWaiting();
    }

    const held = this.#take();

    if (held !== null) {
      void this.#dispatch(held, keepalive);
      this.#clearPausesWhenIdle();
    }
  }

  /**
   * Sends every Done that waits for `after` at once with keepalive, and hands the send to its own run, which
   * handles the outcome instead of sending normally; a flush that holds that run waits for exactly this send.
   */
  #sendWaiting(): void {
    for (const [waiting, wake] of this.#waiting) {
      this.#waiting.delete(waiting);
      wake(this.#dataApi.runCommand(waiting.command, waiting.key, { keepalive: true }));
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

  /** Runs the timer only while a command is pending, no pause reason holds and no failure displaces the bar. */
  #syncTimer(): void {
    const shouldRun =
      !this.#destroyRef.destroyed &&
      this.#held !== null &&
      this.#paused.size === 0 &&
      this.#failed() === null;

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
    if (this.#held === null && this.#failed() === null) {
      this.#paused.clear();
    }
  }

  /**
   * Puts the command on hold for the Task, opens its window and announces it; ignored while this Task is
   * already held for the same kind. Any other held command is sent at once first, a held Triage of this
   * Task included, which a Done or a Drop of it from Now or the editor then follows.
   */
  #hold(
    task: Task,
    kind: UndoKind,
    command: HeldCommand,
    quadrantWord: string,
    origin: DoneOrigin,
    after: Promise<void> | undefined,
  ): void {
    if (this.#held?.task.id === task.id && this.#held.kind === kind) {
      return;
    }

    this.#failed.set(null);

    const earlier = this.#take();

    if (earlier !== null) {
      void this.#dispatch(earlier, false);
    }

    const key = this.#attempts.keyFor(command);

    this.#dataStore.hold(command, key);
    this.#held = { task, kind, command, quadrantWord, key, origin, after };
    this.#remaining = UNDO_WINDOW_MS;
    this.#pendingSignal.set({
      taskId: task.id,
      title: task.title,
      kind,
      status: statusOf(kind, quadrantWord),
      undoLabel: undoLabelOf(kind, task.title),
      origin,
      remainingMs: UNDO_WINDOW_MS,
    });
    this.#announce(heldAnnouncementOf(kind, task.title, quadrantWord));
    this.#syncTimer();

    if (origin === DoneOrigin.Button) {
      this.#haptics.tick();
    }
  }

  #announce(text: string): void {
    this.#noticeSeq += 1;
    this.#noticeSignal.set({ text, seq: this.#noticeSeq });
  }

  #dispatch(held: Held, keepalive: boolean): Promise<void> {
    const run = async (): Promise<void> => {
      let started: Promise<CommandOutcome> | null = null;

      if (!keepalive && held.after !== undefined) {
        // Wrapped, so a started send does not settle the race before its outcome arrives.
        const woken = new Promise<{ readonly send: Promise<CommandOutcome> | null }>((resolve) => {
          this.#waiting.set(held, (send) => {
            resolve({ send });
          });
        });
        const afterSettled = held.after.catch(() => undefined).then(() => null);
        const wake = await Promise.race([afterSettled, woken]);

        if (wake === null) {
          this.#waiting.delete(held);
        } else if (wake.send === null) {
          // A destroy sent it with keepalive and released it.
          return;
        } else {
          // A hide sent it with keepalive.
          started = wake.send;
        }
      }

      const outcome = await (started ??
        (keepalive
          ? this.#dataApi.runCommand(held.command, held.key, { keepalive: true })
          : this.#dataStore.send(held.command, held.key)));

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
    const text = failureTextOf(held.kind, title);
    const closedElsewhere = outcome._tag === CommandOutcomeTag.NotApplicable;

    this.#failed.set({
      failure: {
        taskId: held.task.id,
        title,
        kind: held.kind,
        text,
        message,
        canRetry: isRetryable(outcome._tag),
        closedElsewhere,
      },
      held,
    });
    // Closed elsewhere, the Task may well be closed already, so the title line is left out.
    this.#announce(closedElsewhere ? message : `${text} ${message}`);
    this.#syncTimer();
  }
}
