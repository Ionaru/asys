// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CeremonyResultTag, PasskeyFailure } from '@ionaru/effect-passkeys/client';

import { AuthApi, AuthError, AuthResultTag } from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { safeReturnUrl } from '../../core/auth/safe-return-url';
import { Session } from '../../core/auth/session';
import { GENERIC_MESSAGE } from '../../core/data/outcome-message';
import { Button, ButtonVariant } from '../../ui/button/button';
import { IconName } from '../../ui/icon/icon';
import { ceremonyOptions } from '../auth/ceremony-options';
import { MISCONFIGURED_MESSAGE, TRY_AGAIN_MESSAGE } from '../auth/passkey-messages';

const messageForFailure = (failure: PasskeyFailure): string => {
  switch (failure) {
    case PasskeyFailure.Unsupported:
      return 'This browser or device cannot use passkeys. Use a recovery code instead.';
    case PasskeyFailure.Misconfigured:
      return MISCONFIGURED_MESSAGE;
    default:
      return GENERIC_MESSAGE;
  }
};

const messageForError = (error: AuthError): string => {
  switch (error) {
    case AuthError.ChallengeInvalid:
    case AuthError.VerificationFailed:
      return TRY_AGAIN_MESSAGE;
    case AuthError.UnknownCredential:
      return 'This passkey is not known to ASYS.';
    default:
      return GENERIC_MESSAGE;
  }
};

/** Signs in with a passkey. */
@Component({
  selector: 'asys-sign-in',
  imports: [Button, RouterLink],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.css',
})
export class SignIn {
  private readonly authApi = inject(AuthApi);

  private readonly ceremony = inject(PasskeyCeremony);

  private readonly session = inject(Session);

  private readonly router = inject(Router);

  protected readonly Variant = ButtonVariant;

  protected readonly Icons = IconName;

  readonly returnUrl = input<string | undefined>();

  private readonly ref = ceremonyOptions(() => this.authApi.authenticateOptions());

  protected readonly options = this.ref.options;

  protected readonly loadError = this.ref.error;

  protected readonly busy = signal(false);

  private readonly message = signal<string | null>(null);

  protected readonly shownMessage = computed(
    () => this.message() ?? (this.loadError() === null ? null : GENERIC_MESSAGE),
  );

  protected discard(): void {
    this.ref.discard();
  }

  protected async signIn(): Promise<void> {
    const current = this.options();

    if (current === null || this.busy()) {
      return;
    }

    this.message.set(null);
    this.busy.set(true);

    try {
      const ceremony = await this.ceremony.use(current.options);

      if (ceremony._tag === CeremonyResultTag.Failed) {
        this.message.set(
          ceremony.failure === PasskeyFailure.Cancelled
            ? null
            : messageForFailure(ceremony.failure),
        );

        return;
      }

      const result = await this.authApi.authenticate(current.challengeId, ceremony.response);

      if (result._tag === AuthResultTag.Failed) {
        this.message.set(messageForError(result.error));
        this.ref.discard();

        return;
      }

      await this.session.signedIn(result.value);
      await this.router.navigateByUrl(safeReturnUrl(this.returnUrl()));
    } finally {
      this.busy.set(false);
    }
  }
}
