// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { HttpStatusCode } from '@angular/common/http';
import { computed, inject, Service, signal, type Signal } from '@angular/core';
import {
  applyChanges,
  type Change,
  ChangeEntity,
  type Command,
  CommandTag,
  type CompleteTask,
  type DomainState,
  type Instant,
  inboxCount,
  isValidTimeZone,
  pick,
  type PickResult,
} from '@asys/domain';

import {
  DataApi,
  CommandOutcomeTag,
  type CommandOutcome,
  type SnapshotData,
} from '../api/data-api';
import { HttpOutcomeTag, type HttpOutcome } from '../api/http-outcome';
import { LAST_REPORTED_ZONE_KEY } from '../auth/session';
import { Clock } from '../platform/clock';
import { DeviceStorage } from '../platform/device-storage';
import { DeviceZone } from '../platform/device-zone';
import { Ids } from '../platform/ids';
import { commandSubject, SETTINGS_SUBJECT } from './command-subject';
import { applyHolds, type Hold, isStillHeld } from './held-state';
import { zoneToReport } from './zone-to-report';

/** Where the store stands with the server. */
export enum SyncStatus {
  Idle = 'idle',
  Loading = 'loading',
  Ready = 'ready',
  Stale = 'stale',
  Failed = 'failed',
}

/** How long after a request settles the next poll starts. */
export const POLL_INTERVAL_MS = 15_000;

/** The account's time zone when it is one this device knows, else UTC. */
export const zoneOrUtc = (zone: string | undefined): string =>
  zone !== undefined && isValidTimeZone(zone) ? zone : 'UTC';

/** What a settled request looked like, for the rules that decide what comes next. */
interface Settled {
  readonly request: number;
  readonly isSnapshot: boolean;
  readonly failure: { readonly status: number; readonly errorTag: string | null } | null;
}

const isExpired = (settled: Settled): boolean =>
  !settled.isSnapshot &&
  settled.failure?.status === HttpStatusCode.Gone &&
  settled.failure.errorTag === 'ChangesExpired';

const isUnauthorized = (settled: Settled): boolean =>
  settled.failure?.status === HttpStatusCode.Unauthorized &&
  settled.failure.errorTag === 'Unauthorized';

const isApplied = (outcome: CommandOutcome): boolean =>
  outcome._tag === CommandOutcomeTag.Applied || outcome._tag === CommandOutcomeTag.NotApplicable;

/** A snapshot request issued before `start()`, with the generation it belongs to. */
interface Preload {
  readonly generation: number;
  readonly outcome: Promise<HttpOutcome<SnapshotData>>;
}

/** A command waiting for the first request started after its response to settle. */
interface Waiter {
  readonly after: number;
  readonly subject: string;
  readonly resolve: () => void;
}

/** The signed-in Owner's working set: loaded, kept current by polling, changed by commands. */
@Service()
export class DataStore {
  readonly #api = inject(DataApi);
  readonly #clock = inject(Clock);
  readonly #deviceZone = inject(DeviceZone);
  readonly #storage = inject(DeviceStorage);
  readonly #document = inject(DOCUMENT);
  readonly #ids = inject(Ids);

  readonly #statusSignal = signal<SyncStatus>(SyncStatus.Idle);
  readonly #stateSignal = signal<DomainState | null>(null);
  readonly #syncedAtSignal = signal<Instant | null>(null);
  readonly #holds = signal<readonly Hold[]>([]);
  readonly #awaitingSyncSignal = signal<ReadonlySet<string>>(new Set());

  readonly status = this.#statusSignal.asReadonly();

  /** The synced state with the holds applied locally; null without state. */
  readonly state: Signal<DomainState | null> = computed<DomainState | null>(() => {
    const synced = this.#stateSignal();

    return synced === null ? null : applyHolds(synced, this.#holds());
  });

  /** The keys of the Dones currently held. */
  readonly heldKeys: Signal<ReadonlySet<string>> = computed<ReadonlySet<string>>(
    () => new Set(this.#holds().map((hold) => hold.key)),
  );

  readonly syncedAt = this.#syncedAtSignal.asReadonly();

  /** The subjects (see commandSubject) whose command applied but whose follow-up request failed; empty once a later request succeeds. */
  readonly awaitingSync: Signal<ReadonlySet<string>> = this.#awaitingSyncSignal.asReadonly();

  /** The ranked tasks for now; null without state. */
  readonly now = computed<PickResult | null>(() => {
    const state = this.state();

    if (state === null) {
      return null;
    }

    const settings = { ...state.settings, timeZone: zoneOrUtc(state.settings.timeZone) };

    return pick(state.tasks, state.links, state.areas, settings, this.#clock.now());
  });

  /** The number of items waiting in the Inbox; 0 without state. */
  readonly inboxCount = computed<number>(() => {
    const state = this.state();

    return state === null ? 0 : inboxCount(state);
  });

  #started = false;
  #generation = 0;
  #seq = 0;
  #inFlight = false;
  #requestCount = 0;
  #followUpPending = false;
  #forcedFollowUp = false;
  #resumeInFlight = false;
  #needsSnapshot = false;
  #waiters: Waiter[] = [];
  #zoneReport: Promise<void> | null = null;
  #zoneChoices = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #preload: Preload | null = null;

  readonly #onFocus = (): void => {
    this.#trigger(true);

    if (this.#started) {
      this.#checkZone();
    }
  };

  readonly #onOnline = (): void => {
    this.#trigger();
  };

  readonly #onVisibilityChange = (): void => {
    if (this.#isVisible()) {
      this.#trigger(true);
    }
  };

