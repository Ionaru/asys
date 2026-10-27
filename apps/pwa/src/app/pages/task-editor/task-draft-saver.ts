// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  type Signal,
  Service,
  signal,
  untracked,
  type WritableSignal,
} from '@angular/core';
import { CommandTag, type EditTask, type Task, TaskStatus } from '@asys/domain';

import { CommandOutcomeTag, DataApi, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore } from '../../core/data/data-store';
import { type DraftFields, followStore, settleSaved } from '../../core/data/draft-follow';
import { outcomeMessage } from '../../core/data/outcome-message';
import {
  buildSavePatch,
  COMMITTED_FIELDS,
  type CommittedText,
  committedOf,
  draftOf,
  savableDraft,
  TASK_DRAFT_FIELDS,
  type TaskDraft,
} from '../../core/data/task-patch';

/** What the last save of this visit came to. */
export enum SaveState {
  /** Nothing sent yet in this visit. */
  Idle = 'idle',
  /** A send is in flight. */
  Saving = 'saving',
  /** The last send was Applied. */
  Saved = 'saved',
  /** The last send's outcome was Failed; `retry()` resends. */
  Failed = 'failed',
  /** Rejected or KeyReused; not resent until the patch changes. */
  Refused = 'refused',
  /** NotApplicable; nothing more is sent in this visit. */
  Stopped = 'stopped',
}

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  notes: '',
  areaId: '',
  important: null,
  estimateMinutes: null,
  availableFrom: null,
  due: null,
};

const EMPTY_COMMITTED: CommittedText = { title: '', notes: '' };

/** An EditTask with the draft values it was built from, so its outcome can settle the draft. */
interface SaveAttempt {
  readonly command: EditTask;
  readonly json: string;
  readonly baseline: TaskDraft;
  readonly model: TaskDraft;
  readonly committed: CommittedText;
}

/** `fields` limited to the keys the patch carried. */
const carried = <D>(fields: DraftFields<D>, patch: object): DraftFields<D> => ({
  keys: fields.keys.filter((key) => key in patch),
  same: fields.same,
});

/** `fields` limited to the keys the patch did not carry. */
const uncarried = <D>(fields: DraftFields<D>, patch: object): DraftFields<D> => ({
  keys: fields.keys.filter((key) => !(key in patch)),
  same: fields.same,
});

/** Whether any field of the two drafts differs. */
const differs = <D>(fields: DraftFields<D>, a: D, b: D): boolean =>
  fields.keys.some((key) => !fields.same(key, a, b));

/**
 * The draft of one Task editor and the loop that saves it as it changes. Provide it per editor, next
 * to CommandAttempts: `providers: [CommandAttempts, TaskDraftSaver]`.
 */
@Service({ autoProvided: false })
export class TaskDraftSaver {
  readonly #dataStore = inject(DataStore);

  readonly #attempts = inject(CommandAttempts);

  readonly #dataApi = inject(DataApi);

  readonly #document = inject(DOCUMENT);

  readonly #destroyRef = inject(DestroyRef);

  readonly #injector = inject(Injector);

  #taskId: () => string = () => '';

  readonly #baseline = signal<TaskDraft | null>(null);

  readonly #committed = signal<CommittedText>(EMPTY_COMMITTED);

  readonly #state = signal(SaveState.Idle);

  readonly #message = signal('');

  readonly #halted = signal(false);

  readonly #sending = signal(false);

  /** The stored status when the baseline was first set. */
  #expectedStatus: TaskStatus = TaskStatus.Open;

  /** The key of the last patch that came back Rejected or KeyReused. */
  #lastRefusedKey: string | null = null;

  /** Set by a save request that arrives while the loop is busy: the loop takes another pass. */
  #again = false;

  /** The flushed command that waits for the send in flight, in place of an "again" pass. */
  #queued: SaveAttempt | null = null;

  /** The command JSON of the send in flight. */
  #inFlight: string | null = null;

  /** How many runs of the loop are active, including one waiting for its microtask. */
  #runs = 0;

  #idleWaiters: (() => void)[] = [];

  #destroyed = false;

  #view: Window | null = null;

  #listening = false;

  /** The draft the form edits. */
  readonly model: WritableSignal<TaskDraft> = signal(EMPTY_DRAFT);

