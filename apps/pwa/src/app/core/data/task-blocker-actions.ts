// SPDX-License-Identifier: EUPL-1.2
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
  linkedSignal,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';
import {
  type AddBlocker,
  BlockedReasonTag,
  blockedReasons,
  blockerCandidates,
  blocks,
  CommandTag,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag } from '../api/data-api';
import { Ids } from '../platform/ids';
import { blockerSummary } from './blocker-summary';
import { CommandAttempts } from './command-attempts';
import { DataStore } from './data-store';
import { outcomeMessage } from './outcome-message';

/** A Task the card's Task waits for, with whether its Remove is pending (the TaskBlockers organism's row). */
export interface BlockerRow {
  readonly linkId: string;
  readonly title: string;
  readonly busy: boolean;
}

/** A Task shown in the Blocks and Find a Task lists (the TaskBlockers organism's Task). */
export interface BlockerTask {
  readonly id: string;
  readonly title: string;
}

/**
 * The blockers of the Task being edited: what it waits for, what waits for it, the Tasks it could wait
 * for, and the Add and Remove commands. Provided by the Task editor or the Inbox, which calls `connect`
 * once. The Task id may change over time (the Inbox's card moves on) and may be '' (no card): the lists
 * are then empty, Add and Remove do nothing, and the Find a Task text and the failure message start over
 * with each Task.
 */
@Injectable()
export class TaskBlockerActions {
  readonly #dataStore = inject(DataStore);

  readonly #attempts = inject(CommandAttempts);

  readonly #ids = inject(Ids);

  readonly #destroyRef = inject(DestroyRef);

  #taskId: () => string = () => '';

  #busy: () => boolean = () => false;

  #connected = signal(false);

  /** The Find a Task text; empty again whenever the Task changes. */
  readonly filter: WritableSignal<string> = linkedSignal({
    source: () => this.#currentId(),
    computation: () => '',
  });

  readonly #message = linkedSignal({
    source: () => this.#currentId(),
    computation: () => '',
  });

  readonly #adding = signal(false);

  /** The AddBlocker commands still being tried, by Task and blocker id, so a retry reuses its linkId. */
  readonly #addCommands = new Map<string, AddBlocker>();

  /** The connected Task id, '' until `connect` is called. */
  readonly #currentId = computed(() => (this.#connected() ? this.#taskId() : ''));

  readonly #task = computed<Task | undefined>(() => {
    const taskId = this.#currentId();

    if (taskId === '') {
      return undefined;
    }

    return this.#dataStore.state()?.tasks.find((task) => task.id === taskId);
  });

  /** The message of a failed Add or Remove. */
  readonly message: Signal<string> = this.#message.asReadonly();

  /** Whether an AddBlocker from the section is in flight. */
  readonly adding: Signal<boolean> = this.#adding.asReadonly();

  /** The Tasks the Task waits for, in link order, with whether each Remove is pending. */
  readonly blockedBy = computed<readonly BlockerRow[]>(() => {
    const state = this.#dataStore.state();
    const task = this.#task();

    if (state === null || task === undefined) {
      return [];
    }

    return state.links
      .filter((link) => link.taskId === task.id)
      .map((link) => ({
        linkId: link.id,
        title:
          state.tasks.find((other) => other.id === link.blockerId)?.title ??
          'A Task that is no longer open',
        busy: this.#attempts.busy(link.id),
      }));
  });

  /** The Tasks that wait for the Task. */
  readonly blocks = computed<readonly BlockerTask[]>(() => {
    const state = this.#dataStore.state();
    const task = this.#task();

    return state === null || task === undefined
      ? []
      : blocks(task, state.tasks, state.links).map(({ id, title }) => ({ id, title }));
  });

  /** The Tasks offered as a blocker, filtered by the Find a Task text. */
  readonly candidates = computed<readonly BlockerTask[]>(() => {
    const state = this.#dataStore.state();
    const task = this.#task();

    if (state === null || task === undefined) {
      return [];
    }

    const needle = this.filter().toLowerCase();

    return blockerCandidates(task, state.tasks, state.links)
      .filter((candidate) => candidate.title.toLowerCase().includes(needle))
      .map(({ id, title }) => ({ id, title }));
  });

  /** The titles of the blockers the domain counts: those still Open or Delegated, in link order. */
  readonly #waitsFor = computed<readonly string[]>(() => {
    const state = this.#dataStore.state();
    const task = this.#task();

    if (state === null || task === undefined) {
      return [];
    }

    // The blockers the domain counts (blockedReasons), named in link order.
    const counted = new Set(
      blockedReasons(task, state.tasks, state.links).flatMap((reason) =>
        reason._tag === BlockedReasonTag.BlockedBy ? reason.taskIds : [],
      ),
    );

    return state.links
      .filter((link) => link.taskId === task.id && counted.has(link.blockerId))
      .flatMap((link) => state.tasks.find((other) => other.id === link.blockerId)?.title ?? []);
  });

  /** The one-line summary of the blockers. */
  readonly summary = computed(() => blockerSummary(this.#waitsFor(), this.blocks().length));

  /** Reads the Task id ('' for none) and whether the page is busy from the page; called once. */
  connect(taskId: () => string, busy: () => boolean): void {
    this.#taskId = taskId;
    this.#busy = busy;
    this.#connected.set(true);
  }

  /** Makes a Task a blocker. Resolves true when the server applied it. */
  async add(blockerId: string): Promise<boolean> {
    const taskId = this.#currentId();

    if (taskId === '' || this.#busy() || this.#adding()) {
      return false;
    }

    this.#message.set('');

    const key = `${taskId}:${blockerId}`;
    const command: AddBlocker = this.#addCommands.get(key) ?? {
      _tag: CommandTag.AddBlocker,
      linkId: this.#ids.next(),
      taskId,
      blockerId,
    };

    this.#addCommands.set(key, command);
    this.#adding.set(true);

    const outcome = await this.#attempts.send(command);

    if (this.#destroyRef.destroyed) {
      return false;
    }

    this.#adding.set(false);

    if (outcome._tag !== CommandOutcomeTag.Failed) {
      this.#addCommands.delete(key);
    }

    // The card may have moved on while the send ran: its state is not this Task's to touch.
    const current = this.#currentId() === taskId;

    if (outcome._tag === CommandOutcomeTag.Applied) {
      if (current) {
        this.filter.set('');
      }

      return true;
    }

    if (current) {
      this.#message.set(outcomeMessage(outcome) ?? '');
    }

    return false;
  }

  /** Removes a blocker by its link id. Resolves true when the server applied it. */
  async remove(linkId: string): Promise<boolean> {
    const taskId = this.#currentId();

    if (taskId === '' || this.#busy() || this.#attempts.busy(linkId)) {
      return false;
    }

    this.#message.set('');

    const outcome = await this.#attempts.send({ _tag: CommandTag.RemoveBlocker, linkId });

    if (this.#destroyRef.destroyed) {
      return false;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      return true;
    }

    if (this.#currentId() === taskId) {
      this.#message.set(outcomeMessage(outcome) ?? '');
    }

    return false;
  }
}
