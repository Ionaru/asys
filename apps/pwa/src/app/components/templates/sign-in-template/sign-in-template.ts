// SPDX-License-Identifier: EUPL-1.2
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { IconName } from '../../atoms/icon/icon';

/** Lays out signing in with a passkey, with a way to use a recovery code instead. */
@Component({
  selector: 'asys-sign-in-template',
  imports: [Button, RouterLink],
  templateUrl: './sign-in-template.component.html',
  styleUrl: './sign-in-template.css',
})
export class SignInTemplate {
  /** Whether the passkey options have loaded, so a sign-in can start. */
  readonly ready = input.required<boolean>();

  /** Whether a sign-in is running. */
  readonly busy = input.required<boolean>();

  /** The message to show under the button, if any. */
  readonly message = input.required<string | null>();

  /** Whether loading the passkey options failed, which offers Try again. */
  readonly loadFailed = input.required<boolean>();

  /** Asks to sign in with a passkey. */
  readonly signIn = output();

  /** Asks to load the passkey options again. */
  readonly retry = output();

  protected readonly Variant = ButtonVariant;

  protected readonly Icons = IconName;
}
