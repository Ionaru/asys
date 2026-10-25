// SPDX-License-Identifier: EUPL-1.2
import { Location } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, validate } from '@angular/forms/signals';
import { NavigationEnd, Router } from '@angular/router';
import { filter, take } from 'rxjs';
import { CeremonyResultTag, PasskeyFailure } from '@ionaru/effect-passkeys/client';

import { AuthApi, AuthError, AuthResultTag } from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { ceremonyOptions } from '../../core/auth/ceremony-options';
import { nameError } from '../../core/auth/name-rule';
import { MISCONFIGURED_MESSAGE, TRY_AGAIN_MESSAGE } from '../../core/auth/passkey-messages';
import { recoveryCodes } from '../../core/auth/recovery-codes';
import { Session, SessionState } from '../../core/auth/session';
import { GENERIC_MESSAGE } from '../../core/data/outcome-message';
import { DeviceZone } from '../../core/platform/device-zone';
import {
  SignUpStep,
  SignUpTemplate,
} from '../../components/templates/sign-up-template/sign-up-template';

const ALREADY_REGISTERED_MESSAGE = 'This device already has a passkey for ASYS. Sign in instead.';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const messageForFailure = (failure: PasskeyFailure): string => {
  switch (failure) {
    case PasskeyFailure.Cancelled:
      return 'Passkey creation was cancelled.';
    case PasskeyFailure.Unsupported:
      return 'This browser or device cannot create a passkey. Try another browser or device.';
    case PasskeyFailure.Misconfigured:
      return MISCONFIGURED_MESSAGE;
    case PasskeyFailure.AlreadyRegistered:
      return ALREADY_REGISTERED_MESSAGE;
    default:
      return GENERIC_MESSAGE;
  }
};

/** Signs up a new User from a Sign-up link: name, passkey, recovery codes. */
@Component({
  selector: 'asys-sign-up',
  imports: [SignUpTemplate],
  template: `
    <asys-sign-up-template
      [step]="step()"
      [nameForm]="nameForm"
      [name]="submittedName()"
      [ready]="options() !== null"
      [busy]="busy()"
      [message]="shownMessage()"
      [loadFailed]="loadError() !== null"
      [codes]="codes()"
      [copyStatus]="copyStatus()"
      (createPasskey)="createPasskey()"
      (changeName)="changeName()"
      (retry)="discard()"
      (copyCodes)="copy()"
      (finish)="finish()"
    />
  `,
})
export class SignUp {
  readonly #authApi = inject(AuthApi);

  readonly #ceremony = inject(PasskeyCeremony);

  readonly #session = inject(Session);

  readonly #deviceZone = inject(DeviceZone);

  readonly #router = inject(Router);

  readonly #destroyRef = inject(DestroyRef);

  /** The Sign-up token: a credential, kept in memory only. */
  #token = '';

  #signedInPromise: Promise<void> | null = null;

  protected readonly step = signal(SignUpStep.LinkInvalid);

  protected readonly submittedName = signal('');

  readonly #recovery = recoveryCodes();

  protected readonly codes = this.#recovery.codes;

  protected readonly busy = signal(false);

  readonly #message = signal<string | null>(null);

  protected readonly copyStatus = this.#recovery.copyStatus;

  readonly #model = signal({ name: '' });

  protected readonly nameForm = form(
    this.#model,
    (path) => {
      validate(path.name, ({ value }) => {
        const name = value();

        return name.trim().length === 0
          ? { kind: 'required', message: 'Enter your name' }
          : nameError(name);
      });
    },
    {
      submission: {
        action: (field) => {
          this.submittedName.set(field().value().name);
          this.step.set(SignUpStep.Passkey);

          return Promise.resolve(undefined);
        },
        onInvalid: (field) => {
          field.name().focusBoundControl();
        },
      },
    },
  );

  readonly #ref = ceremonyOptions(
    () => this.#authApi.registerOptions(this.#token, this.submittedName()),
    () => this.step() === SignUpStep.Passkey,
  );

  protected readonly options = this.#ref.options;

  protected readonly loadError = this.#ref.error;

  protected readonly shownMessage = computed(
    () => this.#message() ?? (this.loadError() === null ? null : GENERIC_MESSAGE),
  );

  constructor() {
    const hash = inject(DOCUMENT).location.hash;

    if (hash !== '') {
      inject(Location).replaceState('/signup');

      this.#router.events
        .pipe(
          filter((event) => event instanceof NavigationEnd),
          take(1),
          takeUntilDestroyed(),
        )
        .subscribe(() => {
          if (this.#router.url.includes('#')) {
            void this.#router.navigateByUrl('/signup', { replaceUrl: true });
          }
        });
    }

    if (this.#session.state() === SessionState.SignedIn) {
      this.step.set(SignUpStep.AlreadySignedIn);
    } else {
      const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');

      if (token !== null && TOKEN_PATTERN.test(token)) {
        this.#token = token;
        this.step.set(SignUpStep.Name);
      }
    }

    effect(() => {
      if (this.loadError() === AuthError.SignUpLinkInvalid) {
        this.step.set(SignUpStep.LinkInvalid);
      }
    });
  }

  protected discard(): void {
    this.#ref.discard();
  }

  protected changeName(): void {
    if (this.busy()) {
      return;
    }

    this.#message.set(null);
    this.step.set(SignUpStep.Name);
  }

  protected async createPasskey(): Promise<void> {
    const current = this.options();

    if (current === null || this.busy()) {
      return;
    }

    this.#message.set(null);
    this.busy.set(true);

    try {
      const created = await this.#ceremony.create(current.options);

      if (this.#destroyRef.destroyed) {
        return;
      }

      if (created._tag === CeremonyResultTag.Failed) {
        this.#message.set(messageForFailure(created.failure));

        return;
      }

      const result = await this.#authApi.register(
        this.#token,
        this.#deviceZone.current() ?? 'UTC',
        current.challengeId,
        created.response,
      );

      if (this.#destroyRef.destroyed) {
        if (result._tag === AuthResultTag.Ok) {
          void this.#session.signedIn();
        }

        return;
      }

      if (result._tag === AuthResultTag.Ok) {
        this.#recovery.show(result.value.recoveryCodes);
        this.step.set(SignUpStep.Codes);
        this.#signedInPromise = this.#session.signedIn();

        return;
      }

      this.#ref.discard();

      switch (result.error) {
        case AuthError.SignUpLinkInvalid:
          this.step.set(SignUpStep.LinkInvalid);
          break;
        case AuthError.ChallengeInvalid:
        case AuthError.VerificationFailed:
          this.#message.set(TRY_AGAIN_MESSAGE);
          break;
        case AuthError.AlreadyRegistered:
          this.#message.set(ALREADY_REGISTERED_MESSAGE);
          break;
        default:
          this.#message.set(GENERIC_MESSAGE);
      }
    } finally {
      if (!this.#destroyRef.destroyed) {
        this.busy.set(false);
      }
    }
  }

  protected copy(): Promise<void> {
    return this.#recovery.copy();
  }

  protected async finish(): Promise<void> {
    await this.#signedInPromise;
    await this.#router.navigateByUrl('/now');
  }
}
