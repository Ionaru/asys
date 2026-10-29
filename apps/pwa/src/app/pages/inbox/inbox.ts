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
  explainTask,
  inboxTasks,
  openReviewItems,
  type Task,
  TaskExplanationTag,
  TaskStatus,
  toLocalDateTime,
} from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { byAreaName } from '../../core/data/area-order';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus, zoneOrUtc } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { TaskBlockerActions } from '../../core/data/task-blocker-actions';
import {
  buildSavePatch,
  committedOf,
  draftOf,
  TASK_DRAFT_FIELDS,
  type TaskDraft,
} from '../../core/data/task-patch';
import { previewTask } from '../../core/data/task-preview';
import { UndoWindow } from '../../core/data/undo-window';
import { Clock } from '../../core/platform/clock';
import {
  type InboxCard,
  type InboxReview,
  InboxTemplate,
} from '../../components/templates/inbox-template/inbox-template';
import type { AreaChoice, TriageReason } from '../../components/organisms/triage-card/triage-card';
import { quadrantWord } from '../../components/support/quadrant-word';
import { reviewCopy } from './review-copy';
import { triageCommand } from './triage-command';

const NO_IDS: ReadonlySet<string> = new Set();

const NO_CHANGES: ReadonlyMap<string, Partial<TaskDraft>> = new Map();

/** The draft the template holds while there is no card. */
const EMPTY_DRAFT: TaskDraft = {
  title: '',
  notes: '',
  areaId: '',
  important: null,
  estimateMinutes: null,
  availableFrom: null,
  due: null,
};

/** The fields the reason line reads, so typing a Title or Notes does not explain the Task again. */
const PREVIEW_KEYS = ['important', 'estimateMinutes', 'areaId', 'availableFrom', 'due'] as const;

const areaChoices = (state: DomainState): readonly AreaChoice[] =>
  state.areas.map((area) => ({ id: area.id, name: area.name })).sort(byAreaName);

/**
 * Where captured Tasks wait for Triage, oldest first, and where ASYS asks for decisions. The card's
 * edits stay on the page, per Task, until Triage carries them or Open in the editor saves them.
 */
