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
  type Command,
  CommandTag,
  type DateSpec,
  type DomainState,
  dueInstant,
  effectiveDue,
  formatClock,
  formatMinutes,
  isBlocked,
  isInInbox,
  isOverdue,
  isValidTimeZone,
  latestStart,
  sameDateSpec,
  type Task,
  TaskStatus,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { Ids } from '../../core/platform/ids';
import { Button, ButtonSize, ButtonVariant } from '../../ui/button/button';
import { DateSpecField } from '../../ui/date-spec-field/date-spec-field';
import { EstimateField } from '../../ui/estimate-field/estimate-field';
import { InlineConfirm } from '../../ui/inline-confirm/inline-confirm';
import { LogProgressForm } from '../../ui/log-progress-form/log-progress-form';
import { Segmented } from '../../ui/segmented/segmented';
import { type SelectOption, SelectField } from '../../ui/select-field/select-field';
import { StatusBadge, StatusBadgeStatus } from '../../ui/status-badge/status-badge';
import { TextField } from '../../ui/text-field/text-field';
import { buildTaskPatch, draftOf, type TaskDraft } from './task-patch';

const MIN_LOGGABLE_ESTIMATE = 2;

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

type DraftKey = keyof TaskDraft;

/** The stored Task and the state it was read from, as the editor renders them. */
interface EditorView {
  readonly state: DomainState;
  readonly task: Task;
}

const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sameSpec = (a: DateSpec | null, b: DateSpec | null): boolean =>
  a === null || b === null ? a === b : sameDateSpec(a, b);

const sameField = (key: DraftKey, a: TaskDraft, b: TaskDraft): boolean =>
  key === 'availableFrom' || key === 'due' ? sameSpec(a[key], b[key]) : a[key] === b[key];

/** A draft taking the stored value for each field `useStored` names, and its own value for the others. */
const mixDraft = (
  useStored: (key: DraftKey) => boolean,
  own: TaskDraft,
  stored: TaskDraft,
): TaskDraft => ({
  title: useStored('title') ? stored.title : own.title,
  notes: useStored('notes') ? stored.notes : own.notes,
  areaId: useStored('areaId') ? stored.areaId : own.areaId,
  important: useStored('important') ? stored.important : own.important,
  estimateMinutes: useStored('estimateMinutes') ? stored.estimateMinutes : own.estimateMinutes,
  availableFrom: useStored('availableFrom') ? stored.availableFrom : own.availableFrom,
  due: useStored('due') ? stored.due : own.due,
});

