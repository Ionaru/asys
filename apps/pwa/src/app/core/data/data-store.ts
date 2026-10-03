// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { computed, inject, Service, signal } from '@angular/core';
import {
  applyChanges,
  type Change,
  ChangeEntity,
  type Command,
  CommandTag,
  type DomainState,
  type Instant,
  inboxCount,
  isValidTimeZone,
  pick,
  type PickResult,
} from '@asys/domain';

import { DataApi, CommandOutcomeTag, type CommandOutcome } from '../api/data-api';
import { HttpOutcomeTag } from '../api/http-outcome';
import { LAST_REPORTED_ZONE_KEY } from '../auth/session';
import { Clock } from '../platform/clock';
import { DeviceStorage } from '../platform/device-storage';
import { DeviceZone } from '../platform/device-zone';
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

const HTTP_UNAUTHORIZED = 401;

const HTTP_GONE = 410;

/** What a settled request looked like, for the rules that decide what comes next. */
interface Settled {
  readonly isSnapshot: boolean;
  readonly failure: { readonly status: number; readonly errorTag: string | null } | null;
}

const isExpired = (settled: Settled): boolean =>
  !settled.isSnapshot &&
  settled.failure?.status === HTTP_GONE &&
  settled.failure.errorTag === 'ChangesExpired';

const isUnauthorized = (settled: Settled): boolean =>
  settled.failure?.status === HTTP_UNAUTHORIZED && settled.failure.errorTag === 'Unauthorized';

/** The signed-in Owner's working set: loaded, kept current by polling, changed by commands. */
@Service()
export class DataStore {
  private readonly api = inject(DataApi);
  private readonly clock = inject(Clock);
  private readonly deviceZone = inject(DeviceZone);
  private readonly storage = inject(DeviceStorage);
  private readonly document = inject(DOCUMENT);

  private readonly statusSignal = signal<SyncStatus>(SyncStatus.Idle);
  private readonly stateSignal = signal<DomainState | null>(null);
  private readonly syncedAtSignal = signal<Instant | null>(null);

  readonly status = this.statusSignal.asReadonly();
  readonly state = this.stateSignal.asReadonly();
  readonly syncedAt = this.syncedAtSignal.asReadonly();

  /** The ranked tasks for now; null without state. */
  readonly now = computed<PickResult | null>(() => {
    const state = this.stateSignal();

    if (state === null) {
      return null;
    }

    const settings = isValidTimeZone(state.settings.timeZone)
      ? state.settings
      : { ...state.settings, timeZone: 'UTC' };

    return pick(state.tasks, state.links, state.areas, settings, this.clock.now());
  });

  /** The number of items waiting in the Inbox; 0 without state. */
  readonly inboxCount = computed<number>(() => {
    const state = this.stateSignal();

    return state === null ? 0 : inboxCount(state);
  });

  private started = false;
  private generation = 0;
  private seq = 0;
  private inFlight = false;
  private followUpPending = false;
  private needsSnapshot = false;
  private zoneSendInFlight = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly onFocus = (): void => {
    this.trigger();

    if (this.started) {
      this.checkZone();
    }
  };

  private readonly onOnline = (): void => {
    this.trigger();
  };

  private readonly onVisibilityChange = (): void => {
    if (this.isVisible()) {
      this.trigger();
    }
  };

  /** Loads the snapshot and starts keeping it current. Does nothing when already started. */
  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;

    const view = this.document.defaultView;

