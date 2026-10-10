// SPDX-License-Identifier: EUPL-1.2
import { Location, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { disabled, form, FormField, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import {
  type AddBlocker,
  blockerCandidates,
  blocks,
  canLogProgress,
  type Command,
  CommandTag,
  type DomainState,
  dueInstant,
  effectiveDue,
  formatClock,
  isBlocked,
  isInInbox,
  isOverdue,
  latestStart,
  type Task,
  TaskStatus,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus, zoneOrUtc } from '../../core/data/data-store';
import { DoneOrigin, DoneUndo } from '../../core/data/done-undo';
import { followStore, settleSaved } from '../../core/data/draft-follow';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { Ids } from '../../core/platform/ids';
import { TaskMorph } from '../../core/platform/task-morph';
import { activationOf } from '../../ui/activation/activation';
import { Button, ButtonSize, ButtonVariant } from '../../ui/button/button';
import { DateSpecField } from '../../ui/date-spec-field/date-spec-field';
import { EstimateField } from '../../ui/estimate-field/estimate-field';
import { IconName } from '../../ui/icon/icon';
import { InlineConfirm } from '../../ui/inline-confirm/inline-confirm';
import { LoadState } from '../../ui/load-state/load-state';
import {
  estimateNowText,
  LogProgressForm,
  logProgressCommand,
} from '../../ui/log-progress-form/log-progress-form';
import { Segmented } from '../../ui/segmented/segmented';
import { areaSelectOptions } from '../../ui/select-field/area-options';
import { SelectField } from '../../ui/select-field/select-field';
import { StatusBadge, StatusBadgeStatus } from '../../ui/status-badge/status-badge';
import { SyncNote } from '../../ui/sync-note/sync-note';
import { TextField } from '../../ui/text-field/text-field';
import { byAreaName } from '../areas/area-order';
import { buildTaskPatch, draftOf, TASK_DRAFT_FIELDS, type TaskDraft } from './task-patch';

const NO_IDS: ReadonlySet<string> = new Set();

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  notes: '',
  areaId: '',
  important: null,
  estimateMinutes: null,
  availableFrom: null,
  due: null,
};

/** The stored Task and the state it was read from, as the editor renders them. */
interface EditorView {
  readonly state: DomainState;
  readonly task: Task;
}

/** Edits every field of one Task, shows its derived state, and runs its actions and blocker links. */
@Component({
  selector: 'asys-task-editor',
  imports: [
    Button,
    DateSpecField,
    EstimateField,
    FormField,
    InlineConfirm,
    LoadState,
    LogProgressForm,
    NgTemplateOutlet,
    RouterLink,
    Segmented,
    SelectField,
    StatusBadge,
    SyncNote,
    TextField,
  ],
  providers: [CommandAttempts],
  templateUrl: './task-editor.component.html',
  styleUrl: './task-editor.css',
})
export class TaskEditor {
  readonly taskId = input.required<string>();

  protected readonly dataStore = inject(DataStore);

  readonly #clock = inject(Clock);

  readonly #ids = inject(Ids);

  readonly #taskMorph = inject(TaskMorph);

  readonly #attempts = inject(CommandAttempts);

  readonly #doneUndo = inject(DoneUndo);

  readonly #router = inject(Router);

  readonly #location = inject(Location);

  readonly #injector = inject(Injector);

  readonly #destroyRef = inject(DestroyRef);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly Icons = IconName;

  protected readonly Badge = StatusBadgeStatus;

  protected readonly TaskStatuses = TaskStatus;

  private readonly headingElement = viewChild<ElementRef<HTMLElement>>('heading');

  private readonly logButton = viewChild('logButton', { read: ElementRef<HTMLElement> });

  private readonly dropButton = viewChild('dropButton', { read: ElementRef<HTMLElement> });

  private readonly addBlockerButton = viewChild('addBlockerButton', {
    read: ElementRef<HTMLElement>,
  });

  protected readonly statusLine = signal('');

  protected readonly blockerMessage = signal('');

  /**
   * Set before a Done or Drop leaves. A Done holds the Task and leaves at once, so it stays true; a Drop
   * clears it again when its outcome is not Applied.
   */
  protected readonly leaving = signal(false);

  /** Whether a Save, Done, Drop or Log progress send is in flight. */
  readonly #actionPending = signal(false);

  readonly #removingIds = signal<ReadonlySet<string>>(NO_IDS);

  /** Whether an Add blocker send is in flight; only one runs at a time. */
  readonly #adding = signal(false);

  /** The AddBlocker commands still being tried, by blocker id, so a retry reuses its linkId. */
  readonly #addCommands = new Map<string, AddBlocker>();

  protected readonly logOpen = signal(false);

  protected readonly confirmingDrop = signal(false);

  protected readonly pickerOpen = signal(false);

  protected readonly filter = signal('');

  readonly #task = computed<Task | undefined>(() =>
    this.dataStore.state()?.tasks.find((task) => task.id === this.taskId()),
  );

  /** The stored Task to render; while leaving, the last one rendered stays. */
  protected readonly view = linkedSignal<
    { state: DomainState | null; task: Task | undefined; leaving: boolean },
    EditorView | null
  >({
    source: () => ({
      state: this.dataStore.state(),
      task: this.#task(),
      leaving: this.leaving(),
    }),
    computation: (source, previous) => {
      if (source.state !== null && source.task !== undefined) {
        return { state: source.state, task: source.task };
      }

      return source.leaving ? (previous?.value ?? null) : null;
    },
  });

  protected readonly headingText = linkedSignal<Task | undefined, string>({
    source: () => this.#task(),
    computation: (task, previous) => task?.title ?? previous?.value ?? 'Task',
  });

  /** Whether the running view transition morphs this Task's title. */
  protected readonly morph = computed(() => this.#taskMorph.taskId() === this.taskId());

  readonly #baseline = signal<TaskDraft | null>(null);

  readonly #model = signal<TaskDraft>(EMPTY_DRAFT);

  /** The stored status when the baseline was first set. */
  #expectedStatus: TaskStatus = TaskStatus.Open;

  readonly #patch = computed(() => {
    const baseline = this.#baseline();

    return baseline === null ? {} : buildTaskPatch(baseline, this.#model());
  });

  protected readonly dirty = computed(() => Object.keys(this.#patch()).length > 0);

  /** The Task is missing and the form is dirty: the form stays visible but cannot change. */
  readonly #readOnly = computed(
    () => this.view() === null && this.dataStore.state() !== null && this.dirty(),
  );

  protected readonly editForm = form(this.#model, (path) => {
    validate(path.title, ({ value }) =>
      value().trim() === '' ? { kind: 'required', message: 'Needs a title' } : undefined,
    );
    disabled(path, { when: () => this.#readOnly() });
  });

  protected readonly needsTitle = computed(() => this.#model().title.trim() === '');

  protected readonly needsEstimate = computed(() => {
    const baseline = this.#baseline();

    return (
      baseline !== null &&
      baseline.estimateMinutes !== null &&
      this.#model().estimateMinutes === null
    );
  });

  protected readonly needsImportance = computed(() => {
    const baseline = this.#baseline();

    return baseline !== null && baseline.important !== null && this.#model().important === null;
  });

  /** Whether Save, Done, Drop and Log progress are unavailable right now. */
  protected readonly actionsBusy = computed(
    () =>
      this.#actionPending() || this.leaving() || this.dataStore.awaitingSync().has(this.taskId()),
  );

  protected readonly canSave = computed(
    () =>
      this.#baseline() !== null &&
      !this.#readOnly() &&
      this.dirty() &&
      !this.needsTitle() &&
      !this.needsEstimate() &&
      !this.needsImportance() &&
      !this.actionsBusy(),
  );

  protected readonly areaOptions = computed(() =>
    areaSelectOptions([...(this.dataStore.state()?.areas ?? [])].sort(byAreaName)),
  );

  readonly #timeZone = computed(() => zoneOrUtc(this.view()?.state.settings.timeZone));

  protected readonly overdue = computed(() => {
    const view = this.view();

    return view !== null && isOverdue(view.task, this.#clock.now(), this.#timeZone());
  });

  protected readonly blocked = computed(() => {
    const view = this.view();

    return view !== null && isBlocked(view.task, view.state.tasks, view.state.links);
  });

  protected readonly inInbox = computed(() => {
    const view = this.view();

    return view !== null && isInInbox(view.task);
  });

  /** Latest start and Effective due, when the Effective due differs from the Task's own Due. */
  protected readonly deadlines = computed(() => {
    const view = this.view();

    if (view === null) {
      return null;
    }

    const { task, state } = view;
    const zone = this.#timeZone();
    const effective = effectiveDue(task, state.tasks, state.links, zone);
    const own = task.due === null ? null : dueInstant(task.due, zone);

    if (effective === null || effective === own) {
      return null;
    }

    const now = this.#clock.now();
    const start = latestStart(task, state.tasks, state.links, zone);

    return {
      latestStart: start === null ? null : formatClock(start, now, zone),
      effectiveDue: formatClock(effective, now, zone),
    };
  });

  protected readonly capturedText = computed(() => {
    const task = this.view()?.task;

    if (task === undefined) {
      return null;
    }

    const text = task.captureText.trim();

    return text !== '' && text !== task.title ? task.captureText : null;
  });

  protected readonly canLogProgress = computed(() => canLogProgress(this.view()?.task));

  protected readonly blockedBy = computed(() => {
    const view = this.view();

    if (view === null) {
      return [];
    }

    return view.state.links
      .filter((link) => link.taskId === view.task.id)
      .map((link) => ({
        linkId: link.id,
        title:
          view.state.tasks.find((task) => task.id === link.blockerId)?.title ??
          'A Task that is no longer open',
      }));
  });

  protected readonly blocksTasks = computed<readonly Task[]>(() => {
    const view = this.view();

    return view === null ? [] : blocks(view.task, view.state.tasks, view.state.links);
  });

  protected readonly candidates = computed<readonly Task[]>(() => {
    const view = this.view();

    if (view === null) {
      return [];
    }

    const needle = this.filter().toLowerCase();

    return blockerCandidates(view.task, view.state.tasks, view.state.links).filter((task) =>
      task.title.toLowerCase().includes(needle),
    );
  });

  protected readonly addBusy = computed(
    () => this.#adding() || this.leaving() || this.dataStore.awaitingSync().has(this.taskId()),
  );

  constructor() {
    effect(() => {
      const task = this.#task();

      untracked(() => this.#follow(task));
    });
  }

  /** Whether this link's Remove is pending or waits for the server. */
  protected removeBusy(linkId: string): boolean {
    return (
      this.leaving() || this.#removingIds().has(linkId) || this.dataStore.awaitingSync().has(linkId)
    );
  }

  protected async save(): Promise<void> {
    const baseline = this.#baseline();

    if (baseline === null || !this.canSave()) {
      return;
    }

    this.#clearMessages();

    const sent = this.#model();
    const command: Command = {
      _tag: CommandTag.EditTask,
      taskId: this.taskId(),
      patch: buildTaskPatch(baseline, sent),
      expect: { status: this.#expectedStatus },
    };
    const outcome = await this.#runAction(command);

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
      return;
    }

    const task = this.#task();

    if (task !== undefined) {
      const stored = draftOf(task);

      this.#baseline.set(stored);

      if (!this.dataStore.awaitingSync().has(task.id)) {
        this.#model.set(settleSaved(TASK_DRAFT_FIELDS, sent, this.#model(), stored));
      }
    }

    this.statusLine.set('Saved.');
  }

  /** Holds the Task through DoneUndo and leaves at once; the send happens when its Undo window ends. */
  protected done(event: MouseEvent): void {
    const task = this.#task();

    if (this.actionsBusy() || task === undefined) {
      return;
    }

    this.#clearMessages();
    this.leaving.set(true);
    this.#doneUndo.complete(task, DoneOrigin.Button);

    if (activationOf(event).keyboard) {
      this.#doneUndo.requestFocus();
    }

    this.#leave();
  }

  /** Sends a Drop; Applied leaves the editor, anything else stays with its message. */
  protected async drop(): Promise<void> {
    if (this.actionsBusy()) {
      return;
    }

    this.#clearMessages();
    this.leaving.set(true);

    const outcome = await this.#runAction({
      _tag: CommandTag.DropTask,
      taskId: this.taskId(),
      expect: { status: TaskStatus.Open },
    });

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.#leave();
      return;
    }

    this.leaving.set(false);
    this.statusLine.set(outcomeMessage(outcome) ?? '');
  }

  protected cancelDrop(): void {
    this.confirmingDrop.set(false);
    this.#focusAfterRender(() => this.dropButton()?.nativeElement);
  }

  protected async logProgress(minutes: number): Promise<void> {
    if (this.actionsBusy()) {
      return;
    }

    this.#clearMessages();

    const outcome = await this.#runAction(logProgressCommand(this.taskId(), minutes));

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
      return;
    }

    this.statusLine.set(estimateNowText(minutes));
    this.logOpen.set(false);
    this.#focusAfterRender(() => this.logButton()?.nativeElement);
  }

  protected cancelLogProgress(): void {
    this.logOpen.set(false);
    this.#focusAfterRender(() => this.logButton()?.nativeElement);
  }

  protected async removeBlocker(linkId: string): Promise<void> {
    if (this.removeBusy(linkId)) {
      return;
    }

    this.#clearMessages();
    this.#removingIds.update((ids) => new Set([...ids, linkId]));

    let outcome: CommandOutcome;

    try {
      outcome = await this.#attempts.send({ _tag: CommandTag.RemoveBlocker, linkId });
    } finally {
      this.#removingIds.update((ids) => new Set([...ids].filter((id) => id !== linkId)));
    }

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.#focusAfterRender(() => this.addBlockerButton()?.nativeElement);
    } else {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
    }
  }

  protected async addBlocker(blockerId: string): Promise<void> {
    if (this.addBusy()) {
      return;
    }

    this.#clearMessages();

    const command: AddBlocker = this.#addCommands.get(blockerId) ?? {
      _tag: CommandTag.AddBlocker,
      linkId: this.#ids.next(),
      taskId: this.taskId(),
      blockerId,
    };

    this.#addCommands.set(blockerId, command);
    this.#adding.set(true);

    let outcome: CommandOutcome;

    try {
      outcome = await this.#attempts.send(command);
    } finally {
      this.#adding.set(false);
    }

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag !== CommandOutcomeTag.Failed) {
      this.#addCommands.delete(blockerId);
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.closePicker();
    } else {
      this.blockerMessage.set(outcomeMessage(outcome) ?? '');
    }
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.#focusAfterRender(() => this.addBlockerButton()?.nativeElement);
  }

  /** Sets the baseline when the Task first appears, then follows the store field by field. */
  #follow(task: Task | undefined): void {
    if (task === undefined) {
      return;
    }

    const stored = draftOf(task);
    const baseline = this.#baseline();

    if (baseline === null) {
      this.#expectedStatus = task.status;
      this.#baseline.set(stored);
      this.#model.set(stored);
      return;
    }

    const next = followStore(TASK_DRAFT_FIELDS, baseline, this.#model(), stored);

    this.#baseline.set(next.baseline);
    this.#model.set(next.draft);
  }

  #leave(): void {
    if ((this.#router.lastSuccessfulNavigation()?.previousNavigation ?? null) !== null) {
      this.#location.back();
    } else {
      void this.#router.navigateByUrl('/now', { replaceUrl: true });
    }
  }

  /** Sends a Save, Done, Drop or Log progress and marks it pending meanwhile. */
  async #runAction(command: Command): Promise<CommandOutcome> {
    this.#actionPending.set(true);

    try {
      return await this.#attempts.send(command);
    } finally {
      this.#actionPending.set(false);
    }
  }

  #clearMessages(): void {
    this.statusLine.set('');
    this.blockerMessage.set('');
  }

  /** After the next render, focuses the element, or the heading when it is gone. */
  #focusAfterRender(target: () => HTMLElement | undefined): void {
    afterNextRender(() => (target() ?? this.headingElement()?.nativeElement)?.focus(), {
      injector: this.#injector,
    });
  }
}