  /** The stored values the draft follows; null until the Task first appears. */
  readonly baseline: Signal<TaskDraft | null> = this.#baseline.asReadonly();

  /** Title and Notes as last committed. */
  readonly committed: Signal<CommittedText> = this.#committed.asReadonly();

  /** The stored Task; undefined while it is not in the store. */
  readonly task: Signal<Task | undefined> = computed(() => {
    const id = this.#taskId();

    return this.#dataStore.state()?.tasks.find((task) => task.id === id);
  });

  /** What the last save of this visit came to. */
  readonly state: Signal<SaveState> = this.#state.asReadonly();

  /** The message of the last send that was not Applied, else ''. */
  readonly message: Signal<string> = this.#message.asReadonly();

  /** The title is empty. */
  readonly needsTitle: Signal<boolean> = computed(() => this.model().title.trim() === '');

  /** The Task has an Estimate and the draft has none. */
  readonly needsEstimate: Signal<boolean> = computed(() => {
    const baseline = this.#baseline();

    return (
      baseline !== null &&
      baseline.estimateMinutes !== null &&
      this.model().estimateMinutes === null
    );
  });

  /** The Task has an Importance and the draft has none. */
  readonly needsImportance: Signal<boolean> = computed(() => {
    const baseline = this.#baseline();

    return baseline !== null && baseline.important !== null && this.model().important === null;
  });

  /** Nothing is sent: no baseline, no stored Task, halted, Stopped, or the store has yet to sync. */
  readonly #blocked = computed(() => {
    const task = this.task();

