// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT, Location } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { disabled, form, validate } from '@angular/forms/signals';
import { Router } from '@angular/router';
import {
  canLogProgress,
  CommandTag,
  type DomainState,
  explainTask,
  isBlocked,
  isOverdue,
  type Task,
  TaskStatus,
  toLocalDateTime,
} from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus, zoneOrUtc } from '../../core/data/data-store';
import { DoneOrigin, UndoWindow } from '../../core/data/undo-window';
import { estimateNowText, logProgressCommand } from '../../core/data/log-progress';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { observeBlockSize } from '../../core/platform/observe-block-size';
import { TaskMorph } from '../../core/platform/task-morph';
import { TaskEditorTemplate } from '../../components/templates/task-editor-template/task-editor-template';
import { byAreaName } from '../../core/data/area-order';
import { SaveState, TaskDraftSaver } from './task-draft-saver';
import { TaskBlockerActions } from '../../core/data/task-blocker-actions';
import { previewTask } from '../../core/data/task-preview';
import { buildTaskPatch, savableDraft, TASK_DRAFT_FIELDS } from '../../core/data/task-patch';

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
  imports: [TaskEditorTemplate],
  providers: [CommandAttempts, TaskDraftSaver, TaskBlockerActions],
  template: `
    <asys-task-editor-template
      [taskId]="taskId()"
      [morph]="morph()"
      [heading]="headingText()"
      [statusText]="statusText()"
      [saved]="saver.saved()"
      [saveFailed]="saver.state() === Saves.Failed"
      [loaded]="dataStore.state() !== null"
      [loadFailed]="dataStore.status() === Status.Failed"
      [found]="view() !== null"
      [taskOpen]="taskOpen()"
      [readOnly]="readOnly()"
      [leaving]="leaving()"
      [dirty]="dirty()"
      [awaiting]="dataStore.awaitingSync().has(taskId())"
      [title]="saver.model().title"
      [notes]="saver.model().notes"
      [needsTitle]="saver.needsTitle()"
      [notesShown]="notesShown()"
      [capturedText]="capturedText()"
      [importantField]="editForm.important"
      [estimateField]="editForm.estimateMinutes"
      [areaField]="editForm.areaId"
      [availableFromField]="editForm.availableFrom"
      [dueField]="editForm.due"
      [areas]="areas()"
      [today]="today()"
      [explanation]="explanation()"
      [overdue]="overdue()"
      [blocked]="blocked()"
      [doneBlocked]="doneBlocked()"
      [actionBlocked]="actionBlocked()"
      [canLogProgress]="canLogProgress()"
      [(logOpen)]="logOpen"
      [logMessage]="logMessage()"
      [logEstimate]="logEstimate()"
      [(moreOpen)]="moreOpen"
      [(confirmingDrop)]="confirmingDrop"
      [dropMessage]="dropMessage()"
      [dropTitle]="dropTitle()"
      [blockersBusy]="blockersBusy()"
      [blockerSummary]="blockers.summary()"
      [blockedBy]="blockers.blockedBy()"
      [blocks]="blockers.blocks()"
      [blockerCandidates]="blockers.candidates()"
      [blockerMessage]="blockers.message()"
      [blockerAdding]="blockers.adding()"
      [(blockerFilter)]="blockers.filter"
      (back)="back()"
      (more)="openMore()"
      (done)="done($event)"
      (retrySave)="saver.retry()"
      (retry)="dataStore.refresh()"
      (titleChange)="titleInput($event)"
      (notesChange)="notesInput($event)"
      (commit)="saver.commit()"
      (addNotes)="addNotes()"
      (logProgress)="logProgress($event)"
      (logOpenChange)="sheetClosed($event, Sheets.Log)"
      (moreOpenChange)="sheetClosed($event, Sheets.More)"
      (cancelLog)="logOpen.set(false)"
      (dropTask)="drop()"
      (cancelDrop)="cancelDrop()"
      (addBlocker)="addBlocker($event)"
      (removeBlocker)="removeBlocker($event)"
    />
  `,
})
export class TaskEditor {
  readonly taskId = input.required<string>();

