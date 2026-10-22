// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT, Location, NgTemplateOutlet } from '@angular/common';
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
  canLogProgress,
  CommandTag,
  type DomainState,
  explainTask,
  isBlocked,
  isOverdue,
  type Task,
  TaskExplanationTag,
  TaskStatus,
  toLocalDateTime,
} from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus, zoneOrUtc } from '../../core/data/data-store';
import { DoneOrigin, DoneUndo } from '../../core/data/done-undo';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { observeBlockSize } from '../../core/platform/observe-block-size';
import { TaskMorph } from '../../core/platform/task-morph';
import { activationOf } from '../../components/support/activation';
import { Button, ButtonSize, ButtonVariant } from '../../components/atoms/button/button';
import { ChoiceRow } from '../../components/organisms/choice-row/choice-row';
import { DateSpecRow } from '../../components/organisms/date-spec-row/date-spec-row';
import {
  EstimateField,
  EstimateLayout,
} from '../../components/organisms/estimate-field/estimate-field';
import { FieldError } from '../../components/atoms/field-error/field-error';
import { Icon, IconName } from '../../components/atoms/icon/icon';
import { Input, InputVariant } from '../../components/atoms/input/input';
import { InlineConfirm } from '../../components/molecules/inline-confirm/inline-confirm';
import { LoadState } from '../../components/molecules/load-state/load-state';
import {
  estimateNowText,
  LogProgressForm,
  logProgressCommand,
} from '../../components/organisms/log-progress-form/log-progress-form';
import { QuadrantChip } from '../../components/atoms/quadrant-chip/quadrant-chip';
import { Segmented } from '../../components/molecules/segmented/segmented';
import { areaSelectOptions } from '../../components/molecules/select-field/area-options';
import { Sheet } from '../../components/organisms/sheet/sheet';
import { SingleLine } from '../../components/atoms/input/single-line';
import { StatusBadge, StatusBadgeStatus } from '../../components/atoms/status-badge/status-badge';
import { SyncNote } from '../../components/atoms/sync-note/sync-note';
import { byAreaName } from '../areas/area-order';
import { SaveState, TaskDraftSaver } from './task-draft-saver';
import { TaskBlockers } from './task-blockers';
import { previewTask } from './task-preview';
import { buildTaskPatch, savableDraft, TASK_DRAFT_FIELDS } from './task-patch';

let nextId = 0;

/** How many live editors have published their chrome on the root element; the last one out removes it. */
let chromeEditors = 0;

/** The sheets whose closing returns focus to their opener. */
enum EditorSheet {
  Log = 'log',
  More = 'more',
}

/** The stored Task and the state it was read from, as the editor renders them. */
interface EditorView {
  readonly state: DomainState;
  readonly task: Task;
}

/**
 * Edits one Task on a full-screen card and saves every change as it is made. It renders the draft that
 * TaskDraftSaver keeps, previews the Task's reason line from it, and runs Done, Log progress and Drop.
 */
@Component({
  selector: 'asys-task-editor',
  imports: [
    Button,
    ChoiceRow,
    DateSpecRow,
    EstimateField,
    FieldError,
    FormField,
    Icon,
    InlineConfirm,
    Input,
    LoadState,
    LogProgressForm,
    NgTemplateOutlet,
    QuadrantChip,
    RouterLink,
    Segmented,
    Sheet,
    SingleLine,
    StatusBadge,
    SyncNote,
    TaskBlockers,
  ],
  providers: [CommandAttempts, TaskDraftSaver],
  templateUrl: './task-editor.component.html',
  styleUrl: './task-editor.css',
})
export class TaskEditor {
  readonly taskId = input.required<string>();

  protected readonly dataStore = inject(DataStore);

  protected readonly saver = inject(TaskDraftSaver);

  readonly #clock = inject(Clock);

  readonly #taskMorph = inject(TaskMorph);

  readonly #attempts = inject(CommandAttempts);

  readonly #doneUndo = inject(DoneUndo);

  readonly #router = inject(Router);

  readonly #location = inject(Location);

  readonly #injector = inject(Injector);

  readonly #document = inject(DOCUMENT);

  readonly #destroyRef = inject(DestroyRef);

