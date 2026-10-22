// SPDX-License-Identifier: EUPL-1.2
import { Component, input, model, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { SyncNote } from '../../atoms/sync-note/sync-note';
import { LoadState } from '../../molecules/load-state/load-state';
import { type SelectOption, SelectField } from '../../molecules/select-field/select-field';

/** Lays out the Urgency window and time zone choices, and the links to Areas and Account. */
@Component({
  selector: 'asys-settings-template',
  imports: [Button, LoadState, RouterLink, SelectField, SyncNote],
  templateUrl: './settings-template.component.html',
  styleUrl: './settings-template.css',
})
export class SettingsTemplate {
  /** The status line under the heading; empty when there is nothing to say. */
  readonly statusLine = input.required<string>();

  /** Whether the Settings have loaded; until then the load state shows. */
  readonly loaded = input.required<boolean>();

  /** Whether loading the Settings failed. */
  readonly failed = input.required<boolean>();

  /** Whether a Settings change is being sent, which disables the choices. */
  readonly busy = input.required<boolean>();

  /** Whether a saved Settings change still waits for the server. */
  readonly awaitingSync = input.required<boolean>();

  /** The Urgency window choices. */
  readonly urgencyOptions = input.required<readonly SelectOption[]>();

  /** The Urgency window the select shows, in days. */
  readonly urgency = model.required<string>();

  /** The time zone choices. */
  readonly zoneOptions = input.required<readonly SelectOption[]>();

  /** The time zone the select shows. */
  readonly zone = model.required<string>();

  /** The stored time zone. */
  readonly currentZone = input.required<string>();

  /** The device time zone when it differs from the stored one, else null. */
  readonly deviceZone = input.required<string | null>();

  /** Asks to use the device time zone. */
  readonly useDeviceZone = output<string>();

  /** Asks to load the Settings again after a failure. */
  readonly retry = output();

  protected readonly Variant = ButtonVariant;
}
