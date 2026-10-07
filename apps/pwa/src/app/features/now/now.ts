// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  type AnimationCallbackEvent,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  type Command,
  CommandTag,
  formatMinutes,
  inboxTasks,
  isOverdue,
  type RankedTask,
  type Task,
  TaskStatus,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus, zoneOrUtc } from '../../core/data/data-store';
import { DoneOrigin, DoneUndo } from '../../core/data/done-undo';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';
import { TaskMorph } from '../../core/platform/task-morph';
import { LoadState } from '../../ui/load-state/load-state';
import { canLogProgress, LogProgressForm } from '../../ui/log-progress-form/log-progress-form';
import { PickerRow, PickerRowVariant } from '../../ui/picker-row/picker-row';
import { SectionHeader } from '../../ui/section-header/section-header';
import { SyncNote } from '../../ui/sync-note/sync-note';
import { TopPick } from '../../ui/top-pick/top-pick';
import { collapseRow, expandRow } from './row-motion';

/** Staggers the exit of a Done card after its check starts drawing. */
const EXIT_DELAY_MS = 100;

const EXIT_KEYFRAMES: Keyframe[] = [
  { translate: '0 0', opacity: 1 },
  { translate: '100% 0', opacity: 0 },
];

const RISE_KEYFRAMES: Keyframe[] = [
  { opacity: 0, translate: '0 8px' },
  { opacity: 1, translate: '0 0' },
];

/** What to do now: the top pick with its actions, the other ranked Tasks, and the ones that wait. */
@Component({
  selector: 'app-now',
  imports: [LoadState, LogProgressForm, PickerRow, RouterLink, SectionHeader, SyncNote, TopPick],
  providers: [CommandAttempts],
  templateUrl: './now.component.html',
  styleUrl: './now.css',
})
export class Now {
  protected readonly dataStore = inject(DataStore);

  private readonly clock = inject(Clock);

  private readonly attempts = inject(CommandAttempts);

  private readonly doneUndo = inject(DoneUndo);

  private readonly motion = inject(Motion);

  private readonly router = inject(Router);

  private readonly injector = inject(Injector);

  private readonly destroyRef = inject(DestroyRef);

  private readonly document = inject(DOCUMENT);

  protected readonly Status = SyncStatus;

  protected readonly Rows = PickerRowVariant;

  protected readonly Origins = DoneOrigin;

  protected readonly morphId = inject(TaskMorph).taskId;

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  private readonly topPick = viewChild(TopPick);

  private readonly topPickHost = viewChild<TopPick, ElementRef<HTMLElement>>(TopPick, {
    read: ElementRef,
  });

  protected readonly waitingExpanded = signal(false);

  protected readonly statusLine = signal('');