  /** Set once this editor has started leaving, so Back and Done navigate at most once. */
  #left = false;

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly InputVariants = InputVariant;

  protected readonly Icons = IconName;

  protected readonly Badge = StatusBadgeStatus;

  protected readonly TaskStatuses = TaskStatus;

  protected readonly Tags = TaskExplanationTag;

  protected readonly Saves = SaveState;

  protected readonly Layout = EstimateLayout;

  protected readonly Sheets = EditorSheet;

  protected readonly titleErrorId = `task-editor-${nextId++}-title-error`;

  private readonly headingElement = viewChild<ElementRef<HTMLElement>>('heading');

  private readonly notesField = viewChild<ElementRef<HTMLTextAreaElement>>('notesField');

  private readonly dropButton = viewChild('dropButton', { read: ElementRef<HTMLElement> });

  private readonly moreButton = viewChild('moreButton', { read: ElementRef<HTMLElement> });

  private readonly logButton = viewChild('logButton', { read: ElementRef<HTMLElement> });

  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');

  private readonly footer = viewChild<ElementRef<HTMLElement>>('footer');

  /** Action messages; a message of the saver wins over it in the status text. */
  readonly #statusLine = signal('');

  /** The message of a failed Log progress, shown inside its sheet. */
  protected readonly logMessage = signal('');

  /** The message of a failed Drop, shown inside the More sheet. */
  protected readonly dropMessage = signal('');

  /**
   * Set before a Done or Drop leaves. A Done holds the Task and leaves at once, so it stays true; a Drop
   * clears it again when its outcome is not Applied.
   */
  protected readonly leaving = signal(false);

  /** Whether a Log progress or Drop send is running. */
  readonly #acting = signal(false);

  protected readonly logOpen = signal(false);

  protected readonly moreOpen = signal(false);

  protected readonly confirmingDrop = signal(false);

  /** Set when "Add notes" was pressed, so empty Notes stay shown. */
  readonly #notesRequested = signal(false);

