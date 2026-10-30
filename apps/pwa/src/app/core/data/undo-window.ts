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
import { DataStore, type HeldTriageSender } from './data-store';
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
  /** Names this hold's window (its idempotency key), so the bar starts the ring again for every new hold. */
  readonly windowKey: string;
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

/** Picks the held commands for the same Task as `held`. */
const sameTask =
  (held: Held) =>
  (other: Held): boolean =>
    other.task.id === held.task.id;

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

  /** The runs of the sends in flight, in the order they started, each with the held command it sends. */
  readonly #inflight = new Map<Promise<void>, Held>();

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

    const unregisterHeldTriage = this.#dataStore.onHeldTriage(this.#sendHeldTriage);

    this.#destroyRef.onDestroy(() => {
      unregisterHeldTriage();
      this.#document.removeEventListener('visibilitychange', this.#onVisibilityChange);
      this.#view?.removeEventListener('pagehide', this.#onPageHide);

      // A destroy cannot wait, so these go at once, even ahead of an earlier send of the same Task that is
      // still in flight (a known limit), unlike a hide's keepalive sends, which wait for it.
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

    return Promise.allSettled(this.#inflight.keys()).then(() => undefined);
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

  /**
   * DataStore's sender for held Triages (see `DataStore.send`): a held Triage of the Task goes now, as the
   * window's end would send it, which closes its window. Resolves once every send of a Triage of the Task
   * that started before the waiting command's own send (the one with `key`) has been handled, and at once
   * when there is none. Only Triages count, because a Done in flight may itself wait for the save that asks.
   */
  readonly #sendHeldTriage: HeldTriageSender = (taskId, key) => {
    const held = this.#held;

    if (held?.task.id === taskId && held.kind === UndoKind.Triage) {
      this.#take();
      void this.#dispatch(held, false);
      this.#clearPausesWhenIdle();
    }

    const ahead = this.#runsAhead(
      (other) => other.key === key,
      (other) => other.task.id === taskId && other.kind === UndoKind.Triage,
    );

    return ahead.length === 0 ? Promise.resolve() : Promise.allSettled(ahead).then(() => undefined);
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
   * Sends every Done that waits for `after` with keepalive, without waiting for `after`, and hands the send
   * to its own run, which handles the outcome instead of sending normally; a flush that holds that run waits
   * for exactly this send. Like every keepalive send, it first lets an earlier send of its Task settle.
   */
  #sendWaiting(): void {
    for (const [waiting, wake] of this.#waiting) {
      this.#waiting.delete(waiting);
      wake(
        this.#sendKeepalive(
          waiting,
          this.#runsAhead((other) => other === waiting, sameTask(waiting)),
        ),
      );
    }
  }

  /**
   * The runs in flight that `matches` picks, among those that started before the first run `stop` picks (all
   * of them when it picks none). Every wait points only at earlier runs, so no send waits for itself.
   */
  #runsAhead(stop: (held: Held) => boolean, matches: (held: Held) => boolean): Promise<void>[] {
    const ahead: Promise<void>[] = [];

    for (const [run, held] of this.#inflight) {
      if (stop(held)) {
        break;
      }

      if (matches(held)) {
        ahead.push(run);
      }
    }

    return ahead;
  }

  /**
   * Sends with keepalive once the runs ahead of it have settled, so a Done never reaches the server before
   * the Triage of its Task sent just before it; with none ahead it goes at once, as the page may be leaving.
   */
  #sendKeepalive(held: Held, ahead: readonly Promise<void>[]): Promise<CommandOutcome> {
    const send = (): Promise<CommandOutcome> =>
      this.#dataApi.runCommand(held.command, held.key, { keepalive: true });

    return ahead.length === 0 ? send() : Promise.allSettled(ahead).then(send);
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
   * Puts the command on hold for the Task, opens its window and announces it; ignored while the same command
   * is already held. A different command of the same kind for the same Task replaces the held one, which is
   * released without being sent: the person's latest choice wins. Any other held command is sent at once
   * first, a held Triage of this Task included when a Done or a Drop of it from Now follows; that Done or
   * Drop then waits for the Triage through `DataStore.send` when its own window ends.
   */
  #hold(
    task: Task,
    kind: UndoKind,
    command: HeldCommand,
    quadrantWord: string,
    origin: DoneOrigin,
    after: Promise<void> | undefined,
  ): void {
    const key = this.#attempts.keyFor(command);

    if (this.#held?.key === key) {
      return;
    }

    this.#failed.set(null);

    const earlier = this.#take();

    if (earlier?.task.id === task.id && earlier.kind === kind) {
      // It never reached the server, so letting go of it is enough.
      this.#dataStore.release(earlier.key);
    } else if (earlier !== null) {
      void this.#dispatch(earlier, false);
    }

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
      windowKey: key,
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

  /**
   * Sends the held command and handles its outcome. A normal send goes through `DataStore.send`, which lets a
   * held Triage of the Task go first; a keepalive send waits for the sends of its Task already in flight.
   */
  #dispatch(held: Held, keepalive: boolean): Promise<void> {
    // Taken before this run is registered, so it holds only earlier runs.
    const ahead = keepalive ? this.#runsAhead(() => false, sameTask(held)) : [];
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
          ? this.#sendKeepalive(held, ahead)
          : this.#dataStore.send(held.command, held.key)));

      this.#attempts.settle(held.command, outcome);
      this.#handle(held, outcome);
    };
    const promise: Promise<void> = run().finally(() => {
      this.#inflight.delete(promise);
    });

    this.#inflight.set(promise, held);

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
