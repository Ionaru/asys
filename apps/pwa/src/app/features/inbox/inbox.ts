// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  type Command,
  CommandTag,
  type DomainState,
  inboxTasks,
  openReviewItems,
  type Task,
  TaskStatus,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Button, ButtonSize, ButtonVariant } from '../../ui/button/button';
import { LoadState } from '../../ui/load-state/load-state';
import { ReviewItem, ReviewItemActionKind } from '../../ui/review-item/review-item';
import { SyncNote } from '../../ui/sync-note/sync-note';
import { type AreaChoice, TriageCard, type TriageDraft } from '../../ui/triage-card/triage-card';
import { byAreaName } from '../areas/area-order';
import { reviewCopy } from './review-copy';

const NO_IDS: ReadonlySet<string> = new Set();

const EMPTY_DRAFT: TriageDraft = { important: null, estimateMinutes: null, areaId: null };

const draftOf = (task: Task | null): TriageDraft =>
  task === null
    ? EMPTY_DRAFT
    : { important: task.important, estimateMinutes: task.estimateMinutes, areaId: task.areaId };

const areaChoices = (state: DomainState): readonly AreaChoice[] =>
  state.areas.map((area) => ({ id: area.id, name: area.name })).sort(byAreaName);

/** Where captured Tasks wait for Triage, and where ASYS asks for decisions. */
@Component({
  selector: 'app-inbox',
  imports: [Button, LoadState, ReviewItem, RouterLink, SyncNote, TriageCard],
  providers: [CommandAttempts],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.css',
})
export class Inbox {
  protected readonly dataStore = inject(DataStore);

  private readonly attempts = inject(CommandAttempts);

  private readonly router = inject(Router);

  private readonly injector = inject(Injector);

  private readonly destroyRef = inject(DestroyRef);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly dismissActions = [{ label: 'Dismiss', kind: ReviewItemActionKind.Secondary }];

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  private readonly triageCard = viewChild(TriageCard);

  private readonly reviewItems = viewChildren(ReviewItem);

  protected readonly statusLine = signal('');

  /** The ids of the Tasks with a Triage or Drop send in flight. */
  private readonly pendingTaskIds = signal<ReadonlySet<string>>(NO_IDS);

  /** The ids of the Review items with a Dismiss send in flight. */
  private readonly pendingReviewIds = signal<ReadonlySet<string>>(NO_IDS);

  private readonly deferred = signal<ReadonlySet<string>>(NO_IDS);

  private readonly handledIds = signal<ReadonlySet<string>>(NO_IDS);

  protected readonly inbox = computed<readonly Task[]>(() => {
    const state = this.dataStore.state();

    return state === null ? [] : inboxTasks(state);
  });

  protected readonly reviewRows = computed(() => {
    const state = this.dataStore.state();

    return state === null
      ? []
      : openReviewItems(state).map((item) => ({ item, copy: reviewCopy(item, state) }));
  });

  protected readonly areas = computed<readonly AreaChoice[]>(() => {
    const state = this.dataStore.state();

    return state === null ? [] : areaChoices(state);
  });

  /** The deferred ids, or none when every Inbox Task is deferred, so the oldest comes back. */
  private readonly effectiveDeferred = computed(() => {
    const deferred = this.deferred();

    return this.inbox().some((task) => !deferred.has(task.id)) ? deferred : NO_IDS;
  });

  private readonly card = computed<Task | null>(() => {
    const deferred = this.effectiveDeferred();

    return this.inbox().find((task) => !deferred.has(task.id)) ?? null;
  });

  protected readonly cardTasks = computed<readonly Task[]>(() => {
    const card = this.card();

    return card === null ? [] : [card];
  });

  /** The Tasks triaged or dropped here that have left the Inbox. */
  protected readonly handled = computed(() => {
    const inboxIds = new Set(this.inbox().map((task) => task.id));

    return [...this.handledIds()].filter((id) => !inboxIds.has(id)).length;
  });

  protected readonly draftState = linkedSignal<string | undefined, TriageDraft>({
    source: () => this.card()?.id,
    computation: (id, previous) =>
      previous !== undefined && previous.source === id
        ? previous.value
        : untracked(() => draftOf(this.card())),
  });

  protected readonly cardBusy = computed(() => {
    const id = this.card()?.id;

    return (
      id !== undefined && (this.pendingTaskIds().has(id) || this.dataStore.awaitingSync().has(id))
    );
  });

  /** Whether this Review item's Dismiss is pending or waits for the server. */
  protected reviewBusy(id: string): boolean {
    return this.pendingReviewIds().has(id) || this.dataStore.awaitingSync().has(id);
  }

  protected async triage(draft: TriageDraft): Promise<void> {
    const task = this.card();

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

    await this.runForCard(task.id, command);
  }

  protected async drop(): Promise<void> {
    const task = this.card();

    if (task === null || this.cardBusy()) {
      return;
    }

    this.statusLine.set('');

    const command: Command = {
      _tag: CommandTag.DropTask,
      taskId: task.id,
      expect: { status: TaskStatus.Open },
    };

    await this.runForCard(task.id, command);
  }

  protected later(taskId: string): void {
    this.deferred.set(new Set([...this.effectiveDeferred(), taskId]));
    this.focusCard();
  }

  protected edit(taskId: string): void {
    void this.router.navigate(['/tasks', taskId]);
  }

  protected async dismiss(reviewItemId: string): Promise<void> {
    if (this.reviewBusy(reviewItemId)) {
      return;
    }

    this.statusLine.set('');

    const index = this.reviewRows().findIndex((row) => row.item.id === reviewItemId);
    const command: Command = { _tag: CommandTag.ResolveReviewItem, reviewItemId };

    this.pendingReviewIds.update((ids) => new Set([...ids, reviewItemId]));

    let outcome: CommandOutcome;

    try {
      outcome = await this.attempts.send(command);
    } finally {
      this.pendingReviewIds.update((ids) => new Set([...ids].filter((id) => id !== reviewItemId)));
    }

    if (this.destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      afterNextRender(
        () => {
          const next = this.reviewItems()[index];

          if (next === undefined) {
            this.heading()?.nativeElement.focus();
          } else {
            next.focus();
          }
        },
        { injector: this.injector },
      );
    } else {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
    }
  }

  /** Sends a Triage or Drop for the card's Task and handles its outcome. */
  private async runForCard(taskId: string, command: Command): Promise<void> {
    this.pendingTaskIds.update((ids) => new Set([...ids, taskId]));

    let outcome: CommandOutcome;

    try {
      outcome = await this.attempts.send(command);
    } finally {
      this.pendingTaskIds.update((ids) => new Set([...ids].filter((id) => id !== taskId)));
    }

    if (this.destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.handledIds.update((ids) => new Set([...ids, taskId]));
    }

    if (
      outcome._tag === CommandOutcomeTag.Applied ||
      outcome._tag === CommandOutcomeTag.NotApplicable
    ) {
      this.focusCard();
    }

    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
    }
  }

  /** After the next render, moves focus to the card's title, or to the heading when no card is left. */
  private focusCard(): void {
    afterNextRender(
      () => {
        const card = this.triageCard();

        if (card === undefined) {
          this.heading()?.nativeElement.focus();
        } else {
          card.focusTitle();
        }
      },
      { injector: this.injector },
    );
  }
}