    return (
      this.#baseline() === null ||
      task === undefined ||
      this.#halted() ||
      this.#state() === SaveState.Stopped ||
      this.#dataStore.awaitingSync().has(task.id)
    );
  });

  /** Saving is not blocked and the draft holds nothing to save. */
  readonly #nothingToSave = computed(() => {
    const baseline = this.#baseline();

    return (
      baseline !== null &&
      !this.#blocked() &&
      Object.keys(buildSavePatch(baseline, this.model(), this.#committed())).length === 0
    );
  });

  /** The patch a save would send now, as JSON; null while blocked or when there is nothing to send. */
  readonly #saveKey = computed(() => {
    const baseline = this.#baseline();

    if (baseline === null || this.#blocked()) {
      return null;
    }

    const patch = buildSavePatch(baseline, this.model(), this.#committed());

    return Object.keys(patch).length === 0 ? null : JSON.stringify(patch);
  });

  /** Whether the top bar shows "Saved": the last send was Applied and nothing is left to save. */
  readonly saved: Signal<boolean> = computed(() => {
    const baseline = this.#baseline();

    if (baseline === null || this.#state() !== SaveState.Saved || this.#sending()) {
      return false;
    }

    const model = this.model();
    const committed = this.#committed();

    return (
      Object.keys(buildSavePatch(baseline, model, committed)).length === 0 &&
      model.title === committed.title &&
      model.notes === committed.notes &&
      !this.needsTitle() &&
      !this.needsEstimate() &&
      !this.needsImportance()
    );
  });

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true;

      if (this.#listening) {
        this.#document.removeEventListener('visibilitychange', this.#onVisibilityChange);
        this.#view?.removeEventListener('pagehide', this.#onPageHide);
      }

      if (this.task() !== undefined) {
        this.flush();
      }
    });
  }

  /** Starts following the Task with this id, saving its changes, and saving when the page is left. */
  connect(taskId: () => string): void {
    this.#taskId = taskId;

    effect(
      () => {
        const task = this.task();

        untracked(() => this.#follow(task));
      },
      { injector: this.#injector },
    );

    effect(
      () => {
        const key = this.#saveKey();

        if (key !== null && key !== this.#lastRefusedKey) {
          untracked(() => this.requestSave());
        }
      },
      { injector: this.#injector },
    );

    effect(
      () => {
        if (this.#nothingToSave() && this.#isStale(this.#state())) {
          untracked(() => this.#clearStale());
        }
      },
      { injector: this.#injector },
    );

    this.#view = this.#document.defaultView;
    this.#listening = true;
    this.#document.addEventListener('visibilitychange', this.#onVisibilityChange);
    this.#view?.addEventListener('pagehide', this.#onPageHide);
  }

  /** Commits the typed Title and Notes, so they are saved. */
  commit(): void {
    const { title, notes } = this.model();
    const committed = this.#committed();

    if (committed.title !== title || committed.notes !== notes) {
      this.#committed.set({ title, notes });
    }
  }

  /** Saves what changed: marks another pass while a send is in flight, else runs the loop. */
  requestSave(): void {
    if (this.#runs > 0) {
      this.#again = true;
      return;
    }

    void this.#run(null);
  }

  /** Sends the same patch again after a Failed outcome; an identical command reuses its key. */
  retry(): void {
    this.requestSave();
  }

  /**
   * Commits and sends the draft at once, for a Done and for destroy. A send in flight makes it wait
   * its turn; an identical command already in flight or queued is not added again.
   */
  flush(): void {
    this.commit();

    const baseline = this.#baseline();

    if (baseline === null || this.#halted() || this.#state() === SaveState.Stopped) {
      return;
    }

    const attempt = this.#attemptNow();

    if (
      attempt === null ||
      attempt.json === this.#inFlight ||
      attempt.json === this.#queued?.json
    ) {
      return;
    }

    if (this.#sending()) {
      this.#again = false;
      this.#queued = attempt;
      return;
    }

    void this.#run(attempt);
  }

  /** Sends nothing more, for a Drop; a send in flight finishes. */
  halt(): void {
    this.#halted.set(true);
    this.#again = false;
    this.#queued = null;
  }

  /** Undoes `halt()`, for a Drop that was not Applied. */
  resume(): void {
    this.#halted.set(false);
  }

  /** Resolves once no send is in flight or queued. */
  idle(): Promise<void> {
    if (this.#runs === 0 && this.#queued === null) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.#idleWaiters.push(resolve);
    });
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
      this.model.set(stored);
      this.#committed.set(committedOf(stored));
      return;
    }

    const model = this.model();
    const committed = this.#committed();
    const next = followStore(TASK_DRAFT_FIELDS, baseline, model, stored);
    const nextCommitted = followStore(
      COMMITTED_FIELDS,
      committedOf(baseline),
      committed,
      committedOf(stored),
    ).draft;

    if (differs(TASK_DRAFT_FIELDS, baseline, next.baseline)) {
      this.#baseline.set(next.baseline);
    }

    if (differs(TASK_DRAFT_FIELDS, model, next.draft)) {
      this.model.set(next.draft);
    }

    if (differs(COMMITTED_FIELDS, committed, nextCommitted)) {
      this.#committed.set(nextCommitted);
    }
  }

  /** Whether a state is a failure that stays until there is something to send or nothing left to save. */
  #isStale(state: SaveState): boolean {
    return state === SaveState.Failed || state === SaveState.Refused;
  }

  /** With nothing left to save, a Failed or Refused state, its message and its refused key end. */
  #clearStale(): void {
    if (this.#isStale(this.#state()) && this.#nothingToSave()) {
      this.#state.set(SaveState.Saved);
      this.#message.set('');
      this.#lastRefusedKey = null;
    }
  }

  /** The EditTask for the draft as it is now, or null when there is no baseline or nothing changed. */
  #attemptNow(): SaveAttempt | null {
    const baseline = this.#baseline();

    if (baseline === null) {
      return null;
    }

    const model = this.model();
    const committed = this.#committed();
    const patch = buildSavePatch(baseline, model, committed);

    if (Object.keys(patch).length === 0) {
      return null;
    }

    const command: EditTask = {
      _tag: CommandTag.EditTask,
      taskId: this.#taskId(),
      patch,
      expect: { status: this.#expectedStatus },
    };

    return { command, json: JSON.stringify(command), baseline, model, committed };
  }

  /**
   * The save loop. Starting with `first` it sends that at once; otherwise it waits one microtask,
   * so changes made together go out together. It repeats while another pass or a queued flush waits.
   */
  async #run(first: SaveAttempt | null): Promise<void> {
    this.#runs += 1;

    try {
      let attempt = first;

      for (;;) {
        if (attempt === null) {
          this.#again = false;
          await Promise.resolve();

          if (this.#sending()) {
            // A flush started a send while this run waited; its run takes the next pass.
            this.#again = true;
            return;
          }

          if (this.#blocked()) {
            return;
          }

          attempt = this.#attemptNow();

          if (attempt === null) {
            this.#clearStale();
            return;
          }
        }

        const outcome = await this.#send(attempt);
        const carryOn = this.#settle(attempt, outcome);
        const queued = this.#queued;

        this.#queued = null;

        if (
          queued !== null &&
          !this.#halted() &&
          this.#state() !== SaveState.Stopped &&
          outcome._tag !== CommandOutcomeTag.SignedOut
        ) {
          attempt = queued;
          continue;
        }

        if (!carryOn || !this.#again || this.#destroyed || this.#halted()) {
          return;
        }

        attempt = null;
      }
    } finally {
      this.#runs -= 1;

      if (this.#runs === 0 && this.#queued === null) {
        const waiters = this.#idleWaiters;

        this.#idleWaiters = [];

        for (const resolve of waiters) {
          resolve();
        }
      }
    }
  }

  async #send(attempt: SaveAttempt): Promise<CommandOutcome> {
    this.#inFlight = attempt.json;
    this.#sending.set(true);
    this.#state.set(SaveState.Saving);

    try {
      return await this.#attempts.send(attempt.command);
    } finally {
      this.#inFlight = null;
      this.#sending.set(false);
    }
  }

  /** Records the outcome and settles the draft; returns whether the loop may take another pass. */
  #settle(attempt: SaveAttempt, outcome: CommandOutcome): boolean {
    switch (outcome._tag) {
      case CommandOutcomeTag.Applied:
        return this.#applied(attempt);
      case CommandOutcomeTag.Failed:
        this.#state.set(SaveState.Failed);
        this.#message.set(outcomeMessage(outcome) ?? '');
        this.#dataStore.refresh();
        return false;
      case CommandOutcomeTag.Rejected:
      case CommandOutcomeTag.KeyReused:
        this.#state.set(SaveState.Refused);
        this.#message.set(outcomeMessage(outcome) ?? '');
        this.#lastRefusedKey = JSON.stringify(attempt.command.patch);
        return false;
      case CommandOutcomeTag.NotApplicable:
        this.#state.set(SaveState.Stopped);
        this.#message.set(outcomeMessage(outcome) ?? '');
        return false;
      case CommandOutcomeTag.SignedOut:
        return false;
    }
  }

  #applied(attempt: SaveAttempt): boolean {
    this.#state.set(SaveState.Saved);
    this.#message.set('');
    this.#lastRefusedKey = null;

    const task = this.task();

    if (task === undefined) {
      return true;
    }

    const stored = draftOf(task);
    const patch = attempt.command.patch;
    const holding = this.#dataStore.awaitingSync().has(task.id);
    const previous = this.#baseline();
    const storedText = committedOf(stored);
    // The poll that follows an Applied answer can reach here before the follow effect sees it, so the
    // keys the patch did not carry follow the store now, as `#follow` would.
    const following =
      previous === null
        ? null
        : {
            model: followStore(uncarried(TASK_DRAFT_FIELDS, patch), previous, this.model(), stored)
              .draft,
            committed: followStore(
              uncarried(COMMITTED_FIELDS, patch),
              committedOf(previous),
              this.#committed(),
              storedText,
            ).draft,
          };

    this.#baseline.set(stored);

    if (!holding) {
      this.model.set(
        settleSaved(
          carried(TASK_DRAFT_FIELDS, patch),
          savableDraft(attempt.baseline, attempt.model, attempt.committed),
          following?.model ?? this.model(),
          stored,
        ),
      );
    }

    this.#committed.set(
      settleSaved(
        carried(COMMITTED_FIELDS, patch),
        attempt.committed,
        following?.committed ?? this.#committed(),
        storedText,
      ),
    );

    return !holding;
  }

  /** Sends the draft with keepalive, so the request outlives the page; the loop does not track it. */
  #sendKeepalive(): void {
    this.commit();

    if (this.#blocked()) {
      return;
    }

    const attempt = this.#attemptNow();

    if (attempt !== null) {
      void this.#dataApi.runCommand(attempt.command, this.#attempts.keyFor(attempt.command), {
        keepalive: true,
      });
    }
  }

  readonly #onVisibilityChange = (): void => {
    if (this.#document.visibilityState === 'hidden') {
      this.#sendKeepalive();
    }
  };

  readonly #onPageHide = (): void => {
    this.#sendKeepalive();
  };
}
