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
import { RouterLink } from '@angular/router';
import {
  canLogProgress,
  formatMinutes,
  formatMoment,
  inboxTasks,
  isOverdue,
  type RankedTask,
  reasonFact,
  type Task,
  toLocalDateTime,
  waitingSummary,
} from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus, zoneOrUtc } from '../../core/data/data-store';
import { DoneOrigin, DoneUndo } from '../../core/data/done-undo';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';
import { TaskMorph } from '../../core/platform/task-morph';
import { Button, ButtonVariant } from '../../ui/button/button';
import { IconName } from '../../ui/icon/icon';
import { LoadState } from '../../ui/load-state/load-state';
import {
  estimateNowText,
  LogProgressForm,
  logProgressCommand,
} from '../../ui/log-progress-form/log-progress-form';
import { NowHeader } from '../../ui/now-header/now-header';
import { PickerRow, PickerRowVariant } from '../../ui/picker-row/picker-row';
import { SectionHeader } from '../../ui/section-header/section-header';
import { SwipeActions } from '../../ui/swipe-actions/swipe-actions';
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
  imports: [
    Button,
    LoadState,
    LogProgressForm,
    NowHeader,
    PickerRow,
    RouterLink,
    SectionHeader,
    SwipeActions,
    SyncNote,
    TopPick,
  ],
  providers: [CommandAttempts],
  templateUrl: './now.component.html',
  styleUrl: './now.css',
})
export class Now {
  protected readonly dataStore = inject(DataStore);

  readonly #clock = inject(Clock);

  readonly #attempts = inject(CommandAttempts);

  readonly #doneUndo = inject(DoneUndo);

  readonly #motion = inject(Motion);

  readonly #injector = inject(Injector);

  readonly #destroyRef = inject(DestroyRef);

  readonly #document = inject(DOCUMENT);

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly Status = SyncStatus;

  protected readonly Rows = PickerRowVariant;

  protected readonly Origins = DoneOrigin;

  protected readonly Variants = ButtonVariant;

  protected readonly Icons = IconName;

  protected readonly morphId = inject(TaskMorph).taskId;

  private readonly nowHeader = viewChild(NowHeader);

  private readonly topPick = viewChild(TopPick);

  private readonly topPickHost = viewChild<TopPick, ElementRef<HTMLElement>>(TopPick, {
    read: ElementRef,
  });

  protected readonly waitingExpanded = signal(false);

  protected readonly statusLine = signal('');

  /** Whether focus is inside the open Log progress form, tracked from its focus events. */
  protected focusInside = false;

  #formWasOpen = false;

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
  readonly #rowsToExpand = new Map<string, string>();

  /** The row that comes back with the Undo in progress, if any. */
  #displaced: string | null = null;

  #seenUndone = this.#doneUndo.undone()?.seq ?? 0;

  /** Numbers each Done, so an exit that a newer Done or an Undo ended does nothing more. */
  #doneSeq = 0;

