// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  type AnimationCallbackEvent,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  automaticAreaIds,
  canLogProgress,
  formatMinutes,
  formatMoment,
  inboxTasks,
  isOverdue,
  makeAreaPick,
  type RankedTask,
  reasonFact,
  type Task,
  toLocalDateTime,
  waitingSummary,
} from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { AreaPickStore } from '../../core/data/area-pick-store';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus, zoneOrUtc } from '../../core/data/data-store';
import { DoneOrigin, UndoKind, UndoWindow } from '../../core/data/undo-window';
import { estimateNowText, logProgressCommand } from '../../core/data/log-progress';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';
import { TaskMorph } from '../../core/platform/task-morph';
import {
  type NowAreaControl,
  type NowCard,
  type NowDone,
  type NowOtherArea,
  type NowRow,
  NowTemplate,
  type NowSwipeDone,
  type NowWaitingRow,
} from '../../components/templates/now-template/now-template';
import { byAreaName } from '../../core/data/area-order';
import {
  areaNamesText,
  BACK_TO_AUTOMATIC,
  otherAreaText,
  pickedStatusText,
} from './current-area-text';
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
  imports: [NowTemplate],
  providers: [CommandAttempts],
  template: `
    <asys-now-template
      [moment]="moment()"
      [datetime]="momentDatetime()"
      [areaControl]="areaControl()"
      [statusLine]="statusLine()"
      [loaded]="dataStore.now() !== null"
      [loadFailed]="dataStore.status() === Status.Failed"
      [card]="card()"
      [leaving]="leaving() !== null"
      [inboxTaskCount]="inboxTaskCount()"
      [rows]="rows()"
      [otherAreas]="otherAreas()"
      [waiting]="waiting()"
      [waitingSummary]="waitingLine()"
      [(waitingExpanded)]="waitingExpanded"
      (retry)="dataStore.refresh()"
      (areaPicked)="pickArea($event)"
      (otherAreaPicked)="pickOtherArea($event)"
      (done)="doneFromCard($event)"
      (swipeDone)="swipeDone($event)"
      (logProgress)="openForm($event)"
      (saveProgress)="saveProgress($event)"
      (cancelForm)="cancelForm()"
      (formFocus)="focusInside = $event"
      (rowLeave)="collapse($event)"
      (rowEnter)="expand($event.event, $event.taskId)"
    />
  `,
})
export class Now {
  protected readonly dataStore = inject(DataStore);

  readonly #clock = inject(Clock);

  readonly #areaPickStore = inject(AreaPickStore);

  readonly #attempts = inject(CommandAttempts);

  readonly #undoWindow = inject(UndoWindow);

  readonly #motion = inject(Motion);

  readonly #injector = inject(Injector);

  readonly #destroyRef = inject(DestroyRef);

  readonly #document = inject(DOCUMENT);

  protected readonly Status = SyncStatus;

  readonly #morphId = inject(TaskMorph).taskId;

  private readonly template = viewChild(NowTemplate);

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

  #seenUndone = this.#undoWindow.undone()?.seq ?? 0;

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

    return id !== null && this.#canLogProgress(id) ? id : null;
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

