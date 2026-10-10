// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommandTag } from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { SETTINGS_SUBJECT } from '../../core/data/command-subject';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { DeviceZone } from '../../core/platform/device-zone';
import { Button, ButtonVariant } from '../../ui/button/button';
import { LoadState } from '../../ui/load-state/load-state';
import { type SelectOption, SelectField } from '../../ui/select-field/select-field';
import { SyncNote } from '../../ui/sync-note/sync-note';

const MAX_URGENCY_DAYS = 14;

const URGENCY_OPTIONS: readonly SelectOption[] = Array.from(
  { length: MAX_URGENCY_DAYS },
  (_, index) => {
    const days = index + 1;

    return { value: String(days), label: days === 1 ? '1 day' : `${days} days` };
  },
);

/** The time zone choices: UTC, the supported zones, then the stored zone when none of them is it. */
const zoneOptions = (stored: string | undefined): readonly SelectOption[] => {
  const values = ['UTC', ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')];

  if (stored !== undefined && !values.includes(stored)) {
    values.push(stored);
  }

  return values.map((value) => ({ value, label: value }));
};

/** Sets the Urgency window and the time zone, and links to Areas and Account. */
@Component({
  selector: 'app-settings',
  imports: [Button, LoadState, RouterLink, SelectField, SyncNote],
  providers: [CommandAttempts],
  templateUrl: './settings.component.html',
  styleUrl: './settings.css',
})
export class Settings {
  protected readonly dataStore = inject(DataStore);

  readonly #deviceZoneService = inject(DeviceZone);

  readonly #attempts = inject(CommandAttempts);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly settingsSubject = SETTINGS_SUBJECT;

  protected readonly urgencyOptions = URGENCY_OPTIONS;

  protected readonly statusLine = signal('');

  readonly #storedUrgency = computed(() =>
    String(this.dataStore.state()?.settings.urgencyWindowDays ?? ''),
  );

  readonly #storedZone = computed(() => this.dataStore.state()?.settings.timeZone ?? '');

  /** The Urgency window the select shows; follows the store. */
  protected readonly urgencyValue = linkedSignal(() => this.#storedUrgency());

  /** The time zone the select shows; follows the store. */
  protected readonly zoneValue = linkedSignal(() => this.#storedZone());

  protected readonly timeZoneOptions = computed(() =>
    zoneOptions(this.dataStore.state()?.settings.timeZone),
  );

  /** The device time zone when it differs from the stored one, else null. */
  protected readonly deviceZone = computed(() => {
    const stored = this.dataStore.state()?.settings.timeZone;
    const device = this.#deviceZoneService.current();

    return stored !== undefined && device !== undefined && device !== stored ? device : null;
  });

  protected readonly busy = computed(() => this.#attempts.busy(SETTINGS_SUBJECT));

  /** Sends the chosen Urgency window. */
  protected async chooseUrgency(value: string): Promise<void> {
    const days = Number(value);

    if (this.busy() || !Number.isInteger(days)) {
      this.urgencyValue.set(this.#storedUrgency());
      return;
    }

    this.statusLine.set('');

    const outcome = await this.#attempts.send({ _tag: CommandTag.SetUrgencyWindow, days });

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.statusLine.set('Urgency window saved.');
      return;
    }

    this.urgencyValue.set(this.#storedUrgency());
    this.statusLine.set(outcomeMessage(outcome) ?? '');
  }

  /** Sets the chosen time zone as the person's explicit choice. */
  protected async chooseZone(zone: string): Promise<void> {
    if (this.busy()) {
      this.zoneValue.set(this.#storedZone());
      return;
    }

    this.statusLine.set('');

    const outcome = await this.#attempts.track(SETTINGS_SUBJECT, () =>
      this.dataStore.chooseTimeZone(zone),
    );

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.statusLine.set('Time zone saved.');
      return;
    }

    this.zoneValue.set(this.#storedZone());
    this.statusLine.set(outcomeMessage(outcome) ?? '');
  }
}