  /** The Task ids with a Log progress send in flight. */
  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());

  /** Whether focus is inside the open Log progress form, tracked from its focus events. */
  protected focusInside = false;

  private formWasOpen = false;

  /** The Task whose card is leaving after a Done, shown until its exit ends. */
  protected readonly leaving = signal<RankedTask | null>(null);

  /** The card's Task: the leaving one while it exits, otherwise the top pick. */
  protected readonly displayed = computed(
    () => this.leaving() ?? this.dataStore.now()?.ranked[0] ?? null,
  );

  /** The ranked Tasks the list shows: all but the card's Task, so a row is never shown twice. */
  protected readonly listed = computed<readonly RankedTask[]>(() => {
    const id = this.displayed()?.task.id;

    return (this.dataStore.now()?.ranked ?? []).filter((item) => item.task.id !== id);
  });

  /** Each held Task's id with the id of the row to expand again when its Done is undone. */
  private readonly rowsToExpand = new Map<string, string>();

  /** The row that comes back with the Undo in progress, if any. */
  private displaced: string | null = null;

  private seenUndone = this.doneUndo.undone()?.seq ?? 0;

  /** Numbers each Done, so an exit that a newer Done or an Undo ended does nothing more. */
  private doneSeq = 0;

  private readonly topId = computed(() => this.dataStore.now()?.ranked[0]?.task.id ?? null);

  private readonly topTask = computed(() => {
    const id = this.topId();
    return id === null ? undefined : this.dataStore.state()?.tasks.find((task) => task.id === id);
  });

  protected readonly storedEstimate = computed(() => this.topTask()?.estimateMinutes ?? null);

  protected readonly canLogProgress = computed(() => canLogProgress(this.topTask()));

  /** The Task the Log progress form is open for; any change of the top pick closes it. */
  private readonly logProgressFor = linkedSignal<string | null, string | null>({
    source: () => this.topId(),
    computation: () => null,
  });

  protected readonly formOpen = computed(() => {
    const id = this.logProgressFor();
    return id !== null && id === this.topId() && this.canLogProgress();
  });

  protected readonly inboxTaskCount = computed(() => {
    const state = this.dataStore.state();
    return state === null ? 0 : inboxTasks(state).length;
  });

  private readonly timeZone = computed(() => zoneOrUtc(this.dataStore.state()?.settings.timeZone));

  constructor() {
    effect(() => {
      const open = this.formOpen();
      untracked(() => {
        if (this.formWasOpen && !open && this.focusInside) {
          this.focusTop();
        }
        if (!open) {
          this.focusInside = false;
        }
        this.formWasOpen = open;
      });
    });

    effect(() => {
      const undone = this.doneUndo.undone();
      untracked(() => {
        if (undone === null || undone.seq <= this.seenUndone) {
          return;
        }
        this.seenUndone = undone.seq;
        this.displaced = this.rowsToExpand.get(undone.taskId) ?? null;
        this.rowsToExpand.delete(undone.taskId);
        if (this.leaving()?.task.id === undone.taskId) {
          this.endExit();
        }
        this.riseRestored(undone.taskId);
      });
    });
  }

  /** Collapses a leaving row; focus inside it moves to the top pick first, so it never falls to the body. */
  protected collapse(event: AnimationCallbackEvent): void {
    const focused = this.document.activeElement;

    if (focused !== null && event.target.contains(focused)) {
      this.focusTop();
    }
    void collapseRow(this.motion, event);
  }

  protected expand(event: AnimationCallbackEvent, taskId: string): void {
    if (taskId !== this.displaced) {
      return;
    }
    this.displaced = null;
    void expandRow(this.motion, event);
  }

  /** Whether a Done or Log progress for this Task is pending or waits for the server. */
  protected busy(taskId: string): boolean {
    return this.pendingIds().has(taskId) || this.dataStore.awaitingSync().has(taskId);
  }

  protected estimateText(task: Task): string {
    return task.estimateMinutes === null ? '' : formatMinutes(task.estimateMinutes);
  }

  protected overdue(task: Task): boolean {
    return isOverdue(task, this.clock.now(), this.timeZone());
  }

  protected open(taskId: string): void {
    void this.router.navigate(['/tasks', taskId]);
  }

  protected openForm(taskId: string): void {
    this.logProgressFor.set(taskId);
  }

  protected cancelForm(): void {
    this.focusInside = false;
    this.logProgressFor.set(null);
    afterNextRender(() => this.topPick()?.focusLogProgress(), { injector: this.injector });
  }

  /** Holds the Task through DoneUndo, then plays the exit and rise for the card; a row just collapses. */
  protected async done(
    task: Task,
    origin: DoneOrigin = DoneOrigin.Button,
    keyboard = false,
  ): Promise<void> {
    if (
      this.busy(task.id) ||
      this.doneUndo.pending()?.taskId === task.id ||
      this.leaving()?.task.id === task.id
    ) {
      return;
    }
    this.endExit();
    const seq = ++this.doneSeq;
    this.statusLine.set('');

    const top = this.displayed();
    const card = this.cardElement();

    if (top === null || top.task.id !== task.id) {
      this.doneUndo.complete(task, origin);
      this.rememberRow(task.id, task.id);
      return;
    }

    if (origin === DoneOrigin.Button && card !== null) {
      this.leaving.set(top);
      this.doneUndo.complete(task, origin);
      this.rememberRow(task.id, this.dataStore.now()?.ranked[0]?.task.id);
      if (keyboard) {
        this.doneUndo.requestFocus();
      }
      await this.motion.play(card, EXIT_KEYFRAMES, {
        duration: MotionDuration.Quick,
        easing: MotionEasing.In,
        delay: EXIT_DELAY_MS,
      });
      if (this.destroyRef.destroyed || seq !== this.doneSeq) {
        return;
      }
      card.style.opacity = '0';
      this.leaving.set(null);
      this.riseAfterRender(seq, !keyboard);
      return;
    }

    this.doneUndo.complete(task, origin);
    this.rememberRow(task.id, this.dataStore.now()?.ranked[0]?.task.id);
    this.riseAfterRender(seq, !keyboard);
  }

  protected async saveProgress(minutes: number): Promise<void> {
    const taskId = this.logProgressFor();
    if (taskId === null || this.busy(taskId)) {
      return;
    }
    this.statusLine.set('');
    const command: Command = {
      _tag: CommandTag.LogProgress,
      taskId,
      remainingMinutes: minutes,
      expect: { status: TaskStatus.Open },
    };
    const outcome = await this.run(taskId, command);
    if (this.destroyRef.destroyed) {
      return;
    }
    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
      return;
    }
    this.statusLine.set(`Estimate is now ${formatMinutes(minutes)}.`);
    if (this.logProgressFor() === taskId) {
      this.focusInside = false;
      this.logProgressFor.set(null);
      this.focusTop();
    }
  }

  /** Sends the command through its attempt and marks the Task pending meanwhile. */
  private async run(taskId: string, command: Command): Promise<CommandOutcome> {
    this.pendingIds.update((ids) => new Set([...ids, taskId]));
    try {
      return await this.attempts.send(command);
    } finally {
      this.pendingIds.update((ids) => new Set([...ids].filter((id) => id !== taskId)));
    }
  }

  /** Records which row to expand if this Done is undone; nothing when there is none. */
  private rememberRow(heldId: string, rowId: string | undefined): void {
    if (rowId !== undefined) {
      this.rowsToExpand.set(heldId, rowId);
    }
  }

  /** The card's `<article>`, the element that is animated, or null while no card shows. */
  private cardElement(): HTMLElement | null {
    return this.topPickHost()?.nativeElement.querySelector<HTMLElement>('.asys-top-pick') ?? null;
  }

  /** Ends a running exit at once: its animation stops and the card shows the top pick again. */
  private endExit(): void {
    if (this.leaving() === null) {
      return;
    }
    this.doneSeq += 1;
    const card = this.cardElement();
    if (card !== null) {
      card.style.removeProperty('opacity');
      if (typeof card.getAnimations === 'function') {
        card.getAnimations().forEach((animation) => animation.cancel());
      }
    }
    this.leaving.set(null);
  }

  /** After the next render, lets the card that now shows rise in, then moves focus unless it stays on Undo. */
  private riseAfterRender(seq: number, focus: boolean): void {
    afterNextRender(
      () => {
        const card = this.cardElement();
        if (this.destroyRef.destroyed || seq !== this.doneSeq) {
          card?.style.removeProperty('opacity');
          return;
        }
        if (card !== null) {
          void this.playRise(card);
          card.style.removeProperty('opacity');
        }
        if (focus) {
          this.focusTopNow();
        }
      },
      { injector: this.injector },
    );
  }

  /** After the next render, lets the restored Task's card rise in when it is the one displayed. */
  private riseRestored(taskId: string): void {
    afterNextRender(
      () => {
        const card = this.cardElement();
        if (card !== null && !this.destroyRef.destroyed && this.displayed()?.task.id === taskId) {
          void this.playRise(card);
        }
      },
      { injector: this.injector },
    );
  }

  private async playRise(card: HTMLElement): Promise<void> {
    try {
      await this.motion.play(card, RISE_KEYFRAMES, {
        duration: MotionDuration.Moderate,
        easing: MotionEasing.Out,
      });
    } catch {
      // The rise is decoration, so a failed animation changes nothing.
    }
  }

  private focusTopNow(): void {
    const topPick = this.topPick();
    if (topPick === undefined) {
      this.heading()?.nativeElement.focus();
    } else {
      topPick.focusTitle();
    }
  }

  /** After the next render, moves focus to the top pick's title, or to the heading when none. */
  private focusTop(): void {
    afterNextRender(() => this.focusTopNow(), { injector: this.injector });
  }
}
