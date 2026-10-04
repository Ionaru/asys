// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommandTag } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { SETTINGS_SUBJECT } from '../../core/data/command-subject';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { DeviceZone } from '../../core/platform/device-zone';
import { Button, ButtonVariant } from '../../ui/button/button';
import { type SelectOption, SelectField } from '../../ui/select-field/select-field';

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
  imports: [Button, RouterLink, SelectField],
  providers: [CommandAttempts],
  template: `
    <h1 class="settings__title">Settings</h1>
    <p class="settings__status" role="status">{{ statusLine() }}</p>
    @if (dataStore.state(); as state) {
      <section class="settings__section">
        <asys-select-field
          label="Urgency window"
          [options]="urgencyOptions"
          [(value)]="urgencyValue"
          (valueChange)="chooseUrgency($event)"
          [disabled]="busy()"
          hint="A Task counts as urgent this many days before its Latest start."
        />
      </section>
      <section class="settings__section">
        <p class="settings__text">Current time zone: {{ state.settings.timeZone }}</p>
        <asys-select-field
          label="Time zone"
          [options]="timeZoneOptions()"
          [(value)]="zoneValue"
          (valueChange)="chooseZone($event)"
          [disabled]="busy()"
          hint="Dates without a time follow this time zone. Your phone keeps it up to date."
        />
        @if (deviceZone(); as zone) {
          <div class="asys-button-group">
            <button
              asys-button
              type="button"
              [variant]="Variant.Secondary"
              [disabled]="busy()"
              (click)="chooseZone(zone)"
            >
              Use this device's time zone ({{ zone }})
            </button>
          </div>
        }
      </section>
      @if (dataStore.awaitingSync().has(settingsSubject)) {
        <p class="settings__sync">Saved. Waiting for the server.</p>
      }
    } @else if (dataStore.status() === Status.Failed) {
      <p role="alert">ASYS could not load your Tasks.</p>
      <button asys-button type="button" [variant]="Variant.Quiet" (click)="dataStore.refresh()">
        Try again
      </button>
    } @else {
      <p>Loading…</p>
    }
    <nav class="settings__links" aria-label="More settings">
      <a class="settings__link" routerLink="/settings/areas">Areas</a>
      <a class="settings__link" routerLink="/account">Account</a>
    </nav>
  `,
  styles: `
    .settings__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .settings__status {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .settings__status:empty {
      margin: 0;
    }

    .settings__section {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin: 0 0 var(--space-5);
    }

    .settings__text {
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .settings__sync {
      margin: 0 0 var(--space-4);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      color: var(--ink-muted);
    }

    .settings__links {
      display: flex;
      flex-direction: column;
      border-top: 1px solid var(--line);
    }

    .settings__link {
      display: flex;
      align-items: center;
      min-height: var(--row-min);
      border-bottom: 1px solid var(--line);
      color: var(--ink);
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
      text-decoration: none;
    }
  `,
})
export class Settings {
  protected readonly dataStore = inject(DataStore);

  private readonly deviceZoneService = inject(DeviceZone);

  private readonly attempts = inject(CommandAttempts);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly settingsSubject = SETTINGS_SUBJECT;

  protected readonly urgencyOptions = URGENCY_OPTIONS;

  protected readonly statusLine = signal('');

  /** Whether an Urgency window or time zone send is in flight. */
  private readonly pending = signal(false);

  private readonly storedUrgency = computed(() =>
    String(this.dataStore.state()?.settings.urgencyWindowDays ?? ''),
  );

  private readonly storedZone = computed(() => this.dataStore.state()?.settings.timeZone ?? '');

  /** The Urgency window the select shows; follows the store. */
  protected readonly urgencyValue = linkedSignal(() => this.storedUrgency());

  /** The time zone the select shows; follows the store. */
  protected readonly zoneValue = linkedSignal(() => this.storedZone());

  protected readonly timeZoneOptions = computed(() =>
    zoneOptions(this.dataStore.state()?.settings.timeZone),
  );

  /** The device time zone when it differs from the stored one, else null. */
  protected readonly deviceZone = computed(() => {
    const stored = this.dataStore.state()?.settings.timeZone;
    const device = this.deviceZoneService.current();

    return stored !== undefined && device !== undefined && device !== stored ? device : null;
  });

  protected readonly busy = computed(
    () => this.pending() || this.dataStore.awaitingSync().has(SETTINGS_SUBJECT),
  );

  /** Sends the chosen Urgency window. */
  protected async chooseUrgency(value: string): Promise<void> {
    const days = Number(value);

    if (this.busy() || !Number.isInteger(days)) {
      this.urgencyValue.set(this.storedUrgency());
      return;
    }

    const command = { _tag: CommandTag.SetUrgencyWindow, days } as const;
    const outcome = await this.run(async () => {
      const key = this.attempts.keyFor(command);
      const result = await this.dataStore.send(command, key);

      this.attempts.settle(command, result);

      return result;
    });

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.statusLine.set('Urgency window saved.');
      return;
    }

    this.urgencyValue.set(this.storedUrgency());
    this.statusLine.set(outcomeMessage(outcome) ?? '');
  }

  /** Sets the chosen time zone as the person's explicit choice. */
  protected async chooseZone(zone: string): Promise<void> {
    if (this.busy()) {
      this.zoneValue.set(this.storedZone());
      return;
    }

    const outcome = await this.run(() => this.dataStore.chooseTimeZone(zone));

    if (outcome._tag === CommandOutcomeTag.Applied) {
      this.statusLine.set('Time zone saved.');
      return;
    }

    this.zoneValue.set(this.storedZone());
    this.statusLine.set(outcomeMessage(outcome) ?? '');
  }

  /** Runs a send, marking it pending meanwhile. */
  private async run(send: () => Promise<CommandOutcome>): Promise<CommandOutcome> {
    this.statusLine.set('');
    this.pending.set(true);

    try {
      return await send();
    } finally {
      this.pending.set(false);
    }
  }
}
