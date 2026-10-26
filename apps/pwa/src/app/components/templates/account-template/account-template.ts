// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, model, output, viewChild } from '@angular/core';
import { type FieldTree, FormField, FormRoot } from '@angular/forms/signals';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { IconName } from '../../atoms/icon/icon';
import { Text, TextStyle } from '../../atoms/text/text';
import { TextField } from '../../molecules/text-field/text-field';

/** One passkey as the Account screen lists it, with its dates already formatted. */
export interface PasskeyRow {
  readonly credentialId: string;
  readonly name: string;
  readonly created: string;
  /** When it was last used, formatted, or null when it never was. */
  readonly lastUsed: string | null;
}

/** Lays out the passkeys, recovery codes and sign out. */
@Component({
  selector: 'asys-account-template',
  imports: [Text, Button, FormField, FormRoot, TextField],
  templateUrl: './account-template.component.html',
  styleUrl: './account-template.css',
})
export class AccountTemplate {
  /** The signed-in person's name. */
  readonly name = input.required<string | undefined>();

  /** Whether the passkeys have loaded. */
  readonly passkeysLoaded = input.required<boolean>();

  /** Whether the passkeys are loading. */
  readonly passkeysLoading = input.required<boolean>();

  /** The passkeys to list, with their dates formatted. */
  readonly rows = input.required<readonly PasskeyRow[]>();

  /** Whether a passkey is being removed. */
  readonly removing = input.required<boolean>();

  /** Why removing a passkey failed, or null. */
  readonly removeMessage = input.required<string | null>();

  /** The form for naming a new passkey. */
  readonly addForm = input.required<FieldTree<{ name: string }>>();

  /** Whether a passkey can be added now. */
  readonly canAdd = input.required<boolean>();

  /** Why adding a passkey failed, or null. */
  readonly addMessage = input.required<string | null>();

  /** Whether preparing to add a passkey failed. */
  readonly addLoadFailed = input.required<boolean>();

  /** Whether a passkey was just added. */
  readonly added = input.required<boolean>();

  /** How many recovery codes are left, once known. */
  readonly recoveryCodesLeft = input.required<number | undefined>();

  /** The new recovery codes, shown once; empty when none are shown. */
  readonly codes = input.required<readonly string[]>();

  /** Whether new recovery codes are being made. */
  readonly regenerating = input.required<boolean>();

  /** The status after copying the codes, or null. */
  readonly copyStatus = input.required<string | null>();

  /** Why making recovery codes failed, or null. */
  readonly codesMessage = input.required<string | null>();

  /** Whether sign out is under way. */
  readonly signingOut = input.required<boolean>();

  /** Why signing out failed, or null. */
  readonly signOutMessage = input.required<string | null>();

  /** The credential id of the passkey whose removal waits for confirmation. */
  readonly confirmingRemoval = model.required<string | null>();

  /** Whether making new recovery codes waits for confirmation. */
  readonly confirmingCodes = model.required<boolean>();

  /** Asks to load the passkeys again. */
  readonly retryPasskeys = output();

  /** Asks to remove the passkey with this credential id. */
  readonly removePasskey = output<string>();

  /** Asks to prepare adding a passkey again. */
  readonly retryAddOptions = output();

  /** Asks to make new recovery codes. */
  readonly makeCodes = output();

  /** Asks to copy the shown codes. */
  readonly copyCodes = output();

  /** Asks to hide the shown codes. */
  readonly hideCodes = output();

  /** Asks to sign out. */
  readonly signOut = output();

  private readonly passkeysHeading = viewChild('passkeysHeading', {
    read: ElementRef<HTMLElement>,
  });

  protected readonly TextStyle = TextStyle;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly Icons = IconName;

  /** Moves focus to the Passkeys heading. */
  focusPasskeys(): void {
    this.passkeysHeading()?.nativeElement.focus();
  }
}