/** Edits every field of one Task, shows its derived state, and runs its actions and blocker links. */
@Component({
  selector: 'asys-task-editor',
  imports: [
    Button,
    DateSpecField,
    EstimateField,
    FormField,
    InlineConfirm,
    LogProgressForm,
    NgTemplateOutlet,
    RouterLink,
    Segmented,
    SelectField,
    StatusBadge,
    TextField,
  ],
  providers: [CommandAttempts],
  template: `
    <h1 #heading class="task-editor__title" tabindex="-1">{{ headingText() }}</h1>
    <p class="task-editor__status" role="status">{{ statusLine() }}</p>
    @if (view(); as v) {
      @if (overdue() || blocked()) {
        <p class="task-editor__badges">
          @if (overdue()) {
            <asys-status-badge [status]="Badge.Overdue" />
          }
          @if (blocked()) {
            <asys-status-badge [status]="Badge.Blocked" />
          }
        </p>
      }
      @if (inInbox()) {
        <p class="task-editor__line">In the Inbox until Triage</p>
      }
      @if (deadlines(); as d) {
        @if (d.latestStart !== null) {
          <p class="task-editor__line">Latest start {{ d.latestStart }}</p>
        }
        <p class="task-editor__line">Effective due {{ d.effectiveDue }}</p>
      }
      @if (capturedText(); as text) {
        <section class="task-editor__captured">
          <h2 class="task-editor__subtitle">Captured text</h2>
          <p class="task-editor__captured-text">{{ text }}</p>
        </section>
      }
      <ng-container [ngTemplateOutlet]="draftForm" />
      @if (v.task.status === TaskStatuses.Open) {
        <div class="asys-button-group task-editor__actions">
          <button
            asys-button
            type="button"
            [variant]="Variant.Secondary"
            [disabled]="actionsBusy()"
            (click)="done()"
          >
            Done
          </button>
          @if (canLogProgress()) {
            <button
              #logButton
              asys-button
              type="button"
              [variant]="Variant.Secondary"
              [disabled]="actionsBusy()"
              (click)="logOpen.set(true)"
            >
              Log progress
            </button>
          }
          <button
            #dropButton
            asys-button
            type="button"
            [variant]="Variant.Quiet"
            [disabled]="actionsBusy()"
            (click)="confirmingDrop.set(true)"
          >
            Drop
          </button>
        </div>
        @if (logOpen() && canLogProgress() && v.task.estimateMinutes !== null) {
          <asys-log-progress-form
            [estimateMinutes]="v.task.estimateMinutes"
            [busy]="actionsBusy()"
            (save)="logProgress($event)"
            (cancel)="cancelLogProgress()"
          />
        }
        @if (confirmingDrop()) {
          <asys-inline-confirm
            [message]="'Drop “' + v.task.title + '”? This cannot be undone.'"
            confirmLabel="Drop"
            [busy]="actionsBusy()"
            (confirm)="drop()"
            (cancel)="cancelDrop()"
          />
        }
      }
      @if (dataStore.awaitingSync().has(taskId())) {
        <p class="task-editor__sync">Saved. Waiting for the server.</p>
      }
      <section class="task-editor__section">
        <h2 class="task-editor__subtitle">Blocked by</h2>
        @if (blockedBy().length > 0) {
          <ul class="task-editor__list">
            @for (row of blockedBy(); track row.linkId) {
              <li class="task-editor__row">
                <span class="task-editor__row-title">{{ row.title }}</span>
                <button
                  asys-button
                  type="button"
                  [variant]="Variant.Quiet"
                  [size]="Size.Small"
                  [disabled]="removeBusy(row.linkId)"
                  (click)="removeBlocker(row.linkId)"
                >
                  Remove
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="task-editor__text">Waits for no other Task.</p>
        }
        <button
          #addBlockerButton
          asys-button
          type="button"
          [variant]="Variant.Secondary"
          [disabled]="addBusy()"
          (click)="pickerOpen.set(true)"
        >
          Add a blocker
        </button>
        <p class="task-editor__blocker-message" role="status">{{ blockerMessage() }}</p>
        @if (pickerOpen()) {
          <div class="task-editor__picker">
            <asys-text-field label="Find a Task" [(value)]="filter" />
            @if (candidates().length > 0) {
              <ul class="task-editor__list">
                @for (candidate of candidates(); track candidate.id) {
                  <li>
                    <button
                      asys-button
                      type="button"
                      [variant]="Variant.Quiet"
                      [disabled]="addBusy()"
                      (click)="addBlocker(candidate.id)"
                    >
                      {{ candidate.title }}
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <p class="task-editor__text">No Task matches.</p>
            }
            <button asys-button type="button" [variant]="Variant.Quiet" (click)="closePicker()">
              Close
            </button>
          </div>
        }
      </section>
      <section class="task-editor__section">
        <h2 class="task-editor__subtitle">Blocks</h2>
        @if (blocksTasks().length > 0) {
          <ul class="task-editor__list">
            @for (dependant of blocksTasks(); track dependant.id) {
              <li>
                <a class="task-editor__blocks-link" [routerLink]="['/tasks', dependant.id]">{{
                  dependant.title
                }}</a>
              </li>
            }
          </ul>
        } @else {
          <p class="task-editor__text">No Task waits for this one.</p>
        }
      </section>
    } @else if (dataStore.state() === null) {
      @if (dataStore.status() === Status.Failed) {
        <p role="alert">ASYS could not load your Tasks.</p>
        <button asys-button type="button" [variant]="Variant.Quiet" (click)="dataStore.refresh()">
          Try again
        </button>
      } @else {
        <p>Loading…</p>
      }
    } @else if (!leaving()) {
      <p class="task-editor__missing">This Task is no longer open.</p>
      <p class="task-editor__text"><a class="task-editor__link" routerLink="/now">Go to Now</a></p>
      @if (dirty()) {
        <ng-container [ngTemplateOutlet]="draftForm" />
      }
    }

    <ng-template #draftForm>
      <div class="task-editor__form">
        <asys-text-field [formField]="editForm.title" label="Title" />
        <asys-text-field [formField]="editForm.notes" label="Notes" [multiline]="true" />
        <asys-select-field [formField]="editForm.areaId" label="Area" [options]="areaOptions()" />
        <asys-segmented
          [formField]="editForm.important"
          legend="Importance"
          trueLabel="Important"
          falseLabel="Not important"
        />
        <asys-estimate-field [formField]="editForm.estimateMinutes" />
        <asys-date-spec-field [formField]="editForm.availableFrom" legend="Available from" />
        <asys-date-spec-field [formField]="editForm.due" legend="Due" />
        <div class="asys-button-group">
          <button
            asys-button
            type="button"
            [variant]="Variant.Primary"
            [disabled]="!canSave()"
            (click)="save()"
          >
            Save
          </button>
          @if (needsTitle()) {
            <p class="task-editor__reason">Needs a title</p>
          }
          @if (needsEstimate()) {
            <p class="task-editor__reason">Needs an Estimate</p>
          }
          @if (needsImportance()) {
            <p class="task-editor__reason">Needs an Importance</p>
          }
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    .task-editor__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .task-editor__status {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .task-editor__status:empty {
      margin: 0;
    }

    .task-editor__badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin: 0 0 var(--space-2);
    }

    .task-editor__line,
    .task-editor__reason,
    .task-editor__sync,
    .task-editor__blocker-message {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      color: var(--ink-muted);
    }

    .task-editor__reason,
    .task-editor__blocker-message:empty {
      margin: 0;
    }

    .task-editor__captured {
      margin: var(--space-3) 0;
      padding: var(--space-3);
      background: var(--sunken);
      border-radius: var(--radius-md);
    }

    .task-editor__captured-text {
      margin: 0;
      white-space: pre-wrap;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .task-editor__subtitle {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .task-editor__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      margin: var(--space-4) 0;
    }

    .task-editor__actions {
      margin: 0 0 var(--space-3);
    }

    .task-editor__section {
      margin: var(--space-4) 0 0;
    }

    .task-editor__list {
      margin: 0 0 var(--space-3);
      padding: 0;
      list-style: none;
    }

    .task-editor__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .task-editor__row-title {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .task-editor__blocks-link {
      display: flex;
      align-items: center;
      min-height: var(--tap-target);
    }

    .task-editor__link {
      display: inline-flex;
      align-items: center;
      min-height: var(--tap-target);
    }

    .task-editor__picker {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: var(--space-3) 0 0;
    }

    .task-editor__missing,
    .task-editor__text {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class TaskEditor {
  readonly taskId = input.required<string>();

  protected readonly dataStore = inject(DataStore);

  private readonly clock = inject(Clock);

  private readonly ids = inject(Ids);

  private readonly attempts = inject(CommandAttempts);

  private readonly router = inject(Router);

  private readonly location = inject(Location);

  private readonly injector = inject(Injector);

  private readonly destroyRef = inject(DestroyRef);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

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

  /** Set before a Done or Drop is sent, cleared when its outcome is not Applied. */
  protected readonly leaving = signal(false);

  /** Whether a Save, Done, Drop or Log progress send is in flight. */
  private readonly actionPending = signal(false);

  private readonly removingIds = signal<ReadonlySet<string>>(NO_IDS);

  private readonly addingIds = signal<ReadonlySet<string>>(NO_IDS);

  /** The AddBlocker commands still being tried, by blocker id, so a retry reuses its linkId. */
  private readonly addCommands = new Map<string, AddBlocker>();

  protected readonly logOpen = signal(false);

  protected readonly confirmingDrop = signal(false);

  protected readonly pickerOpen = signal(false);

  protected readonly filter = signal('');

  private readonly task = computed<Task | undefined>(() =>
    this.dataStore.state()?.tasks.find((task) => task.id === this.taskId()),
  );

  /** The stored Task to render; while leaving, the last one rendered stays. */
  protected readonly view = linkedSignal<
    { state: DomainState | null; task: Task | undefined; leaving: boolean },
    EditorView | null
  >({
    source: () => ({
      state: this.dataStore.state(),
      task: this.task(),
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
    source: () => this.task(),
    computation: (task, previous) => task?.title ?? previous?.value ?? 'Task',
  });

  private readonly baseline = signal<TaskDraft | null>(null);

  private readonly model = signal<TaskDraft>(EMPTY_DRAFT);

  /** The stored status when the baseline was first set. */
  private expectedStatus: TaskStatus = TaskStatus.Open;

  private readonly patch = computed(() => {
    const baseline = this.baseline();

    return baseline === null ? {} : buildTaskPatch(baseline, this.model());
  });

  protected readonly dirty = computed(() => Object.keys(this.patch()).length > 0);

  /** The Task is missing and the form is dirty: the form stays visible but cannot change. */
  private readonly readOnly = computed(
    () => this.view() === null && this.dataStore.state() !== null && this.dirty(),
  );

  protected readonly editForm = form(this.model, (path) => {
    validate(path.title, ({ value }) =>
      value().trim() === '' ? { kind: 'required', message: 'Needs a title' } : undefined,
    );
    disabled(path.title, { when: () => this.readOnly() });
    disabled(path.notes, { when: () => this.readOnly() });
    disabled(path.areaId, { when: () => this.readOnly() });
    disabled(path.important, { when: () => this.readOnly() });
    disabled(path.estimateMinutes, { when: () => this.readOnly() });
    disabled(path.availableFrom, { when: () => this.readOnly() });
    disabled(path.due, { when: () => this.readOnly() });
  });

  protected readonly needsTitle = computed(() => this.model().title.trim() === '');

  protected readonly needsEstimate = computed(() => {
    const baseline = this.baseline();

    return (
      baseline !== null &&
      baseline.estimateMinutes !== null &&
      this.model().estimateMinutes === null
    );
  });

  protected readonly needsImportance = computed(() => {
    const baseline = this.baseline();

    return baseline !== null && baseline.important !== null && this.model().important === null;
  });

  /** Whether Save, Done, Drop and Log progress are unavailable right now. */
  protected readonly actionsBusy = computed(
    () =>
      this.actionPending() || this.leaving() || this.dataStore.awaitingSync().has(this.taskId()),
  );

  protected readonly canSave = computed(
    () =>
      this.baseline() !== null &&
      !this.readOnly() &&
      this.dirty() &&
      !this.needsTitle() &&
      !this.needsEstimate() &&
      !this.needsImportance() &&
      !this.actionsBusy(),
  );

  protected readonly areaOptions = computed<readonly SelectOption[]>(() => {
    const areas = [...(this.dataStore.state()?.areas ?? [])].sort(
      (a, b) => compareCodeUnits(a.name, b.name) || compareCodeUnits(a.id, b.id),
    );

    return [
      { value: '', label: 'No Area' },
      ...areas.map((area) => ({ value: area.id, label: area.name })),
    ];
  });

  private readonly timeZone = computed(() => {
    const zone = this.view()?.state.settings.timeZone ?? 'UTC';

    return isValidTimeZone(zone) ? zone : 'UTC';
  });

  protected readonly overdue = computed(() => {
    const view = this.view();

    return view !== null && isOverdue(view.task, this.clock.now(), this.timeZone());
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
    const zone = this.timeZone();
    const effective = effectiveDue(task, state.tasks, state.links, zone);
    const own = task.due === null ? null : dueInstant(task.due, zone);

    if (effective === null || effective === own) {
      return null;
    }

    const now = this.clock.now();
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

  protected readonly canLogProgress = computed(() => {
    const task = this.view()?.task;

    return (
      task !== undefined &&
      task.status === TaskStatus.Open &&
      task.estimateMinutes !== null &&
      task.estimateMinutes >= MIN_LOGGABLE_ESTIMATE
    );
  });

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
    () =>
      this.addingIds().size > 0 ||
      this.leaving() ||
      this.dataStore.awaitingSync().has(this.taskId()),
  );

  constructor() {
    effect(() => {
      const task = this.task();

      untracked(() => this.follow(task));
    });
  }

  /** Whether this link's Remove is pending or waits for the server. */
  protected removeBusy(linkId: string): boolean {
    return (
      this.leaving() || this.removingIds().has(linkId) || this.dataStore.awaitingSync().has(linkId)
    );
  }

  protected async save(): Promise<void> {
    const baseline = this.baseline();

    if (baseline === null || !this.canSave()) {
      return;
    }

    this.clearMessages();

    const sent = this.model();
    const command: Command = {
      _tag: CommandTag.EditTask,
      taskId: this.taskId(),
      patch: buildTaskPatch(baseline, sent),
      expect: { status: this.expectedStatus },
    };
    const outcome = await this.runAction(command);

    if (this.destroyRef.destroyed) {
      return;
    }

    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
      return;
    }

    const task = this.task();

    if (task !== undefined) {
      const stored = draftOf(task);

      this.baseline.set(stored);

      if (!this.dataStore.awaitingSync().has(task.id)) {
        const draft = this.model();

        this.model.set(mixDraft((key) => sameField(key, draft, sent), draft, stored));
      }
    }

    this.statusLine.set('Saved.');
  }

  protected async done(): Promise<void> {
    await this.leaveWith({
      _tag: CommandTag.CompleteTask,
      taskId: this.taskId(),
      expect: { status: TaskStatus.Open },
    });
  }

  protected async drop(): Promise<void> {
    await this.leaveWith({
      _tag: CommandTag.DropTask,
      taskId: this.taskId(),
      expect: { status: TaskStatus.Open },
    });
  }

  protected cancelDrop(): void {
    this.confirmingDrop.set(false);
    this.focusAfterRender(() => this.dropButton()?.nativeElement);
  }

  protected async logProgress(minutes: number): Promise<void> {
    if (this.actionsBusy()) {
      return;
    }

    this.clearMessages();

    const outcome = await this.runAction({
      _tag: CommandTag.LogProgress,
      taskId: this.taskId(),
      remainingMinutes: minutes,
      expect: { status: TaskStatus.Open },
    });

    if (this.destroyRef.destroyed) {
      return;
    }

    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
      return;
    }

    this.statusLine.set(`Estimate is now ${formatMinutes(minutes)}.`);
    this.logOpen.set(false);
    this.focusAfterRender(() => this.logButton()?.nativeElement);
  }

  protected cancelLogProgress(): void {
    this.logOpen.set(false);
    this.focusAfterRender(() => this.logButton()?.nativeElement);
  }

  protected async removeBlocker(linkId: string): Promise<void> {
    if (this.removeBusy(linkId)) {
      return;
    }

    this.clearMessages();
    this.removingIds.update((ids) => new Set([...ids, linkId]));

    let outcome: CommandOutcome;

    try {
      outcome = await this.send({ _tag: CommandTag.RemoveBlocker, linkId });
    } finally {
      this.removingIds.update((ids) => new Set([...ids].filter((id) => id !== linkId)));
    }

    if (this.destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.focusAfterRender(() => this.addBlockerButton()?.nativeElement);
    } else {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
    }
  }

  protected async addBlocker(blockerId: string): Promise<void> {
    if (this.addBusy()) {
      return;
    }

    this.clearMessages();

    const command: AddBlocker = this.addCommands.get(blockerId) ?? {
      _tag: CommandTag.AddBlocker,
      linkId: this.ids.next(),
      taskId: this.taskId(),
      blockerId,
    };

    this.addCommands.set(blockerId, command);
    this.addingIds.update((ids) => new Set([...ids, blockerId]));

    let outcome: CommandOutcome;

    try {
      outcome = await this.send(command);
    } finally {
      this.addingIds.update((ids) => new Set([...ids].filter((id) => id !== blockerId)));
    }

    if (this.destroyRef.destroyed) {
      return;
    }

    if (outcome._tag !== CommandOutcomeTag.Failed) {
      this.addCommands.delete(blockerId);
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.closePicker();
    } else {
      this.blockerMessage.set(outcomeMessage(outcome) ?? '');
    }
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.focusAfterRender(() => this.addBlockerButton()?.nativeElement);
  }

  /** Sets the baseline when the Task first appears, then follows the store field by field. */
  private follow(task: Task | undefined): void {
    if (task === undefined) {
      return;
    }

    const stored = draftOf(task);
    const baseline = this.baseline();

    if (baseline === null) {
      this.expectedStatus = task.status;
      this.baseline.set(stored);
      this.model.set(stored);
      return;
    }

    const draft = this.model();
    const useStored = (key: DraftKey): boolean =>
      sameField(key, draft, baseline) || sameField(key, draft, stored);

    this.baseline.set(mixDraft(useStored, baseline, stored));
    this.model.set(mixDraft(useStored, draft, stored));
  }

  /** Sends a Done or Drop; Applied leaves the editor, anything else stays with its message. */
  private async leaveWith(command: Command): Promise<void> {
    if (this.actionsBusy()) {
      return;
    }

    this.clearMessages();
    this.leaving.set(true);

    const outcome = await this.runAction(command);

    if (this.destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.leave();
      return;
    }

    this.leaving.set(false);
    this.statusLine.set(outcomeMessage(outcome) ?? '');
  }

  private leave(): void {
    if ((this.router.lastSuccessfulNavigation()?.previousNavigation ?? null) !== null) {
      this.location.back();
    } else {
      void this.router.navigateByUrl('/now', { replaceUrl: true });
    }
  }

  /** Sends a Save, Done, Drop or Log progress and marks it pending meanwhile. */
  private async runAction(command: Command): Promise<CommandOutcome> {
    this.actionPending.set(true);

    try {
      return await this.send(command);
    } finally {
      this.actionPending.set(false);
    }
  }

  /** Sends the command with its attempt key. */
  private async send(command: Command): Promise<CommandOutcome> {
    const key = this.attempts.keyFor(command);
    const outcome = await this.dataStore.send(command, key);

    this.attempts.settle(command, outcome);

    return outcome;
  }

  private clearMessages(): void {
    this.statusLine.set('');
    this.blockerMessage.set('');
  }

  /** After the next render, focuses the element, or the heading when it is gone. */
  private focusAfterRender(target: () => HTMLElement | undefined): void {
    afterNextRender(() => (target() ?? this.headingElement()?.nativeElement)?.focus(), {
      injector: this.injector,
    });
  }
}