  /** The stored Task to render; while leaving, the last one rendered stays. */
  protected readonly view = linkedSignal<
    { state: DomainState | null; task: Task | undefined; leaving: boolean },
    EditorView | null
  >({
    source: () => ({
      state: this.dataStore.state(),
      task: this.saver.task(),
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
    source: () => this.saver.task(),
    computation: (task, previous) => task?.title ?? previous?.value ?? 'Task',
  });

  /** Whether the running view transition morphs this Task's title. */
  protected readonly morph = computed(() => this.#taskMorph.taskId() === this.taskId());

  /** The raw draft, typed text included, differs from the stored Task. */
  protected readonly dirty = computed(() => {
    const baseline = this.saver.baseline();

    return (
      baseline !== null && Object.keys(buildTaskPatch(baseline, this.saver.model())).length > 0
    );
  });

  /** The form cannot change: the Task is missing and the form is dirty, the Task is Stopped, or it is leaving. */
  protected readonly readOnly = computed(
    () =>
      (this.view() === null && this.dataStore.state() !== null && this.dirty()) ||
      this.saver.state() === SaveState.Stopped ||
      this.leaving(),
  );

  protected readonly editForm = form(this.saver.model, (path) => {
    validate(path.estimateMinutes, () =>
      this.saver.needsEstimate() ? { kind: 'required', message: 'Needs an Estimate' } : undefined,
    );
    validate(path.important, () =>
      this.saver.needsImportance()
        ? { kind: 'required', message: 'Needs an Importance' }
        : undefined,
    );
    disabled(path, { when: () => this.readOnly() });
  });

  /** Whether Done, and the blockers, are unavailable: leaving, awaiting the server, or read-only. */
  protected readonly doneBlocked = computed(
    () => this.leaving() || this.dataStore.awaitingSync().has(this.taskId()) || this.readOnly(),
  );

  /** Whether Log progress and Drop are unavailable: Done's blocks, or one of them is running. */
  protected readonly actionBlocked = computed(() => this.doneBlocked() || this.#acting());

  protected readonly blockersBusy = computed(() => this.doneBlocked());

  protected readonly statusText = computed(() => this.saver.message() || this.#statusLine());

  readonly #timeZone = computed(() => zoneOrUtc(this.dataStore.state()?.settings.timeZone));

  protected readonly today = computed(
    () => toLocalDateTime(this.#clock.now(), this.#timeZone()).date,
  );

  protected readonly areaOptions = computed(() =>
    areaSelectOptions([...(this.dataStore.state()?.areas ?? [])].sort(byAreaName)),
  );

  /** The draft as it would save; typed, uncommitted text leaves it equal, so the reason line is not rebuilt per keystroke. */
  readonly #savable = computed(
    () => {
      const baseline = this.saver.baseline();

      return baseline === null
        ? null
        : savableDraft(baseline, this.saver.model(), this.saver.committed());
    },
    {
      equal: (a, b) =>
        a === null || b === null
          ? a === b
          : TASK_DRAFT_FIELDS.keys.every((key) => TASK_DRAFT_FIELDS.same(key, a, b)),
    },
  );

  /** The Task as the draft would save it, the list with it in place of the stored Task, and the zone. */
  readonly #preview = computed(() => {
    const view = this.view();
    const savable = this.#savable();

    if (view === null || savable === null) {
      return null;
    }

    const zone = zoneOrUtc(view.state.settings.timeZone);
    const preview = previewTask(view.task, savable);
    const tasks = view.state.tasks.map((task) => (task.id === preview.id ? preview : task));

    return { state: view.state, preview, tasks, zone };
  });

  /** The reason line, previewed from the draft: only committed text, and never a cleared Estimate or Importance. */
  protected readonly explanation = computed(() => {
    const draft = this.#preview();

    if (draft === null) {
      return null;
    }

    const { state, preview, tasks, zone } = draft;

    return explainTask(
      preview,
      tasks,
      state.links,
      { ...state.settings, timeZone: zone },
      this.#clock.now(),
    );
  });

  protected readonly overdue = computed(() => {
    const draft = this.#preview();

    return draft !== null && isOverdue(draft.preview, this.#clock.now(), draft.zone);
  });

  protected readonly blocked = computed(() => {
    const draft = this.#preview();

    return draft !== null && isBlocked(draft.preview, draft.tasks, draft.state.links);
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

  /** The stored Estimate while Log progress can be used, else null. */
  protected readonly logEstimate = computed(() => {
    const task = this.view()?.task;

    return this.canLogProgress() ? (task?.estimateMinutes ?? null) : null;
  });

  protected readonly notesShown = computed(
    () =>
      this.#notesRequested() ||
      (this.saver.baseline()?.notes ?? '') !== '' ||
      this.saver.model().notes !== '',
  );

  constructor() {
    this.saver.connect(() => this.taskId());

    // A save in flight ends the Log progress confirmation, so a later save message is the one shown.
    effect(() => {
      if (this.saver.state() === SaveState.Saving) {
        untracked(() => this.#statusLine.set(''));
      }
    });

    this.#measureChrome();
  }

  /** A person closed the Log progress or More sheet: focus returns to its opener, or the heading. */
  protected sheetClosed(open: boolean, sheet: EditorSheet): void {
    if (!open) {
      this.#focusAfterRender(
        () => (sheet === EditorSheet.Log ? this.logButton() : this.moreButton())?.nativeElement,
      );
    }
  }

  /** The Title as typed, its line breaks already turned into spaces. */
  protected titleInput(title: string): void {
    this.saver.model.update((draft) => ({ ...draft, title }));
  }

  protected notesInput(event: Event): void {
    const notes = (event.target as HTMLTextAreaElement).value;

    this.saver.model.update((draft) => ({ ...draft, notes }));
  }

  protected addNotes(): void {
    this.#notesRequested.set(true);
    this.#focusAfterRender(() => this.notesField()?.nativeElement);
  }

  protected openMore(): void {
    this.confirmingDrop.set(false);
    this.dropMessage.set('');
    this.moreOpen.set(true);
  }

  protected back(): void {
    this.#leave();
  }

  /** Saves the draft, holds the Task through DoneUndo and leaves at once; the send waits for its Undo window. */
  protected done(event: MouseEvent): void {
    const task = this.saver.task();

    if (this.doneBlocked() || task === undefined) {
      return;
    }

    this.#statusLine.set('');
    this.saver.flush();
    this.leaving.set(true);

    const title = this.#savable()?.title.trim() ?? task.title;

    this.#doneUndo.complete({ ...task, title }, DoneOrigin.Button, this.saver.idle());

    if (activationOf(event).keyboard) {
      this.#doneUndo.requestFocus();
    }

    this.#leave();
  }

  protected async logProgress(minutes: number): Promise<void> {
    if (this.actionBlocked()) {
      return;
    }

    this.#acting.set(true);
    this.#clearMessages();

    await this.saver.idle();

    if (this.#destroyRef.destroyed) {
      return;
    }

    const outcome = await this.#attempts.send(logProgressCommand(this.taskId(), minutes));

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.#statusLine.set(estimateNowText(minutes));
      this.logOpen.set(false);
      this.#focusAfterRender(() => this.logButton()?.nativeElement);
    } else {
      this.logMessage.set(outcomeMessage(outcome) ?? '');
    }

    this.#acting.set(false);
  }

  /** Sends a Drop; Applied leaves the editor, anything else stays with its message in the More sheet. */
  protected async drop(): Promise<void> {
    if (this.actionBlocked()) {
      return;
    }

    this.#acting.set(true);
    this.leaving.set(true);
    this.#clearMessages();
    this.saver.halt();

    await this.saver.idle();

    if (this.#destroyRef.destroyed) {
      return;
    }

    const outcome = await this.#attempts.send({
      _tag: CommandTag.DropTask,
      taskId: this.taskId(),
      expect: { status: TaskStatus.Open },
    });

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.moreOpen.set(false);
      this.#leave();
      return;
    }

    this.leaving.set(false);
    this.#acting.set(false);
    this.saver.resume();
    this.dropMessage.set(outcomeMessage(outcome) ?? '');
  }

  protected cancelDrop(): void {
    this.confirmingDrop.set(false);
    this.#focusAfterRender(() => this.dropButton()?.nativeElement);
  }

  /**
   * While the editor exists, publishes the heights of its sticky bar and footer on the root element,
   * so `scroll-padding-block` keeps a focused control clear of them. Needs ResizeObserver.
   */
  #measureChrome(): void {
    if (typeof ResizeObserver !== 'function') {
      return;
    }

    const root = this.#document.documentElement;

    chromeEditors++;
    root.classList.add('task-editor-open');

    effect((onCleanup) => {
      const element = this.bar()?.nativeElement;

      if (element) {
        onCleanup(
          observeBlockSize(element, (size) =>
            root.style.setProperty('--task-editor-bar-height', `${size}px`),
          ),
        );
      }
    });

    effect((onCleanup) => {
      const element = this.footer()?.nativeElement;

      if (element) {
        onCleanup(
          observeBlockSize(element, (size) =>
            root.style.setProperty('--task-editor-footer-height', `${size}px`),
          ),
        );
      } else {
        root.style.setProperty('--task-editor-footer-height', '0px');
      }
    });

    this.#destroyRef.onDestroy(() => {
      chromeEditors--;

      if (chromeEditors > 0) {
        return;
      }

      root.classList.remove('task-editor-open');
      root.style.removeProperty('--task-editor-bar-height');
      root.style.removeProperty('--task-editor-footer-height');
    });
  }

  /**
   * Leaves at most once. A navigateByUrl to Now that resolves false lets a later call try again; a
   * Location.back() gives no result, so after it the editor never tries again.
   */
  #leave(): void {
    if (this.#left) {
      return;
    }

    this.#left = true;

    if ((this.#router.lastSuccessfulNavigation()?.previousNavigation ?? null) !== null) {
      this.#location.back();
    } else {
      void this.#router.navigateByUrl('/now', { replaceUrl: true }).then((navigated) => {
        if (!navigated) {
          this.#left = false;
        }
      });
    }
  }

  #clearMessages(): void {
    this.#statusLine.set('');
    this.logMessage.set('');
    this.dropMessage.set('');
  }

  /** After the next render, focuses the element, or the heading when it is gone. */
  #focusAfterRender(target: () => HTMLElement | undefined): void {
    afterNextRender(() => (target() ?? this.headingElement()?.nativeElement)?.focus(), {
      injector: this.#injector,
    });
  }
}