    view?.addEventListener('focus', this.onFocus);
    view?.addEventListener('online', this.onOnline);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.requestSnapshot(true);
  }

  /** Drops everything the store holds. Requests already out are ignored when they settle. */
  stop(): void {
    this.generation += 1;
    this.started = false;
    this.clearTimer();

    const view = this.document.defaultView;

    view?.removeEventListener('focus', this.onFocus);
    view?.removeEventListener('online', this.onOnline);
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);

    this.inFlight = false;
    this.followUpPending = false;
    this.needsSnapshot = false;
    this.zoneSendInFlight = false;
    this.seq = 0;
    this.stateSignal.set(null);
    this.syncedAtSignal.set(null);
    this.statusSignal.set(SyncStatus.Idle);
  }

  /** Asks for the latest changes now. */
  refresh(): void {
    this.trigger();
  }

  /** Submits a command and resolves its outcome. An applied command makes the store poll. */
  async send(
    command: Command,
    idempotencyKey: string = crypto.randomUUID(),
  ): Promise<CommandOutcome> {
    const generation = this.generation;
    const outcome = await this.api.runCommand(command, idempotencyKey);

    if (
      generation === this.generation &&
      this.started &&
      (outcome._tag === CommandOutcomeTag.Applied ||
        outcome._tag === CommandOutcomeTag.NotApplicable)
    ) {
      this.trigger();
    }

    return outcome;
  }

  private isVisible(): boolean {
    return this.document.visibilityState === 'visible';
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** A trigger: poll (or load the snapshot) now, or remember one follow-up when a request is out. */
  private trigger(): void {
    if (!this.started) {
      return;
    }

    if (!this.isVisible() && this.stateSignal() !== null) {
      return;
    }

    if (this.inFlight) {
      this.followUpPending = true;

      return;
    }

    this.startNext();
  }

  /** Starts a snapshot when there is no state or the store needs one, else a poll. */
  private startNext(): void {
    if (this.stateSignal() === null) {
      this.requestSnapshot(true);
    } else if (this.needsSnapshot) {
      this.requestSnapshot(false);
    } else {
      this.requestPoll();
    }
  }

  private requestSnapshot(setLoading: boolean): void {
    this.clearTimer();
    this.inFlight = true;

    if (setLoading) {
      this.statusSignal.set(SyncStatus.Loading);
    }

    const generation = this.generation;

    void this.api.snapshot().then((outcome) => {
      if (generation !== this.generation) {
        return;
      }

      this.inFlight = false;

      if (outcome._tag === HttpOutcomeTag.Ok) {
        this.stateSignal.set(outcome.value.state);
        this.seq = outcome.value.seq;
        this.needsSnapshot = false;
        this.statusSignal.set(SyncStatus.Ready);
        this.syncedAtSignal.set(Date.now() as Instant);
        this.checkZone();
        this.settle({ isSnapshot: true, failure: null });

        return;
      }

      const failure = { status: outcome.status, errorTag: outcome.errorTag };

      if (this.stateSignal() !== null && !isUnauthorized({ isSnapshot: true, failure })) {
        this.statusSignal.set(SyncStatus.Stale);
        this.needsSnapshot = true;
      }

      this.settle({ isSnapshot: true, failure });
    });
  }

  private requestPoll(): void {
    this.clearTimer();
    this.inFlight = true;

    const generation = this.generation;

    void this.api.changes(this.seq).then((outcome) => {
      if (generation !== this.generation) {
        return;
      }

      this.inFlight = false;

      if (outcome._tag === HttpOutcomeTag.Ok) {
        this.applyPoll(outcome.value.seq, outcome.value.entries);
        this.settle({ isSnapshot: false, failure: null });

        return;
      }

      const failure = { status: outcome.status, errorTag: outcome.errorTag };
      const settled: Settled = { isSnapshot: false, failure };

      if (!isExpired(settled) && !isUnauthorized(settled)) {
        this.statusSignal.set(SyncStatus.Stale);
      }

      this.settle(settled);
    });
  }

  private applyPoll(seq: number, entries: readonly (Change & { readonly seq: number })[]): void {
    const state = this.stateSignal();

    if (state === null) {
      return;
    }

    const fresh = entries.filter((entry) => entry.seq > this.seq);

    this.stateSignal.set(applyChanges(state, fresh));
    this.seq = seq;
    this.statusSignal.set(SyncStatus.Ready);
    this.syncedAtSignal.set(Date.now() as Instant);

    if (fresh.some((entry) => entry.entity === ChangeEntity.Settings)) {
      this.checkZone();
    }
  }

  /** Decides what comes next after a request of the current generation settled. */
  private settle(settled: Settled): void {
    if (isExpired(settled)) {
      this.followUpPending = false;
      this.requestSnapshot(false);

      return;
    }

    if (isUnauthorized(settled)) {
      this.followUpPending = false;

      return;
    }

    const followUp = this.followUpPending;

    if (settled.isSnapshot && settled.failure !== null && this.stateSignal() === null) {
      this.statusSignal.set(SyncStatus.Failed);

      if (followUp) {
        this.followUpPending = false;
        this.requestSnapshot(true);
      }

      return;
    }

    if (followUp) {
      this.followUpPending = false;

      if (this.isVisible()) {
        this.startNext();

        return;
      }
    }

    this.clearTimer();

    if (this.isVisible()) {
      this.timer = setTimeout(() => {
        this.timer = undefined;

        if (this.started && this.isVisible() && !this.inFlight) {
          this.startNext();
        }
      }, POLL_INTERVAL_MS);
    }
  }

  /** Records or reports the device time zone when it differs from the account's. */
  private checkZone(): void {
    const state = this.stateSignal();

    if (state === null) {
      return;
    }

    const { report, record } = zoneToReport(
      this.deviceZone.current(),
      state.settings.timeZone,
      this.storage.get(LAST_REPORTED_ZONE_KEY),
    );

    if (record !== null) {
      this.storage.set(LAST_REPORTED_ZONE_KEY, record);
    }

    if (report === null || this.zoneSendInFlight) {
      return;
    }

    this.zoneSendInFlight = true;

    const generation = this.generation;

    void this.send({ _tag: CommandTag.SetTimeZone, timeZone: report }).then((outcome) => {
      if (generation !== this.generation) {
        return;
      }

      this.zoneSendInFlight = false;

      if (
        outcome._tag === CommandOutcomeTag.Applied ||
        outcome._tag === CommandOutcomeTag.NotApplicable ||
        outcome._tag === CommandOutcomeTag.Rejected
      ) {
        this.storage.set(LAST_REPORTED_ZONE_KEY, report);
      }
    });
  }
}
