// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { type AddBlocker, blockerCandidates, blocks, CommandTag, type Task } from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Ids } from '../../core/platform/ids';
import { Button, ButtonSize, ButtonVariant } from '../../ui/button/button';
import { IconName } from '../../ui/icon/icon';
import { SectionHeader, SectionHeaderAction } from '../../ui/section-header/section-header';
import { Sheet } from '../../ui/sheet/sheet';
import { TextField } from '../../ui/text-field/text-field';
import { blockerSummary } from './blocker-summary';

/** The Blocked by section of the Task editor: a header with a one-line summary that opens a sheet. */
@Component({
  selector: 'asys-task-blockers',
  imports: [Button, RouterLink, SectionHeader, Sheet, TextField],
  templateUrl: './task-blockers.component.html',
  styleUrl: './task-blockers.css',
})
export class TaskBlockers {
  readonly taskId = input.required<string>();

  /** True while the editor is leaving, the Task awaits sync, or the editor is read-only. */
  readonly busy = input<boolean>(false);

  readonly #dataStore = inject(DataStore);

  readonly #attempts = inject(CommandAttempts);

  readonly #ids = inject(Ids);

  readonly #destroyRef = inject(DestroyRef);

  readonly #injector = inject(Injector);

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly Icons = IconName;

  protected readonly SectionHeaderAction = SectionHeaderAction;

  protected readonly open = signal(false);

  protected readonly filter = signal('');

  protected readonly blockerMessage = signal('');

  /** Whether an AddBlocker sent from this component is in flight. */
  readonly #adding = signal(false);

  /** The AddBlocker commands still being tried, by blocker id, so a retry reuses its linkId. */
  readonly #addCommands = new Map<string, AddBlocker>();

  readonly #task = computed<Task | undefined>(() =>
    this.#dataStore.state()?.tasks.find((task) => task.id === this.taskId()),
  );

  protected readonly blockedBy = computed(() => {
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
      }));
  });

  protected readonly blocksTasks = computed<readonly Task[]>(() => {
    const state = this.#dataStore.state();
    const task = this.#task();

    return state === null || task === undefined ? [] : blocks(task, state.tasks, state.links);
  });

  protected readonly candidates = computed<readonly Task[]>(() => {
    const state = this.#dataStore.state();
    const task = this.#task();

    if (state === null || task === undefined) {
      return [];
    }

    const needle = this.filter().toLowerCase();

    return blockerCandidates(task, state.tasks, state.links).filter((candidate) =>
      candidate.title.toLowerCase().includes(needle),
    );
  });

  protected readonly summary = computed(() =>
    blockerSummary(
      this.blockedBy().map((row) => row.title),
      this.blocksTasks().length,
    ),
  );

  /** Whether the candidates are unavailable: the editor is busy or an add from here is in flight. */
  protected readonly addBusy = computed(() => this.busy() || this.#adding());

  /** Whether this link's Remove is pending or waits for the server. */
  protected removeBusy(linkId: string): boolean {
    return this.busy() || this.#attempts.busy(linkId);
  }

  protected async removeBlocker(linkId: string): Promise<void> {
    if (this.removeBusy(linkId)) {
      return;
    }

    const index = this.blockedBy().findIndex((row) => row.linkId === linkId);

    this.blockerMessage.set('');

    const outcome = await this.#attempts.send({ _tag: CommandTag.RemoveBlocker, linkId });

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.#focusAfterRender(() => {
        const removes =
          this.#host.nativeElement.querySelectorAll<HTMLElement>('.task-blockers__remove');

        return removes[index] ?? removes[removes.length - 1] ?? this.#findInput();
      });
    } else {
      this.blockerMessage.set(outcomeMessage(outcome) ?? '');
    }
  }

  protected async addBlocker(blockerId: string): Promise<void> {
    if (this.addBusy()) {
      return;
    }

    this.blockerMessage.set('');

    const command: AddBlocker = this.#addCommands.get(blockerId) ?? {
      _tag: CommandTag.AddBlocker,
      linkId: this.#ids.next(),
      taskId: this.taskId(),
      blockerId,
    };

    this.#addCommands.set(blockerId, command);
    this.#adding.set(true);

    const outcome = await this.#attempts.send(command);

    if (this.#destroyRef.destroyed) {
      return;
    }

    this.#adding.set(false);

    if (outcome._tag !== CommandOutcomeTag.Failed) {
      this.#addCommands.delete(blockerId);
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.filter.set('');
      this.#focusAfterRender(() => this.#findInput());
    } else {
      this.blockerMessage.set(outcomeMessage(outcome) ?? '');
    }
  }

  #findInput(): HTMLElement | undefined {
    return (
      this.#host.nativeElement.querySelector<HTMLElement>('asys-text-field input') ?? undefined
    );
  }

  /** After the next render, focuses the element the callback finds. */
  #focusAfterRender(target: () => HTMLElement | undefined): void {
    afterNextRender(() => target()?.focus(), { injector: this.#injector });
  }
}