@Component({
  selector: 'app-inbox',
  imports: [InboxTemplate],
  providers: [CommandAttempts, TaskBlockerActions],
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
      [today]="today()"
      [cardBusy]="cardBusy()"
      [attempts]="attempts()"
      [reason]="reason()"
      [handled]="handled()"
      [empty]="reviews().length === 0 && inbox().length === 0"
      [blockedBy]="blockers.blockedBy()"
      [blocks]="blockers.blocks()"
      [candidates]="blockers.candidates()"
      [blockerMessage]="blockers.message()"
      [blockerAdding]="blockers.adding()"
      [blockersBusy]="cardBusy()"
      [(blockerFilter)]="blockers.filter"
      [draft]="draft()"
      (draftChange)="draftChange($event)"
      (retry)="dataStore.refresh()"
      (dismiss)="dismiss($event)"
      (triage)="triage($event)"
      (dropTask)="drop($event)"
      (openEditor)="openEditor($event)"
      (addBlocker)="addBlocker($event)"
      (removeBlocker)="removeBlocker($event)"
    />
  `,
})
export class Inbox {
  protected readonly dataStore = inject(DataStore);

  protected readonly blockers = inject(TaskBlockerActions);

  readonly #commands = inject(CommandAttempts);

  readonly #undoWindow = inject(UndoWindow);

  readonly #clock = inject(Clock);

  readonly #router = inject(Router);

  readonly #injector = inject(Injector);

  readonly #destroyRef = inject(DestroyRef);

  protected readonly Status = SyncStatus;

  private readonly template = viewChild(InboxTemplate);

  protected readonly statusLine = signal('');

  /** The Tasks triaged or dropped in this visit. */
  readonly #handledIds = signal<ReadonlySet<string>>(NO_IDS);

  /** The fields the person changed on each card in this visit, by Task id. */
  readonly #changes = signal<ReadonlyMap<string, Partial<TaskDraft>>>(NO_CHANGES);

  protected readonly inbox = computed<readonly Task[]>(() => {
    const state = this.dataStore.state();

    return state === null ? [] : inboxTasks(state);
  });

  /** The card's Task: the oldest Inbox Task. */
  readonly #task = computed<Task | null>(() => this.inbox()[0] ?? null);

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
        busy: this.#commands.busy(item.id),
        awaitingSync: waiting.has(item.id),
      };
    });
  });

  protected readonly areas = computed<readonly AreaChoice[]>(() => {
    const state = this.dataStore.state();

    return state === null ? [] : areaChoices(state);
  });

  readonly #timeZone = computed(() => zoneOrUtc(this.dataStore.state()?.settings.timeZone));

  protected readonly today = computed(
    () => toLocalDateTime(this.#clock.now(), this.#timeZone()).date,
  );

  protected readonly card = computed<InboxCard | null>(() => {
    const task = this.#task();

    if (task === null) {
      return null;
    }

    const text = task.captureText.trim();

    return {
      id: task.id,
      capturedText: text !== '' && text !== task.title ? task.captureText : null,
      awaitingSync: this.dataStore.awaitingSync().has(task.id),
    };
  });

  /** The Tasks handled in this visit that are not in the Inbox now; an Undo brings one back. */
  protected readonly handled = computed(() => {
    const inboxIds = new Set(this.inbox().map((task) => task.id));

    return [...this.#handledIds()].filter((id) => !inboxIds.has(id)).length;
  });

  /** The single Current Area, which a card proposes when its Task has no Area. */
  readonly #currentAreaId = computed<string | null>(() => {
    const current = this.dataStore.currentArea();

    return current !== null && current.areaIds.length === 1 ? current.areaIds[0] : null;
  });

  /** The proposal, read once for each card, so a later change of the Current Area leaves the card alone. */
  readonly #proposedAreaId = linkedSignal<string | undefined, string | null>({
    source: () => this.#task()?.id,
    computation: () => untracked(() => this.#currentAreaId()),
  });

  /** The stored Task as a draft, with the proposed Area when it has none. */
  readonly #storedDraft = computed<TaskDraft | null>(() => {
    const task = this.#task();

    if (task === null) {
      return null;
    }

    const stored = draftOf(task);
    const proposed = this.#proposedAreaId();

    return task.areaId === null && proposed !== null ? { ...stored, areaId: proposed } : stored;
  });

  /** The card's draft: the stored Task overlaid with the fields the person changed on it. */
  protected readonly draft = computed<TaskDraft>(() => {
    const stored = this.#storedDraft();
    const task = this.#task();

    return stored === null || task === null
      ? EMPTY_DRAFT
      : { ...stored, ...this.#changes().get(task.id) };
  });

  /** The fields the reason line reads; equal while only the Title or Notes change. */
  readonly #previewDraft = computed(() => this.draft(), {
    equal: (a, b) => PREVIEW_KEYS.every((key) => TASK_DRAFT_FIELDS.same(key, a, b)),
  });

  /** Refused Triage taps on the card's Task; 0 again for each new card. */
  protected readonly attempts = linkedSignal<string | undefined, number>({
    source: () => this.#task()?.id,
    computation: () => 0,
  });

  /** What Now would say about the Task as the card has it, once Importance and an Estimate are chosen. */
  protected readonly reason = computed<TriageReason | null>(() => {
    const state = this.dataStore.state();
    const task = this.#task();
    const draft = this.#previewDraft();

    if (
      state === null ||
      task === null ||
      draft.important === null ||
      draft.estimateMinutes === null
    ) {
      return null;
    }

    const preview = previewTask(task, draft);
    const tasks = state.tasks.map((other) => (other.id === preview.id ? preview : other));
    const explanation = explainTask(
      preview,
      tasks,
      state.links,
      { ...state.settings, timeZone: zoneOrUtc(state.settings.timeZone) },
      this.#clock.now(),
    );

    return explanation._tag === TaskExplanationTag.Available ||
      explanation._tag === TaskExplanationTag.Waiting
      ? { quadrant: explanation.reason.quadrant, text: explanation.reasonText }
      : null;
  });

  /** A send for the card's Task is in flight or awaits the server. */
  protected readonly cardBusy = computed(() => {
    const id = this.#task()?.id;

    return id !== undefined && this.#commands.busy(id);
  });

  constructor() {
    this.blockers.connect(
      () => this.#task()?.id ?? '',
      () => this.cardBusy(),
    );
  }

  /** Keeps the fields the person changed, so the others go on following the store. */
  protected draftChange(next: TaskDraft): void {
    const task = this.#task();

    if (task === null) {
      return;
    }

    const shown = this.draft();
    const changed: Partial<Record<keyof TaskDraft, unknown>> = {};

    for (const key of TASK_DRAFT_FIELDS.keys) {
      if (!TASK_DRAFT_FIELDS.same(key, shown, next)) {
        changed[key] = next[key];
      }
    }

    this.#changes.update((all) =>
      new Map(all).set(task.id, { ...all.get(task.id), ...(changed as Partial<TaskDraft>) }),
    );
  }

  /** Holds the Triage through the Undo window, or counts a refused tap while a field is missing. */
  protected triage(taskId: string): void {
    const task = this.#task();

    if (task === null || task.id !== taskId || this.cardBusy()) {
      return;
    }

    const command = triageCommand(task, this.draft());
    const reason = this.reason();

    if (command === null || reason === null) {
      this.attempts.update((count) => count + 1);
      return;
    }

    this.statusLine.set('');
    this.#undoWindow.triage(
      { ...task, title: command.title ?? task.title },
      command,
      quadrantWord(reason.quadrant),
    );
    this.#handled(task.id);
  }

  /** Holds a Drop of the stored Task through the Undo window; the card's edits are not saved. */
  protected drop(taskId: string): void {
    const task = this.#task();

    if (task === null || task.id !== taskId || this.cardBusy()) {
      return;
    }

    this.statusLine.set('');
    this.#undoWindow.drop(task);
    this.#handled(task.id);
  }

  /** Saves the person's changes as one EditTask, then opens the Task; a failure stays with its message. */
  protected async openEditor(taskId: string): Promise<void> {
    const task = this.#task();

    if (task === null || task.id !== taskId || this.cardBusy()) {
      return;
    }

    this.statusLine.set('');

    const stored = draftOf(task);
    const edited = { ...stored, ...this.#changes().get(task.id) };
    const patch = buildSavePatch(stored, edited, committedOf(edited));

    if (Object.keys(patch).length > 0) {
      const outcome = await this.#commands.send({
        _tag: CommandTag.EditTask,
        taskId: task.id,
        patch,
        expect: { status: TaskStatus.Open },
      });

      if (this.#destroyRef.destroyed) {
        return;
      }

      if (outcome._tag !== CommandOutcomeTag.Applied) {
        this.statusLine.set(outcomeMessage(outcome) ?? '');
        return;
      }
    }

    void this.#router.navigate(['/tasks', task.id]);
  }

  /** Makes a Task a blocker; on Applied, focus returns to the Find a Task field. */
  protected async addBlocker(blockerId: string): Promise<void> {
    if (await this.blockers.add(blockerId)) {
      this.#afterRender((template) => template.focusBlockerFilter());
    }
  }

  /** Removes a blocker; on Applied, focus moves to the Remove button now at its place. */
  protected async removeBlocker(linkId: string): Promise<void> {
    const index = this.blockers.blockedBy().findIndex((row) => row.linkId === linkId);

    if (await this.blockers.remove(linkId)) {
      this.#afterRender((template) => template.focusBlockerRemove(index));
    }
  }

  protected async dismiss(reviewItemId: string): Promise<void> {
    if (this.#commands.busy(reviewItemId)) {
      return;
    }

    this.statusLine.set('');

    const index = this.reviews().findIndex((review) => review.id === reviewItemId);
    const command: Command = { _tag: CommandTag.ResolveReviewItem, reviewItemId };

    const outcome = await this.#commands.send(command);

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.#afterRender((template) => template.focusReview(index));
    } else {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
    }
  }

  /** Counts the Task as handled and, after the next render, focuses the next card or the heading. */
  #handled(taskId: string): void {
    this.#handledIds.update((ids) => new Set([...ids, taskId]));
    this.#afterRender((template) => template.focusCard());
  }

  /** After the next render, runs a focus method of the template. */
  #afterRender(focus: (template: InboxTemplate) => void): void {
    afterNextRender(
      () => {
        const template = this.template();

        if (template !== undefined) {
          focus(template);
        }
      },
      { injector: this.#injector },
    );
  }
}
