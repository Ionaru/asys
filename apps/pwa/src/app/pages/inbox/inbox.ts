// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  type Command,
  CommandTag,
  type DomainState,
  inboxTasks,
  openReviewItems,
  type Task,
  TaskStatus,
} from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import {
  type InboxCard,
  InboxTemplate,
  type InboxReview,
} from '../../components/templates/inbox-template/inbox-template';
import type { AreaChoice, TriageDraft } from '../../components/organisms/triage-card/triage-card';
import { byAreaName } from '../../features/areas/area-order';
import { reviewCopy } from './review-copy';

const NO_IDS: ReadonlySet<string> = new Set();

const EMPTY_DRAFT: TriageDraft = { important: null, estimateMinutes: null, areaId: null };

const draftOf = (task: Task | null, proposedAreaId: string | null): TriageDraft =>
  task === null
    ? EMPTY_DRAFT
    : {
        important: task.important,
        estimateMinutes: task.estimateMinutes,
        areaId: task.areaId ?? proposedAreaId,
      };

const areaChoices = (state: DomainState): readonly AreaChoice[] =>
  state.areas.map((area) => ({ id: area.id, name: area.name })).sort(byAreaName);

/** Where captured Tasks wait for Triage, and where ASYS asks for decisions. */
@Component({
  selector: 'app-inbox',
  imports: [InboxTemplate],
  providers: [CommandAttempts],
  template: `
    <asys-inbox-template
      [loaded]="dataStore.state() !== null"
      [loadFailed]="dataStore.status() === Status.Failed"
      [statusLine]="statusLine()"
      [reviews]="reviews()"
      [card]="card()"
      [position]="handled() + 1"
      [total]="handled() + inbox().length"
      [areas]="areas()"
      [cardBusy]="cardBusy()"
      [canLater]="inbox().length > 1"
      [empty]="reviews().length === 0 && inbox().length === 0"
      [(draft)]="draftState"
      (retry)="dataStore.refresh()"
      (dismiss)="dismiss($event)"
      (triage)="triage($event)"
      (dropTask)="drop()"
      (later)="later($event)"
      (edit)="edit($event)"
    />
  `,
})
export class Inbox {
  protected readonly dataStore = inject(DataStore);

  readonly #attempts = inject(CommandAttempts);

  readonly #router = inject(Router);

  readonly #injector = inject(Injector);

  readonly #destroyRef = inject(DestroyRef);

  protected readonly Status = SyncStatus;

  private readonly template = viewChild(InboxTemplate);

  protected readonly statusLine = signal('');

  readonly #deferred = signal<ReadonlySet<string>>(NO_IDS);

  readonly #handledIds = signal<ReadonlySet<string>>(NO_IDS);

  protected readonly inbox = computed<readonly Task[]>(() => {
    const state = this.dataStore.state();

    return state === null ? [] : inboxTasks(state);
  });

  protected readonly reviews = computed<readonly InboxReview[]>(() => {
    const state = this.dataStore.state();

    if (state === null) {
      return [];
    }

    const waiting = this.dataStore.awaitingSync();

    return openReviewItems(state).map((item) => {
      const copy = reviewCopy(item, state);

      return {
        id: item.id,
        question: copy.question,
        reason: copy.reason,
        taskId: copy.taskId,
        busy: this.#attempts.busy(item.id),
        awaitingSync: waiting.has(item.id),
      };
    });
  });

  protected readonly areas = computed<readonly AreaChoice[]>(() => {
    const state = this.dataStore.state();

    return state === null ? [] : areaChoices(state);
  });

  /** The deferred ids, or none when every Inbox Task is deferred, so the oldest comes back. */
  readonly #effectiveDeferred = computed(() => {
    const deferred = this.#deferred();

    return this.inbox().some((task) => !deferred.has(task.id)) ? deferred : NO_IDS;
  });

  readonly #card = computed<Task | null>(() => {
    const deferred = this.#effectiveDeferred();

    return this.inbox().find((task) => !deferred.has(task.id)) ?? null;
  });

  protected readonly card = computed<InboxCard | null>(() => {
    const task = this.#card();

    return task === null
      ? null
      : {
          id: task.id,
          title: task.title,
          rawText: task.captureText,
          awaitingSync: this.dataStore.awaitingSync().has(task.id),
        };
  });

  /** The Tasks triaged or dropped here that have left the Inbox. */
  protected readonly handled = computed(() => {
    const inboxIds = new Set(this.inbox().map((task) => task.id));

    return [...this.#handledIds()].filter((id) => !inboxIds.has(id)).length;
  });

  /** The single Current Area, which a card opens with when its Task has no Area. */
  readonly #proposedAreaId = computed<string | null>(() => {
    const current = this.dataStore.currentArea();

    return current !== null && current.areaIds.length === 1 ? current.areaIds[0] : null;
  });

  protected readonly draftState = linkedSignal<string | undefined, TriageDraft>({
    source: () => this.#card()?.id,
    computation: (id, previous) =>
      previous !== undefined && previous.source === id
        ? previous.value
        : untracked(() => draftOf(this.#card(), this.#proposedAreaId())),
  });

  protected readonly cardBusy = computed(() => {
    const id = this.#card()?.id;

    return id !== undefined && this.#attempts.busy(id);
  });

  protected async triage(draft: TriageDraft): Promise<void> {
    const task = this.#card();

    if (
      task === null ||
      this.cardBusy() ||
      draft.important === null ||
      draft.estimateMinutes === null
    ) {
      return;
    }

    this.statusLine.set('');

    const command: Command = {
      _tag: CommandTag.TriageTask,
      taskId: task.id,
      important: draft.important,
      estimateMinutes: draft.estimateMinutes,
      expect: { status: TaskStatus.Open },
      ...(draft.areaId === task.areaId ? {} : { areaId: draft.areaId }),
    };

    await this.#runForCard(task.id, command);
  }

  protected async drop(): Promise<void> {
    const task = this.#card();

    if (task === null || this.cardBusy()) {
      return;
    }

    this.statusLine.set('');

    const command: Command = {
      _tag: CommandTag.DropTask,
      taskId: task.id,
      expect: { status: TaskStatus.Open },
    };

    await this.#runForCard(task.id, command);
  }

  protected later(taskId: string): void {
    this.#deferred.set(new Set([...this.#effectiveDeferred(), taskId]));
    this.#focusCard();
  }

  protected edit(taskId: string): void {
    void this.#router.navigate(['/tasks', taskId]);
  }

  protected async dismiss(reviewItemId: string): Promise<void> {
    if (this.#attempts.busy(reviewItemId)) {
      return;
    }

    this.statusLine.set('');

    const index = this.reviews().findIndex((review) => review.id === reviewItemId);
    const command: Command = { _tag: CommandTag.ResolveReviewItem, reviewItemId };

    const outcome = await this.#attempts.send(command);

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      afterNextRender(() => this.template()?.focusReview(index), { injector: this.#injector });
    } else {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
    }
  }

  /** Sends a Triage or Drop for the card's Task and handles its outcome. */
  async #runForCard(taskId: string, command: Command): Promise<void> {
    const outcome = await this.#attempts.send(command);

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.#handledIds.update((ids) => new Set([...ids, taskId]));
    }

    if (
      outcome._tag === CommandOutcomeTag.Applied ||
      outcome._tag === CommandOutcomeTag.NotApplicable
    ) {
      this.#focusCard();
    }

    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
    }
  }

  /** After the next render, moves focus to the card's title, or to the heading when no card is left. */
  #focusCard(): void {
    afterNextRender(() => this.template()?.focusCard(), { injector: this.#injector });
  }
}
