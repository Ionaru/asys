// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CeremonyResultTag, PasskeyFailure } from '@ionaru/effect-passkeys/client';

import { AuthApi, AuthError, AuthResultTag } from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { safeReturnUrl } from '../../core/auth/safe-return-url';
import { Session } from '../../core/auth/session';
import { Button, ButtonVariant } from '../../ui/button/button';
import { ceremonyOptions } from '../auth/ceremony-options';

const GENERIC_MESSAGE = 'Something went wrong. Try again.';

const messageForFailure = (failure: PasskeyFailure): string => {
  switch (failure) {
    case PasskeyFailure.Unsupported:
      return 'This browser or device cannot use passkeys. Use a recovery code instead.';
    case PasskeyFailure.Misconfigured:
      return 'ASYS cannot use passkeys at this address. Open ASYS at its usual address.';
    default:
      return GENERIC_MESSAGE;
  }
};

const messageForError = (error: AuthError): string => {
  switch (error) {
    case AuthError.ChallengeInvalid:
    case AuthError.VerificationFailed:
      return 'Try again.';
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
  template: `
    <main class="asys-page sign-in">
      <h1 class="sign-in__title">Sign in</h1>
      <p class="sign-in__body">Use the passkey you made for ASYS.</p>
      <button
        asys-button
        type="button"
        [block]="true"
        [variant]="Variant.Primary"
        [disabled]="options() === null || busy()"
        (click)="signIn()"
      >
        Sign in with passkey
      </button>
      @if (shownMessage(); as text) {
        <p class="sign-in__message" role="alert">{{ text }}</p>
      }
      @if (loadError() !== null) {
        <button asys-button type="button" [variant]="Variant.Quiet" (click)="discard()">
          Try again
        </button>
      }
      <a asys-button routerLink="/recover" [variant]="Variant.Quiet">Use a recovery code</a>
    </main>
  `,
  styles: `
    .sign-in {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding-block-end: var(--space-5);
    }

    .sign-in__title {
      margin: 0;
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
    }

    .sign-in__body,
    .sign-in__message {
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .sign-in__message {
      color: var(--danger);
    }
  `,
})
export class SignIn {
  private readonly authApi = inject(AuthApi);

  private readonly ceremony = inject(PasskeyCeremony);

  private readonly session = inject(Session);

  private readonly router = inject(Router);

  protected readonly Variant = ButtonVariant;

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