  /** The ids of the ranked Tasks in rank order; the first is the top pick. */
  readonly #rankedIds = computed(
    () => this.dataStore.now()?.ranked.map((item) => item.task.id) ?? [],
  );

  readonly #tasksById = computed(
    () => new Map((this.dataStore.state()?.tasks ?? []).map((task) => [task.id, task])),
  );

  /**
   * The Task the Log progress form is open for. It stays open while its Task stays on the same side, the
   * top pick or the rows, and closes when the Task leaves the ranking or moves between the two.
   */
  readonly #logProgressFor = linkedSignal<readonly string[], string | null>({
    source: () => this.#rankedIds(),
    computation: (ids, previous) => {
      const value = previous?.value ?? null;

      if (previous === undefined || value === null || !ids.includes(value)) {
        return null;
      }

      return (ids[0] === value) === (previous.source[0] === value) ? value : null;
    },
  });

  /** The id of the Task whose Log progress form shows, or null when none does. */
  readonly #openFormId = computed(() => {
    const id = this.#logProgressFor();

    return id !== null && this.canLogProgress(id) ? id : null;
  });

  protected readonly inboxTaskCount = computed(() => {
    const state = this.dataStore.state();
    return state === null ? 0 : inboxTasks(state).length;
  });

  readonly #timeZone = computed(() => zoneOrUtc(this.dataStore.state()?.settings.timeZone));

  /** The moment in the Settings time zone, such as `Fri 9 Oct · 14:05`; it follows the Clock, so it ticks each minute. */
  protected readonly moment = computed(() => formatMoment(this.#clock.now(), this.#timeZone()));

  /** The moment as a machine-readable local date and time, for the `datetime` of the header's `time`. */
  protected readonly momentDatetime = computed(() => {
    const local = toLocalDateTime(this.#clock.now(), this.#timeZone());

    return `${local.date}T${local.time}`;
  });

  /** The one fact the closed Waiting section shows, such as `Next Available tomorrow 09:00`, or null. */
  protected readonly waitingLine = computed(() => {
    const now = this.dataStore.now();

    return now === null ? null : waitingSummary(now.waiting, this.#clock.now(), this.#timeZone());
  });

  readonly #areaNames = computed(
    () => new Map((this.dataStore.state()?.areas ?? []).map((area) => [area.id, area.name])),
  );

  constructor() {
    effect(() => {
      const open = this.#openFormId() !== null;
      untracked(() => {
        if (this.#formWasOpen && !open && this.focusInside) {
          this.#focusTop();
        }
        if (!open) {
          this.focusInside = false;
        }
        this.#formWasOpen = open;
      });
    });

    effect(() => {
      const undone = this.#doneUndo.undone();
      untracked(() => {
        if (undone === null || undone.seq <= this.#seenUndone) {
          return;
        }
        this.#seenUndone = undone.seq;
        this.#displaced = this.#rowsToExpand.get(undone.taskId) ?? null;
        this.#rowsToExpand.delete(undone.taskId);
        if (this.leaving()?.task.id === undone.taskId) {
          this.#endExit();
        }
        this.#riseRestored(undone.taskId);
      });
    });
  }

  /** Collapses a leaving row; focus inside it moves to the top pick first, so it never falls to the body. */
  protected collapse(event: AnimationCallbackEvent): void {
    const focused = this.#document.activeElement;

    if (focused !== null && event.target.contains(focused)) {
      this.#focusTop();
    }
    void collapseRow(this.#motion, event);
  }

  protected expand(event: AnimationCallbackEvent, taskId: string): void {
    if (taskId !== this.#displaced) {
      return;
    }
    this.#displaced = null;
    void expandRow(this.#motion, event);
  }

  /** Whether a Done or Log progress for this Task is pending or waits for the server. */
  protected busy(taskId: string): boolean {
    return this.#attempts.busy(taskId);
  }

  /** The stored Estimate of the Task in minutes, or null when it has none or is not in the state. */
  protected estimateOf(taskId: string): number | null {
    return this.#tasksById().get(taskId)?.estimateMinutes ?? null;
  }

  /** Whether progress can be logged on the Task, by the domain's `canLogProgress`. */
  protected canLogProgress(taskId: string): boolean {
    return canLogProgress(this.#tasksById().get(taskId));
  }

  /** Whether the Log progress form shows for the Task, in the card or under its row. */
  protected formOpenFor(taskId: string): boolean {
    return this.#logProgressFor() === taskId && this.canLogProgress(taskId);
  }

  protected estimateText(task: Task): string {
    return task.estimateMinutes === null ? '' : formatMinutes(task.estimateMinutes);
  }

  protected overdue(task: Task): boolean {
    return isOverdue(task, this.#clock.now(), this.#timeZone());
  }

  /** The name of the Task's Area, or null when it has none. */
  protected areaName(task: Task): string | null {
    return task.areaId === null ? null : (this.#areaNames().get(task.areaId) ?? null);
  }

  /** The Due fact that opens an Overdue Task's reason, or null when the Task is not Overdue. */
  protected dueFact(item: RankedTask): string | null {
    return item.reason.overdue
      ? reasonFact(item.task, item.reason, this.#clock.now(), this.#timeZone())
      : null;
  }

  protected openForm(taskId: string): void {
    this.#logProgressFor.set(taskId);
  }

  /** Closes the form; focus returns to the card's Log progress button, or to the row's link. */
  protected cancelForm(): void {
    const taskId = this.#logProgressFor();

    this.focusInside = false;
    this.#logProgressFor.set(null);
    if (taskId !== null && taskId !== this.#rankedIds()[0]) {
      this.#focusLinkAfterRender(taskId);
    } else {
      afterNextRender(() => this.topPick()?.focusLogProgress(), { injector: this.#injector });
    }
  }

  /** Marks the Task Done from a swipe; a row keeps focus off itself when it had it, so it never falls to the body. */
  protected swipeDone(taskId: string): void {
    const task = this.dataStore.now()?.ranked.find((item) => item.task.id === taskId)?.task;

    if (task === undefined) {
      return;
    }
    if (this.displayed()?.task.id === taskId) {
      void this.done(task, DoneOrigin.Swipe);
      return;
    }
    if (this.#refusesDone(taskId)) {
      return;
    }

    const row = this.#linkOf(taskId)?.closest('li') ?? null;
    const focused = this.#document.activeElement;
    const hadFocus = row !== null && focused !== null && row.contains(focused);
    const neighbourId = hadFocus ? this.#neighbourIdOf(taskId) : null;

    void this.done(task, DoneOrigin.Swipe);
    if (hadFocus) {
      this.#focusRowOrTop(neighbourId);
    }
  }

  /** Holds the Task through DoneUndo, then plays the exit and rise for the card; a row just collapses. */
  protected async done(
    task: Task,
    origin: DoneOrigin = DoneOrigin.Button,
    keyboard = false,
  ): Promise<void> {
    if (this.#refusesDone(task.id)) {
      return;
    }
    this.#endExit();
    const seq = ++this.#doneSeq;
    this.statusLine.set('');

    const top = this.displayed();
    const card = this.#cardElement();

    if (top === null || top.task.id !== task.id) {
      this.#doneUndo.complete(task, origin);
      this.#rememberRow(task.id, task.id);
      return;
    }

    if (origin === DoneOrigin.Button && card !== null) {
      this.leaving.set(top);
      this.#doneUndo.complete(task, origin);
      this.#rememberRow(task.id, this.dataStore.now()?.ranked[0]?.task.id);
      if (keyboard) {
        this.#doneUndo.requestFocus();
      }
      await this.#motion.play(card, EXIT_KEYFRAMES, {
        duration: MotionDuration.Quick,
        easing: MotionEasing.In,
        delay: EXIT_DELAY_MS,
      });
      if (this.#destroyRef.destroyed || seq !== this.#doneSeq) {
        return;
      }
      card.style.opacity = '0';
      this.leaving.set(null);
      this.#riseAfterRender(seq, !keyboard);
      return;
    }

    this.#doneUndo.complete(task, origin);
    this.#rememberRow(task.id, this.dataStore.now()?.ranked[0]?.task.id);
    this.#riseAfterRender(seq, !keyboard);
  }

  protected async saveProgress(minutes: number): Promise<void> {
    const taskId = this.#logProgressFor();
    if (taskId === null || this.busy(taskId)) {
      return;
    }
    this.statusLine.set('');
    const outcome = await this.#attempts.send(logProgressCommand(taskId, minutes));
    if (this.#destroyRef.destroyed) {
      return;
    }
    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
      return;
    }
    this.statusLine.set(estimateNowText(minutes));
    if (this.#logProgressFor() === taskId) {
      this.focusInside = false;
      this.#logProgressFor.set(null);
      if (taskId === this.#rankedIds()[0]) {
        this.#focusTop();
      } else {
        this.#focusLinkAfterRender(taskId);
      }
    }
  }

  /** Whether a Done for this Task is refused: it is busy, already held in DoneUndo, or its card is leaving. */
  #refusesDone(taskId: string): boolean {
    return (
      this.busy(taskId) ||
      this.#doneUndo.pending()?.taskId === taskId ||
      this.leaving()?.task.id === taskId
    );
  }

  /** Records which row to expand if this Done is undone; nothing when there is none. */
  #rememberRow(heldId: string, rowId: string | undefined): void {
    if (rowId !== undefined) {
      this.#rowsToExpand.set(heldId, rowId);
    }
  }

  /** The card's `<article>`, the element that is animated, or null while no card shows. */
  #cardElement(): HTMLElement | null {
    return this.topPickHost()?.nativeElement.querySelector<HTMLElement>('.asys-top-pick') ?? null;
  }

  /** Ends a running exit at once: its animation stops and the card shows the top pick again. */
  #endExit(): void {
    if (this.leaving() === null) {
      return;
    }
    this.#doneSeq += 1;
    const card = this.#cardElement();
    if (card !== null) {
      card.style.removeProperty('opacity');
      if (typeof card.getAnimations === 'function') {
        card.getAnimations().forEach((animation) => animation.cancel());
      }
    }
    this.leaving.set(null);
  }

  /** After the next render, lets the card that now shows rise in, then moves focus unless it stays on Undo. */
  #riseAfterRender(seq: number, focus: boolean): void {
    afterNextRender(
      () => {
        const card = this.#cardElement();
        if (this.#destroyRef.destroyed || seq !== this.#doneSeq) {
          card?.style.removeProperty('opacity');
          return;
        }
        if (card !== null) {
          void this.#playRise(card);
          card.style.removeProperty('opacity');
        }
        if (focus) {
          this.#focusTopNow();
        }
      },
      { injector: this.#injector },
    );
  }

  /** After the next render, lets the restored Task's card rise in when it is the one displayed. */
  #riseRestored(taskId: string): void {
    afterNextRender(
      () => {
        const card = this.#cardElement();
        if (card !== null && !this.#destroyRef.destroyed && this.displayed()?.task.id === taskId) {
          void this.#playRise(card);
        }
      },
      { injector: this.#injector },
    );
  }

  async #playRise(card: HTMLElement): Promise<void> {
    await this.#motion.play(card, RISE_KEYFRAMES, {
      duration: MotionDuration.Moderate,
      easing: MotionEasing.Out,
    });
  }

  #focusTopNow(): void {
    const topPick = this.topPick();
    if (topPick === undefined) {
      this.nowHeader()?.focusHeading();
    } else {
      topPick.focusTitle();
    }
  }

  /** The link of the Task's row or card, skipping one that is leaving, or null when none shows. */
  #linkOf(taskId: string): HTMLElement | null {
    const title = Array.from(
      this.#host.nativeElement.querySelectorAll<HTMLElement>('[data-task-id]'),
    ).find(
      (element) =>
        element.getAttribute('data-task-id') === taskId &&
        element.closest('[data-leaving]') === null,
    );

    return title?.closest('a') ?? null;
  }

  /** After the next render, moves focus to the link of the Task's row. */
  #focusLinkAfterRender(taskId: string): void {
    afterNextRender(() => this.#linkOf(taskId)?.focus(), { injector: this.#injector });
  }

  /** The id of the row after this one in the list, else the one before it, else null. Read it before the Done. */
  #neighbourIdOf(taskId: string): string | null {
    const rows = this.listed();
    const index = rows.findIndex((item) => item.task.id === taskId);

    return (rows[index + 1] ?? rows[index - 1])?.task.id ?? null;
  }

  /** Moves focus now to the link of the row, or to the top pick when there is none. */
  #focusRowOrTop(taskId: string | null): void {
    const link = taskId === null ? null : this.#linkOf(taskId);

    if (link === null) {
      this.#focusTopNow();
    } else {
      link.focus();
    }
  }

  /** After the next render, moves focus to the top pick's title link, or to the heading when none. */
  #focusTop(): void {
    afterNextRender(() => this.#focusTopNow(), { injector: this.#injector });
  }
}
