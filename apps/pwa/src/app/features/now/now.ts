// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
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
  isValidTimeZone,
  type Task,
  TaskStatus,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { TaskMorph } from '../../core/platform/task-morph';
import { Button, ButtonVariant } from '../../ui/button/button';
import { LogProgressForm } from '../../ui/log-progress-form/log-progress-form';
import { PickerRow, PickerRowVariant } from '../../ui/picker-row/picker-row';
import { SectionHeader } from '../../ui/section-header/section-header';
import { TopPick } from '../../ui/top-pick/top-pick';

const MIN_LOGGABLE_ESTIMATE = 2;

/** What to do now: the top pick with its actions, the other ranked Tasks, and the ones that wait. */
@Component({
  selector: 'app-now',
  imports: [Button, LogProgressForm, PickerRow, RouterLink, SectionHeader, TopPick],
  providers: [CommandAttempts],
  template: `
    <h1 #heading class="now__title" tabindex="-1">Now</h1>
    <p class="now__status" role="status">{{ statusLine() }}</p>
    @if (dataStore.now(); as now) {
      @if (now.ranked[0]; as top) {
        <asys-top-pick
          [title]="top.task.title"
          [reason]="top.reasonText"
          [quadrant]="top.reason.quadrant"
          [overdue]="top.reason.overdue"
          [estimate]="estimateText(top.task)"
          [taskId]="top.task.id"
          [morph]="morphId() === top.task.id"
          [canLogProgress]="canLogProgress()"
          [actionsDisabled]="busy(top.task.id)"
          (done)="done(top.task)"
          (logProgress)="openForm(top.task.id)"
          (open)="open(top.task.id)"
        >
          @if (dataStore.awaitingSync().has(top.task.id)) {
            <p class="now__sync">Saved. Waiting for the server.</p>
          }
          @if (formOpen() && storedEstimate(); as estimate) {
            <asys-log-progress-form
              [estimateMinutes]="estimate"
              [busy]="busy(top.task.id)"
              (save)="saveProgress($event)"
              (cancel)="cancelForm()"
              (focusin)="focusInside = true"
              (focusout)="focusInside = false"
            />
          }
        </asys-top-pick>
      } @else {
        <p class="now__text">Nothing to do right now.</p>
        @if (inboxTaskCount() > 0) {
          <p class="now__text">
            <a routerLink="/inbox">
              {{
                inboxTaskCount() === 1
                  ? '1 Task waits for Triage.'
                  : inboxTaskCount() + ' Tasks wait for Triage.'
              }}
            </a>
          </p>
        }
      }
      @if (now.ranked.length > 1) {
        <ul class="now__list">
          @for (item of now.ranked.slice(1); track item.task.id) {
            <li>
              <a
                asys-picker-row
                [routerLink]="['/tasks', item.task.id]"
                [reason]="item.reasonText"
                [estimate]="estimateText(item.task)"
                [quadrant]="item.reason.quadrant"
                [taskId]="item.task.id"
                [morph]="morphId() === item.task.id"
                [overdue]="item.reason.overdue"
                [variant]="Rows.Ranked"
              >
                {{ item.task.title }}
              </a>
            </li>
          }
        </ul>
      }
      @if (now.waiting.length > 0) {
        <asys-section-header
          [title]="'Waiting'"
          [count]="now.waiting.length"
          [(expanded)]="waitingExpanded"
        />
        @if (waitingExpanded()) {
          <ul class="now__list">
            @for (item of now.waiting; track item.task.id) {
              <li>
                <a
                  asys-picker-row
                  [routerLink]="['/tasks', item.task.id]"
                  [reason]="item.reasonText"
                  [estimate]="estimateText(item.task)"
                  [taskId]="item.task.id"
                  [morph]="morphId() === item.task.id"
                  [overdue]="overdue(item.task)"
                  [variant]="Rows.Waiting"
                >
                  {{ item.task.title }}
                </a>
              </li>
            }
          </ul>
        }
      }
    } @else if (dataStore.status() === Status.Failed) {
      <p role="alert">ASYS could not load your Tasks.</p>
      <button asys-button type="button" [variant]="Variant.Quiet" (click)="dataStore.refresh()">
        Try again
      </button>
    } @else {
      <p>Loading…</p>
    }
  `,
  styles: `
    .now__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .now__status {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .now__status:empty {
      margin: 0;
    }

    .now__sync {
      margin: 0;
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      color: var(--ink-muted);
    }

    .now__list {
      margin: var(--space-4) 0 0;
      padding: 0;
      list-style: none;
    }

    .now__text {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class Now {
  protected readonly dataStore = inject(DataStore);

  private readonly clock = inject(Clock);

  private readonly attempts = inject(CommandAttempts);

  private readonly router = inject(Router);

  private readonly injector = inject(Injector);

  private readonly destroyRef = inject(DestroyRef);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly Rows = PickerRowVariant;

  protected readonly morphId = inject(TaskMorph).taskId;

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  private readonly topPick = viewChild(TopPick);

  protected readonly waitingExpanded = signal(false);

  protected readonly statusLine = signal('');

  /** The Task ids with a Done or Log progress send in flight. */
  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());

  /** Whether focus is inside the open Log progress form, tracked from its focus events. */
  protected focusInside = false;

  private formWasOpen = false;

  private readonly topId = computed(() => this.dataStore.now()?.ranked[0]?.task.id ?? null);

  private readonly topTask = computed(() => {
    const id = this.topId();
    return id === null ? undefined : this.dataStore.state()?.tasks.find((task) => task.id === id);
  });

  protected readonly storedEstimate = computed(() => this.topTask()?.estimateMinutes ?? null);

  protected readonly canLogProgress = computed(() => {
    const task = this.topTask();
    return (
      task !== undefined &&
      task.status === TaskStatus.Open &&
      task.estimateMinutes !== null &&
      task.estimateMinutes >= MIN_LOGGABLE_ESTIMATE
    );
  });

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

  private readonly timeZone = computed(() => {
    const zone = this.dataStore.state()?.settings.timeZone ?? 'UTC';
    return isValidTimeZone(zone) ? zone : 'UTC';
  });

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

  protected async done(task: Task): Promise<void> {
    if (this.busy(task.id)) {
      return;
    }
    this.statusLine.set('');
    const command: Command = {
      _tag: CommandTag.CompleteTask,
      taskId: task.id,
      expect: { status: TaskStatus.Open },
    };
    const outcome = await this.run(task.id, command);
    if (this.destroyRef.destroyed) {
      return;
    }
    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.statusLine.set(`“${task.title}” is Done.`);
      this.focusTop();
    } else {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
    }
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

  /** Sends the command with its attempt key and marks the Task pending meanwhile. */
  private async run(taskId: string, command: Command): Promise<CommandOutcome> {
    const key = this.attempts.keyFor(command);
    this.pendingIds.update((ids) => new Set([...ids, taskId]));
    try {
      const outcome = await this.dataStore.send(command, key);
      this.attempts.settle(command, outcome);
      return outcome;
    } finally {
      this.pendingIds.update((ids) => new Set([...ids].filter((id) => id !== taskId)));
    }
  }

  /** After the next render, moves focus to the top pick's title, or to the heading when none. */
  private focusTop(): void {
    afterNextRender(
      () => {
        const topPick = this.topPick();
        if (topPick === undefined) {
          this.heading()?.nativeElement.focus();
        } else {
          topPick.focusTitle();
        }
      },
      { injector: this.injector },
    );
  }
}
