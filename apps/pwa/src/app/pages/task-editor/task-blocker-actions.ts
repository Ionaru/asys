// SPDX-License-Identifier: EUPL-1.2
import {
  computed,
  DestroyRef,
  inject,
  Injectable,
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

import type {
  TaskBlockerRow,
  TaskBlockerTask,
} from '../../components/organisms/task-blockers/task-blockers';
import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Ids } from '../../core/platform/ids';
import { blockerSummary } from './blocker-summary';

/**
 * The blockers of the Task being edited: what it waits for, what waits for it, the Tasks it could wait
 * for, and the Add and Remove commands. Provided by the Task editor, which calls `connect` once.
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

  /** The Find a Task text. */
  readonly filter: WritableSignal<string> = signal('');

  readonly #message = signal('');

  readonly #adding = signal(false);

  /** The AddBlocker commands still being tried, by blocker id, so a retry reuses its linkId. */
  readonly #addCommands = new Map<string, AddBlocker>();

  readonly #task = computed<Task | undefined>(() => {
    if (!this.#connected()) {
      return undefined;
    }

    const taskId = this.#taskId();

    return this.#dataStore.state()?.tasks.find((task) => task.id === taskId);
  });

  /** The message of a failed Add or Remove. */
  readonly message: Signal<string> = this.#message.asReadonly();

  /** Whether an AddBlocker from the section is in flight. */
  readonly adding: Signal<boolean> = this.#adding.asReadonly();

  /** The Tasks the Task waits for, in link order, with whether each Remove is pending. */
  readonly blockedBy = computed<readonly TaskBlockerRow[]>(() => {
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
  readonly blocks = computed<readonly TaskBlockerTask[]>(() => {
    const state = this.#dataStore.state();
    const task = this.#task();

    return state === null || task === undefined
      ? []
      : blocks(task, state.tasks, state.links).map(({ id, title }) => ({ id, title }));
  });

  /** The Tasks offered as a blocker, filtered by the Find a Task text. */
  readonly candidates = computed<readonly TaskBlockerTask[]>(() => {
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

  /** Reads the Task id and whether the editor is busy from the page; called once. */
  connect(taskId: () => string, busy: () => boolean): void {
    this.#taskId = taskId;
    this.#busy = busy;
    this.#connected.set(true);
  }

  /** Makes a Task a blocker. Resolves true when the server applied it. */
  async add(blockerId: string): Promise<boolean> {
    if (this.#busy() || this.#adding()) {
      return false;
    }

    this.#message.set('');

    const command: AddBlocker = this.#addCommands.get(blockerId) ?? {
      _tag: CommandTag.AddBlocker,
      linkId: this.#ids.next(),
      taskId: this.#taskId(),
      blockerId,
    };

    this.#addCommands.set(blockerId, command);
    this.#adding.set(true);

    const outcome = await this.#attempts.send(command);

    if (this.#destroyRef.destroyed) {
      return false;
    }

    this.#adding.set(false);

    if (outcome._tag !== CommandOutcomeTag.Failed) {
      this.#addCommands.delete(blockerId);
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.filter.set('');
      return true;
    }

    this.#message.set(outcomeMessage(outcome) ?? '');
    return false;
  }

  /** Removes a blocker by its link id. Resolves true when the server applied it. */
  async remove(linkId: string): Promise<boolean> {
    if (this.#busy() || this.#attempts.busy(linkId)) {
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

    this.#message.set(outcomeMessage(outcome) ?? '');
    return false;
  }
}