  /** What the header's Current Area control shows, or null while there is no state. */
  protected readonly areaControl = computed<NowAreaControl | null>(() => {
    const state = this.dataStore.state();
    const current = this.dataStore.currentArea();

    if (state === null || current === null) {
      return null;
    }

    const automatic = areaNamesText(
      automaticAreaIds(state.areas, this.#timeZone(), this.#clock.now()),
      state.areas,
    );

    return {
      label: areaNamesText(current.areaIds, state.areas),
      pickedId: current.picked ? (current.areaIds[0] ?? null) : null,
      automaticLabel: `Automatic: ${automatic}`,
      areas: state.areas.toSorted(byAreaName).map((area) => ({ id: area.id, name: area.name })),
    };
  });

  /** The Other Areas line's buttons: each counted Area with its text; an Area of unknown name is skipped. */
  protected readonly otherAreas = computed<readonly NowOtherArea[]>(() => {
    const names = this.#areaNames();

    return (this.dataStore.now()?.otherAreas ?? []).flatMap((other) => {
      const name = names.get(other.areaId);

      return name === undefined
        ? []
        : [{ areaId: other.areaId, text: otherAreaText(name, other.count, other.overdue) }];
    });
  });

  /** The card's Task as the template shows it, or null when none shows. */
  protected readonly card = computed<NowCard | null>(() => {
    const top = this.displayed();

    if (top === null) {
      return null;
    }

    const id = top.task.id;

    return {
      id,
      title: top.task.title,
      reason: top.reasonText,
      quadrant: top.reason.quadrant,
      overdue: top.reason.overdue,
      dueFact: this.#dueFact(top),
      estimate: this.#estimateText(top.task),
      area: this.#areaName(top.task),
      morph: this.#morphId() === id,
      canLogProgress: this.#canLogProgress(id),
      busy: this.#busy(id),
      awaitingSync: this.dataStore.awaitingSync().has(id),
      formEstimate: this.#formEstimateOf(id),
    };
  });

  /** The ranked Tasks under the card as the template shows them. */
  protected readonly rows = computed<readonly NowRow[]>(() =>
    this.listed().map((item) => {
      const id = item.task.id;

      return {
        id,
        title: item.task.title,
        reason: item.reasonText,
        quadrant: item.reason.quadrant,
        overdue: item.reason.overdue,
        estimate: this.#estimateText(item.task),
        morph: this.#morphId() === id,
        canLogProgress: this.#canLogProgress(id),
        busy: this.#busy(id),
        formEstimate: this.#formEstimateOf(id),
      };
    }),
  );

  /** The Tasks in the Waiting section as the template shows them. */
  protected readonly waiting = computed<readonly NowWaitingRow[]>(() =>
    (this.dataStore.now()?.waiting ?? []).map((item) => ({
      id: item.task.id,
      title: item.task.title,
      reason: item.reasonText,
      estimate: this.#estimateText(item.task),
      overdue: this.#overdue(item.task),
      morph: this.#morphId() === item.task.id,
    })),
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
      const undone = this.#undoWindow.undone();
      untracked(() => {
        if (undone === null || undone.seq <= this.#seenUndone) {
          return;
        }
        this.#seenUndone = undone.seq;
        // Only a Done is Now's to restore: a Triage or Drop undone from the Inbox bar leaves its state alone.
        if (undone.kind !== UndoKind.Done) {
          return;
        }
        this.#displaced = this.#rowsToExpand.get(undone.taskId) ?? null;
        this.#rowsToExpand.delete(undone.taskId);
        if (this.leaving()?.task.id === undone.taskId) {
          this.#endExit();
        }
        this.#riseRestored(undone.taskId);
      });
    });
  }

  /** Picks the Area for the rest of its stretch, or goes back to Automatic with null. */
  protected pickArea(areaId: string | null): void {
    const state = this.dataStore.state();

    if (state === null) {
      return;
    }
    if (areaId === null) {
      this.#areaPickStore.clear();
      this.statusLine.set(BACK_TO_AUTOMATIC);
      return;
    }

    const now = this.#clock.now();
    const zone = this.#timeZone();
    const made = makeAreaPick(state.areas, { ...state.settings, timeZone: zone }, now, areaId);
    const name = this.#areaNames().get(areaId);

    if (made === null || name === undefined) {
      return;
    }
    this.#areaPickStore.pick(made);
    this.statusLine.set(pickedStatusText(name, made.endsAt, now, zone));
  }

  /** Picks the Area from the Other Areas line, then moves focus to the control after the next render. */
  protected pickOtherArea(areaId: string): void {
    this.pickArea(areaId);
    afterNextRender(() => this.template()?.focusAreaPick(), { injector: this.#injector });
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
  #busy(taskId: string): boolean {
    return this.#attempts.busy(taskId);
  }

  /** The stored Estimate of the Task in minutes, or null when it has none or is not in the state. */
  #estimateOf(taskId: string): number | null {
    return this.#tasksById().get(taskId)?.estimateMinutes ?? null;
  }

  /** Whether progress can be logged on the Task, by the domain's `canLogProgress`. */
  #canLogProgress(taskId: string): boolean {
    return canLogProgress(this.#tasksById().get(taskId));
  }

  /** Whether the Log progress form shows for the Task, in the card or under its row. */
  #formOpenFor(taskId: string): boolean {
    return this.#logProgressFor() === taskId && this.#canLogProgress(taskId);
  }

  /** The stored Estimate in minutes while the Task's Log progress form shows, else null. */
  #formEstimateOf(taskId: string): number | null {
    return this.#formOpenFor(taskId) ? this.#estimateOf(taskId) : null;
  }

  #estimateText(task: Task): string {
    return task.estimateMinutes === null ? '' : formatMinutes(task.estimateMinutes);
  }

  #overdue(task: Task): boolean {
    return isOverdue(task, this.#clock.now(), this.#timeZone());
  }

  /** The name of the Task's Area, or null when it has none. */
  #areaName(task: Task): string | null {
    return task.areaId === null ? null : (this.#areaNames().get(task.areaId) ?? null);
  }

  /** The Due fact that opens an Overdue Task's reason, or null when the Task is not Overdue. */
  #dueFact(item: RankedTask): string | null {
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
      afterNextRender(() => this.template()?.focusLogProgress(), { injector: this.#injector });
    }
  }

  /** Marks the card's Task Done from its button. */
  protected doneFromCard(event: NowDone): void {
    const top = this.displayed();

    if (top !== null && top.task.id === event.taskId) {
      void this.done(top.task, DoneOrigin.Button, event.keyboard);
    }
  }

  /** Marks the Task Done from a swipe; a row keeps focus off itself when it had it, so it never falls to the body. */
  protected swipeDone({ taskId, hadFocus }: NowSwipeDone): void {
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

    const neighbourId = hadFocus ? this.#neighbourIdOf(taskId) : null;

    void this.done(task, DoneOrigin.Swipe);
    if (hadFocus) {
      this.#focusRowOrTop(neighbourId);
    }
  }

  /** Holds the Task through UndoWindow, then plays the exit and rise for the card; a row just collapses. */
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
      this.#undoWindow.complete(task, origin);
      this.#rememberRow(task.id, task.id);
      return;
    }

    if (origin === DoneOrigin.Button && card !== null) {
      this.leaving.set(top);
      this.#undoWindow.complete(task, origin);
      this.#rememberRow(task.id, this.dataStore.now()?.ranked[0]?.task.id);
      if (keyboard) {
        this.#undoWindow.requestFocus();
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

    this.#undoWindow.complete(task, origin);
    this.#rememberRow(task.id, this.dataStore.now()?.ranked[0]?.task.id);
    this.#riseAfterRender(seq, !keyboard);
  }

  protected async saveProgress(minutes: number): Promise<void> {
    const taskId = this.#logProgressFor();
    if (taskId === null || this.#busy(taskId)) {
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

  /** Whether a Done for this Task is refused: it is busy, already held in UndoWindow, or its card is leaving. */
  #refusesDone(taskId: string): boolean {
    return (
      this.#busy(taskId) ||
      this.#undoWindow.pending()?.taskId === taskId ||
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
    return this.template()?.cardElement() ?? null;
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
    this.template()?.focusTop();
  }

  /** After the next render, moves focus to the link of the Task's row. */
  #focusLinkAfterRender(taskId: string): void {
    afterNextRender(() => this.template()?.focusTask(taskId), { injector: this.#injector });
  }

  /** The id of the row after this one in the list, else the one before it, else null. Read it before the Done. */
  #neighbourIdOf(taskId: string): string | null {
    const rows = this.listed();
    const index = rows.findIndex((item) => item.task.id === taskId);

    return (rows[index + 1] ?? rows[index - 1])?.task.id ?? null;
  }

  /** Moves focus now to the link of the row, or to the top pick when there is none. */
  #focusRowOrTop(taskId: string | null): void {
    if (taskId === null || this.template()?.focusTask(taskId) !== true) {
      this.#focusTopNow();
    }
  }

  /** After the next render, moves focus to the top pick's title link, or to the heading when none. */
  #focusTop(): void {
    afterNextRender(() => this.#focusTopNow(), { injector: this.#injector });
  }
}
