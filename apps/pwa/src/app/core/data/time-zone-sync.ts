// SPDX-License-Identifier: EUPL-1.2
import { inject, Service } from '@angular/core';
import { type Command, CommandTag } from '@asys/domain';

import { DataApi, CommandOutcomeTag, type CommandOutcome } from '../api/data-api';
import { DeviceZone } from '../platform/device-zone';
import { Ids } from '../platform/ids';
import { ReportedZone } from '../platform/reported-zone';
import { SETTINGS_SUBJECT } from './command-subject';
import { DataStore, isApplied } from './data-store';
import { zoneToReport } from './zone-to-report';

/** Keeps the account's time zone in step with this device's, and sets the zone the person chooses. */
@Service()
export class TimeZoneSync {
  readonly #api = inject(DataApi);
  readonly #dataStore = inject(DataStore);
  readonly #deviceZone = inject(DeviceZone);
  readonly #reportedZone = inject(ReportedZone);
  readonly #ids = inject(Ids);

  #started = false;
  #generation = 0;
  #report: Promise<void> | null = null;
  #choices = 0;
  #removeCheck: (() => void) | null = null;

  /** Checks the zone at each of the store's settings checks. Does nothing when already started. */
  start(): void {
    if (this.#started) {
      return;
    }

    this.#started = true;
    this.#removeCheck = this.#dataStore.onSettingsCheck(() => {
      this.#check();
    });
  }

  /** Stops checking. A report or choice already out writes nothing when it settles. */
  stop(): void {
    this.#generation += 1;
    this.#started = false;
    this.#report = null;
    this.#removeCheck?.();
    this.#removeCheck = null;
  }

  /** Sets the account's time zone by the person's choice; resolves like `DataStore.send`. */
  async choose(zone: string): Promise<CommandOutcome> {
    const generation = this.#generation;
    const wasStarted = this.#started;

    this.#choices += 1;

    try {
      if (this.#report !== null) {
        await this.#report;
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
        this.#reportedZone.set(device);
      }

      await this.#dataStore.syncPast(SETTINGS_SUBJECT);

      return outcome;
    } finally {
      this.#choices -= 1;
    }
  }

  /** Whether an outcome applied while started in the given generation. */
  #isLive(outcome: CommandOutcome, generation: number): boolean {
    return generation === this.#generation && this.#started && isApplied(outcome);
  }

  /** Posts a command and resolves its outcome without waiting; an applied command asks the store for a poll. */
  async #runOnly(command: Command, idempotencyKey: string): Promise<CommandOutcome> {
    const generation = this.#generation;
    const outcome = await this.#api.runCommand(command, idempotencyKey);

    if (this.#isLive(outcome, generation)) {
      this.#dataStore.refresh();
    }

    return outcome;
  }

  /** Records or reports the device time zone when it differs from the account's; reports nothing while the person chooses one. */
  #check(): void {
    const state = this.#dataStore.state();

    if (state === null) {
      return;
    }

    const { report, record } = zoneToReport(
      this.#deviceZone.current(),
      state.settings.timeZone,
      this.#reportedZone.get(),
    );

    if (record !== null) {
      this.#reportedZone.set(record);
    }

    if (report === null || this.#report !== null || this.#choices > 0) {
      return;
    }

    const generation = this.#generation;

    this.#report = this.#runOnly(
      { _tag: CommandTag.SetTimeZone, timeZone: report },
      this.#ids.next(),
    ).then((outcome) => {
      if (generation !== this.#generation) {
        return;
      }

      this.#report = null;

      if (
        outcome._tag === CommandOutcomeTag.Applied ||
        outcome._tag === CommandOutcomeTag.NotApplicable ||
        outcome._tag === CommandOutcomeTag.Rejected
      ) {
        this.#reportedZone.set(report);
      }
    });
  }
}