  protected readonly dataStore = inject(DataStore);

  protected readonly saver = inject(TaskDraftSaver);

  readonly #clock = inject(Clock);

  readonly #taskMorph = inject(TaskMorph);

  readonly #attempts = inject(CommandAttempts);

  readonly #undoWindow = inject(UndoWindow);

  readonly #router = inject(Router);

  readonly #location = inject(Location);

  readonly #injector = inject(Injector);

  protected readonly blockers = inject(TaskBlockerActions);

  readonly #document = inject(DOCUMENT);

  readonly #destroyRef = inject(DestroyRef);

  /** Set once this editor has started leaving, so Back and Done navigate at most once. */
  #left = false;

  protected readonly Status = SyncStatus;

  protected readonly Saves = SaveState;

  protected readonly Sheets = EditorSheet;

  private readonly template = viewChild(TaskEditorTemplate);

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

  /** The Areas to choose from, sorted by name. */
  protected readonly areas = computed(() =>
    [...(this.dataStore.state()?.areas ?? [])].sort(byAreaName),
  );

  protected readonly taskOpen = computed(() => this.view()?.task?.status === TaskStatus.Open);

  /** The title the Drop confirmation names. */
  protected readonly dropTitle = computed(() => this.view()?.task?.title ?? this.headingText());

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
    this.blockers.connect(
      () => this.taskId(),
      () => this.blockersBusy(),
    );

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
      this.#focusAfterRender((template) =>
        sheet === EditorSheet.Log ? template.focusLogButton() : template.focusMoreButton(),
      );
    }
  }

  /** The Title as typed, its line breaks already turned into spaces. */
  protected titleInput(title: string): void {
    this.saver.model.update((draft) => ({ ...draft, title }));
  }

  protected notesInput(notes: string): void {
    this.saver.model.update((draft) => ({ ...draft, notes }));
  }

  protected addNotes(): void {
    this.#notesRequested.set(true);
    this.#focusAfterRender((template) => template.focusNotes());
  }

  protected openMore(): void {
    this.confirmingDrop.set(false);
    this.dropMessage.set('');
    this.moreOpen.set(true);
  }

  protected back(): void {
    this.#leave();
  }

  /** Saves the draft, holds the Task through UndoWindow and leaves at once; the send waits for its Undo window. */
  protected done(keyboard: boolean): void {
    const task = this.saver.task();

    if (this.doneBlocked() || task === undefined) {
      return;
    }

    this.#statusLine.set('');
    this.saver.flush();
    this.leaving.set(true);

    const title = this.#savable()?.title.trim() ?? task.title;

    this.#undoWindow.complete({ ...task, title }, DoneOrigin.Button, this.saver.idle());

    if (keyboard) {
      this.#undoWindow.requestFocus();
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
      this.#focusAfterRender((template) => template.focusLogButton());
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
    this.#focusAfterRender((template) => template.focusDropButton());
  }

  /** Makes a Task a blocker; on Applied, focus returns to the Find a Task field. */
  protected async addBlocker(blockerId: string): Promise<void> {
    if (await this.blockers.add(blockerId)) {
      this.#focusAfterRender((template) => template.focusBlockerFilter());
    }
  }

  /** Removes a blocker; on Applied, focus moves to the Remove button now at its place. */
  protected async removeBlocker(linkId: string): Promise<void> {
    const index = this.blockers.blockedBy().findIndex((row) => row.linkId === linkId);

    if (await this.blockers.remove(linkId)) {
      this.#focusAfterRender((template) => template.focusBlockerRemove(index));
    }
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
      const element = this.template()?.barElement();

      if (element) {
        onCleanup(
          observeBlockSize(element, (size) =>
            root.style.setProperty('--task-editor-bar-height', `${size}px`),
          ),
        );
      }
    });

    effect((onCleanup) => {
      const element = this.template()?.footerElement();

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

  /** After the next render, runs a focus method of the template. */
  #focusAfterRender(focus: (template: TaskEditorTemplate) => void): void {
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