  /** Requests the snapshot ahead of `start()`, which adopts it; its 401 leaves the session alone. Does nothing when started or already preloaded. */
  preload(): void {
    if (this.#started || this.#preload?.generation === this.#generation) {
      return;
    }

    this.#preload = {
      generation: this.#generation,
      outcome: this.#api.snapshot({ ignoreUnauthorized: true }),
    };
  }

  /** Drops the preloaded snapshot request, so the next `start()` asks afresh. */
  discardPreload(): void {
    this.#preload = null;
  }

  /** Loads the snapshot, adopting a preload of this generation, and starts keeping it current. Does nothing when already started. */
  start(): void {
    if (this.#started) {
      return;
    }

    this.#started = true;

    const preload = this.#preload;

    this.#preload = null;

    const view = this.#document.defaultView;

    view?.addEventListener('focus', this.#onFocus);
    view?.addEventListener('online', this.#onOnline);
    this.#document.addEventListener('visibilitychange', this.#onVisibilityChange);

    this.#requestSnapshot(true, preload?.generation === this.#generation ? preload.outcome : null);
  }

  /** Drops everything the store holds and resolves every waiting command. Requests already out are ignored when they settle. */
  stop(): void {
    this.#generation += 1;
    this.#started = false;
    this.#clearTimer();

    const view = this.#document.defaultView;

    view?.removeEventListener('focus', this.#onFocus);
    view?.removeEventListener('online', this.#onOnline);
    this.#document.removeEventListener('visibilitychange', this.#onVisibilityChange);

    this.#inFlight = false;
    this.#followUpPending = false;
    this.#forcedFollowUp = false;
    this.#resumeInFlight = false;
    this.#needsSnapshot = false;
    this.#zoneReport = null;
    this.#seq = 0;
    this.#stateSignal.set(null);
    this.#holds.set([]);
    this.#syncedAtSignal.set(null);
    this.#statusSignal.set(SyncStatus.Idle);
    this.#clearAwaitingSync();

    const waiters = this.#waiters;

    this.#waiters = [];

    for (const waiter of waiters) {
      waiter.resolve();
    }
  }

  /** Hides a Done from the state at once, before it is sent. A hold with a key already held replaces it. */
  hold(command: CompleteTask, key: string): void {
    const hold: Hold = { key, command, at: this.#clock.now() };

    this.#holds.set([...this.#holds().filter((held) => held.key !== key), hold]);
  }

  /** Lets go of the hold with this key; an unknown key changes nothing. */
  release(key: string): void {
    const holds = this.#holds();

    if (holds.some((hold) => hold.key === key)) {
      this.#holds.set(holds.filter((hold) => hold.key !== key));
    }
  }

  /** Asks for the latest changes now. */
  refresh(): void {
    this.#trigger();
  }

  /** Submits a command and resolves its outcome; an Applied or NotApplicable outcome resolves only after the store has synced past it. */
  async send(command: Command, idempotencyKey: string = this.#ids.next()): Promise<CommandOutcome> {
    const generation = this.#generation;
    const wasStarted = this.#started;
    const outcome = await this.#api.runCommand(command, idempotencyKey);

    if (wasStarted && this.#isLive(outcome, generation)) {
      await this.#syncPast(commandSubject(command));
    }

    return outcome;
  }

  /** Sets the account's time zone by the person's choice; resolves like send. */
  async chooseTimeZone(zone: string): Promise<CommandOutcome> {
    const generation = this.#generation;
    const wasStarted = this.#started;

    this.#zoneChoices += 1;

    try {
      if (this.#zoneReport !== null) {
        await this.#zoneReport;
      }

      const outcome = await this.#api.runCommand(
        { _tag: CommandTag.SetTimeZone, timeZone: zone },
        this.#ids.next(),
      );

      if (!wasStarted || !this.#isLive(outcome, generation)) {
        return outcome;
      }

      const device = this.#deviceZone.current();

      if (outcome._tag === CommandOutcomeTag.Applied && device !== undefined) {
        this.#storage.set(LAST_REPORTED_ZONE_KEY, device);
      }

      await this.#syncPast(SETTINGS_SUBJECT);

      return outcome;
    } finally {
      this.#zoneChoices -= 1;
    }
  }

  /** Whether an outcome applied while the store is started in the given generation. */
  #isLive(outcome: CommandOutcome, generation: number): boolean {
    return generation === this.#generation && this.#started && isApplied(outcome);
  }

  /** Posts a command and resolves its outcome without waiting; an applied command fires the ordinary trigger. */
  async #runOnly(command: Command, idempotencyKey: string): Promise<CommandOutcome> {
    const generation = this.#generation;
    const outcome = await this.#api.runCommand(command, idempotencyKey);

    if (this.#isLive(outcome, generation)) {
      this.#trigger();
    }

    return outcome;
  }

  /** Waits for the first request started after now to settle, starting it at once (even while hidden) when none is in flight. */
  #syncPast(subject: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.#waiters.push({ after: this.#requestCount, subject, resolve });

      if (this.#inFlight) {
        this.#followUpPending = true;
        this.#forcedFollowUp = true;
      } else {
        this.#startNext();
      }
    });
  }

  /** Resolves the waiters a settle answers: all on an unauthorized settle, else those waiting for this request or an earlier one. */
  #resolveWaiters(settled: Settled): void {
    const unauthorized = isUnauthorized(settled);
    const done = this.#waiters.filter((waiter) => unauthorized || waiter.after < settled.request);

    if (done.length === 0) {
      return;
    }

    this.#waiters = this.#waiters.filter((waiter) => !done.includes(waiter));

    if (settled.failure !== null) {
      this.#addAwaitingSync(done.map((waiter) => waiter.subject));
    }

    for (const waiter of done) {
      waiter.resolve();
    }
  }

  #addAwaitingSync(subjects: readonly string[]): void {
    const current = this.#awaitingSyncSignal();

    if (subjects.every((subject) => current.has(subject))) {
      return;
    }

    this.#awaitingSyncSignal.set(new Set([...current, ...subjects]));
  }

  #clearAwaitingSync(): void {
    if (this.#awaitingSyncSignal().size > 0) {
      this.#awaitingSyncSignal.set(new Set());
    }
  }

  /** Drops the holds the new synced state no longer needs. */
  #pruneHolds(synced: DomainState): void {
    const holds = this.#holds();
    const kept = holds.filter((hold) => isStillHeld(synced, hold));

    if (kept.length !== holds.length) {
      this.#holds.set(kept);
    }
  }

  #isVisible(): boolean {
    return this.#document.visibilityState === 'visible';
  }

  #clearTimer(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  /**
   * A trigger: poll (or load the snapshot) now, or remember one follow-up when a request is out.
   * Focus and visibilitychange pass `resume`: returning to the app fires both, so while a request
   * one of them started is out, the other adds no follow-up. Every other trigger still does.
   */
  #trigger(resume = false): void {
    if (!this.#started) {
      return;
    }

    if (!this.#isVisible() && this.#stateSignal() !== null) {
      return;
    }

    if (this.#inFlight) {
      if (!(resume && this.#resumeInFlight)) {
        this.#followUpPending = true;
      }

      return;
    }

    this.#resumeInFlight = resume;
    this.#startNext();
  }

  /** Starts a snapshot when there is no state or the store needs one, else a poll. */
  #startNext(): void {
    if (this.#stateSignal() === null) {
      this.#requestSnapshot(true);
    } else if (this.#needsSnapshot) {
      this.#requestSnapshot(false);
    } else {
      this.#requestPoll();
    }
  }

  #requestSnapshot(
    setLoading: boolean,
    adopted: Promise<HttpOutcome<SnapshotData>> | null = null,
  ): void {
    this.#clearTimer();
    this.#inFlight = true;
    this.#requestCount += 1;

    const request = this.#requestCount;

    if (setLoading) {
      this.#statusSignal.set(SyncStatus.Loading);
    }

    const generation = this.#generation;

    void this.#snapshotOutcome(adopted, generation).then((outcome) => {
      if (generation !== this.#generation) {
        return;
      }

      this.#inFlight = false;

      if (outcome._tag === HttpOutcomeTag.Ok) {
        this.#stateSignal.set(outcome.value.state);
        this.#pruneHolds(outcome.value.state);
        this.#seq = outcome.value.seq;
        this.#needsSnapshot = false;
        this.#statusSignal.set(SyncStatus.Ready);
        this.#syncedAtSignal.set(Date.now() as Instant);
        this.#checkZone();
        this.#settle({ request, isSnapshot: true, failure: null });

        return;
      }

      const failure = { status: outcome.status, errorTag: outcome.errorTag };

      const settled: Settled = { request, isSnapshot: true, failure };

      if (this.#stateSignal() !== null && !isUnauthorized(settled)) {
        this.#statusSignal.set(SyncStatus.Stale);
        this.#needsSnapshot = true;
      }

      this.#settle(settled);
    });
  }

  /** A fresh snapshot request, or the adopted one when it succeeded; a failed one is asked again unless the generation moved on. */
  #snapshotOutcome(
    adopted: Promise<HttpOutcome<SnapshotData>> | null,
    generation: number,
  ): Promise<HttpOutcome<SnapshotData>> {
    if (adopted === null) {
      return this.#api.snapshot();
    }

    return adopted.then((outcome) =>
      outcome._tag === HttpOutcomeTag.Ok || generation !== this.#generation
        ? outcome
        : this.#api.snapshot(),
    );
  }

  #requestPoll(): void {
    this.#clearTimer();
    this.#inFlight = true;
    this.#requestCount += 1;

    const request = this.#requestCount;

    const generation = this.#generation;

    void this.#api.changes(this.#seq).then((outcome) => {
      if (generation !== this.#generation) {
        return;
      }

      this.#inFlight = false;

      if (outcome._tag === HttpOutcomeTag.Ok) {
        this.#applyPoll(outcome.value.seq, outcome.value.entries);
        this.#settle({ request, isSnapshot: false, failure: null });

        return;
      }

      const failure = { status: outcome.status, errorTag: outcome.errorTag };
      const settled: Settled = { request, isSnapshot: false, failure };

      if (!isExpired(settled) && !isUnauthorized(settled)) {
        this.#statusSignal.set(SyncStatus.Stale);
      }

      this.#settle(settled);
    });
  }

  #applyPoll(seq: number, entries: readonly (Change & { readonly seq: number })[]): void {
    const state = this.#stateSignal();

    if (state === null) {
      return;
    }

    const fresh = entries.filter((entry) => entry.seq > this.#seq);

    const next = applyChanges(state, fresh);

    this.#stateSignal.set(next);
    this.#pruneHolds(next);
    this.#seq = seq;
    this.#statusSignal.set(SyncStatus.Ready);
    this.#syncedAtSignal.set(Date.now() as Instant);

    if (fresh.some((entry) => entry.entity === ChangeEntity.Settings)) {
      this.#checkZone();
    }
  }

  /**
   * Decides what comes next after a request of the current generation settled, and resolves the
   * commands waiting for it. A follow-up forced by a command runs even while hidden.
   */
  #settle(settled: Settled): void {
    const followUp = this.#followUpPending;
    const forced = this.#forcedFollowUp;

    this.#followUpPending = false;
    this.#forcedFollowUp = false;
    this.#resumeInFlight = false;

    if (isExpired(settled)) {
      this.#requestSnapshot(false);

      return;
    }

    if (settled.failure === null) {
      this.#clearAwaitingSync();
    }

    this.#resolveWaiters(settled);

    if (isUnauthorized(settled)) {
      return;
    }

    if (settled.isSnapshot && settled.failure !== null && this.#stateSignal() === null) {
      this.#statusSignal.set(SyncStatus.Failed);

      if (followUp) {
        this.#requestSnapshot(true);
      }

      return;
    }

    if (followUp && (forced || this.#isVisible())) {
      this.#startNext();

      return;
    }

    this.#clearTimer();

    if (this.#isVisible()) {
      this.#timer = setTimeout(() => {
        this.#timer = undefined;

        if (this.#started && this.#isVisible() && !this.#inFlight) {
          this.#startNext();
        }
      }, POLL_INTERVAL_MS);
    }
  }

  /** Records or reports the device time zone when it differs from the account's; reports nothing while the person chooses one. */
  #checkZone(): void {
    const state = this.#stateSignal();

    if (state === null) {
      return;
    }

    const { report, record } = zoneToReport(
      this.#deviceZone.current(),
      state.settings.timeZone,
      this.#storage.get(LAST_REPORTED_ZONE_KEY),
    );

    if (record !== null) {
      this.#storage.set(LAST_REPORTED_ZONE_KEY, record);
    }

    if (report === null || this.#zoneReport !== null || this.#zoneChoices > 0) {
      return;
    }

    const generation = this.#generation;

    this.#zoneReport = this.#runOnly(
      { _tag: CommandTag.SetTimeZone, timeZone: report },
      this.#ids.next(),
    ).then((outcome) => {
      if (generation !== this.#generation) {
        return;
      }

      this.#zoneReport = null;

      if (
        outcome._tag === CommandOutcomeTag.Applied ||
        outcome._tag === CommandOutcomeTag.NotApplicable ||
        outcome._tag === CommandOutcomeTag.Rejected
      ) {
        this.#storage.set(LAST_REPORTED_ZONE_KEY, report);
      }
    });
  }
}
