// SPDX-License-Identifier: EUPL-1.2
import { Location } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField, FormRoot, validate } from '@angular/forms/signals';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, take } from 'rxjs';
import { CeremonyResultTag, PasskeyFailure } from '@ionaru/effect-passkeys/client';

import { AuthApi, AuthError, AuthResultTag } from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { Session, SessionState } from '../../core/auth/session';
import { GENERIC_MESSAGE } from '../../core/data/outcome-message';
import { AppUpdate } from '../../core/platform/app-update';
import { DeviceZone } from '../../core/platform/device-zone';
import { Button, ButtonVariant } from '../../ui/button/button';
import { IconName } from '../../ui/icon/icon';
import { TextField } from '../../ui/text-field/text-field';
import { ceremonyOptions } from '../auth/ceremony-options';
import { nameError } from '../auth/name-rule';
import { MISCONFIGURED_MESSAGE, TRY_AGAIN_MESSAGE } from '../auth/passkey-messages';

/** The screens of the sign-up flow. */
export enum SignUpStep {
  Name = 'name',
  Passkey = 'passkey',
  Codes = 'codes',
  LinkInvalid = 'link_invalid',
  AlreadySignedIn = 'already_signed_in',
}

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
  imports: [Button, FormField, FormRoot, RouterLink, TextField],
  templateUrl: './sign-up.component.html',
  styleUrl: './sign-up.css',
})
export class SignUp {
  private readonly authApi = inject(AuthApi);

  private readonly ceremony = inject(PasskeyCeremony);

  private readonly session = inject(Session);

  private readonly appUpdate = inject(AppUpdate);

  private readonly deviceZone = inject(DeviceZone);

  private readonly router = inject(Router);

  private readonly destroyRef = inject(DestroyRef);

  protected readonly Variant = ButtonVariant;

  protected readonly Icons = IconName;

  protected readonly Step = SignUpStep;

  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  /** The Sign-up token: a credential, kept in memory only. */
  private token = '';

  private held = false;

  private signedInPromise: Promise<void> | null = null;

  protected readonly step = signal(SignUpStep.LinkInvalid);

  protected readonly submittedName = signal('');

  protected readonly codes = signal<readonly string[]>([]);

  protected readonly busy = signal(false);

  private readonly message = signal<string | null>(null);

  protected readonly copyStatus = signal<string | null>(null);

  protected readonly heading = computed(() => {
    switch (this.step()) {
      case SignUpStep.Codes:
        return 'Your recovery codes';
      case SignUpStep.LinkInvalid:
        return 'This Sign-up link does not work';
      default:
        return 'Sign up';
    }
  });

  private readonly model = signal({ name: '' });

  protected readonly nameForm = form(
    this.model,
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

  private readonly ref = ceremonyOptions(
    () => this.authApi.registerOptions(this.token, this.submittedName()),
    () => this.step() === SignUpStep.Passkey,
  );

  protected readonly options = this.ref.options;

  protected readonly loadError = this.ref.error;

  protected readonly shownMessage = computed(
    () => this.message() ?? (this.loadError() === null ? null : GENERIC_MESSAGE),
  );

  constructor() {
    const hash = inject(DOCUMENT).location.hash;

    if (hash !== '') {
      inject(Location).replaceState('/signup');

      this.router.events
        .pipe(
          filter((event) => event instanceof NavigationEnd),
          take(1),
          takeUntilDestroyed(),
        )
        .subscribe(() => {
          if (this.router.url.includes('#')) {
            void this.router.navigateByUrl('/signup', { replaceUrl: true });
          }
        });
    }

    if (this.session.state() === SessionState.SignedIn) {
      this.step.set(SignUpStep.AlreadySignedIn);
    } else {
      const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');

      if (token !== null && TOKEN_PATTERN.test(token)) {
        this.token = token;
        this.step.set(SignUpStep.Name);
      }
    }

    effect(() => {
      if (this.loadError() === AuthError.SignUpLinkInvalid) {
        this.step.set(SignUpStep.LinkInvalid);
      }
    });

    let first = true;

    afterRenderEffect(() => {
      this.step();

      if (first) {
        first = false;

        return;
      }

      this.title()?.nativeElement.focus();
    });

    this.destroyRef.onDestroy(() => {
      this.codes.set([]);

      if (this.held) {
        this.held = false;
        this.appUpdate.release();
      }
    });
  }

  protected discard(): void {
    this.ref.discard();
  }

  protected changeName(): void {
    if (this.busy()) {
      return;
    }

    this.message.set(null);
    this.step.set(SignUpStep.Name);
  }

  protected async createPasskey(): Promise<void> {
    const current = this.options();

    if (current === null || this.busy()) {
      return;
    }

    this.message.set(null);
    this.busy.set(true);

    try {
      const created = await this.ceremony.create(current.options);

      if (this.destroyRef.destroyed) {
        return;
      }

      if (created._tag === CeremonyResultTag.Failed) {
        this.message.set(messageForFailure(created.failure));

        return;
      }

      const result = await this.authApi.register(
        this.token,
        this.deviceZone.current() ?? 'UTC',
        current.challengeId,
        created.response,
      );

      if (this.destroyRef.destroyed) {
        if (result._tag === AuthResultTag.Ok) {
          void this.session.signedIn();
        }

        return;
      }

      if (result._tag === AuthResultTag.Ok) {
        this.codes.set(result.value.recoveryCodes);
        this.step.set(SignUpStep.Codes);
        this.appUpdate.hold();
        this.held = true;
        this.signedInPromise = this.session.signedIn();

        return;
      }

      this.ref.discard();

      switch (result.error) {
        case AuthError.SignUpLinkInvalid:
          this.step.set(SignUpStep.LinkInvalid);
          break;
        case AuthError.ChallengeInvalid:
        case AuthError.VerificationFailed:
          this.message.set(TRY_AGAIN_MESSAGE);
          break;
        case AuthError.AlreadyRegistered:
          this.message.set(ALREADY_REGISTERED_MESSAGE);
          break;
        default:
          this.message.set(GENERIC_MESSAGE);
      }
    } finally {
      if (!this.destroyRef.destroyed) {
        this.busy.set(false);
      }
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.codes().join('\n'));
      this.copyStatus.set('Copied.');
    } catch {
      this.copyStatus.set('Could not copy. Select the codes instead.');
    }
  }

  protected async finish(): Promise<void> {
    await this.signedInPromise;
    await this.router.navigateByUrl('/now');
  }
}
