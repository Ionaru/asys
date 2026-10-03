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
import { AppUpdate } from '../../core/platform/app-update';
import { DeviceZone } from '../../core/platform/device-zone';
import { Button, ButtonVariant } from '../../ui/button/button';
import { TextField } from '../../ui/text-field/text-field';
import { ceremonyOptions } from '../auth/ceremony-options';

/** The screens of the sign-up flow. */
export enum SignUpStep {
  Name = 'name',
  Passkey = 'passkey',
  Codes = 'codes',
  LinkInvalid = 'link_invalid',
  AlreadySignedIn = 'already_signed_in',
}

const GENERIC_MESSAGE = 'Something went wrong. Try again.';

const ALREADY_REGISTERED_MESSAGE = 'This device already has a passkey for ASYS. Sign in instead.';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const MAX_NAME_LENGTH = 100;

const messageForFailure = (failure: PasskeyFailure): string => {
  switch (failure) {
    case PasskeyFailure.Cancelled:
      return 'Passkey creation was cancelled.';
    case PasskeyFailure.Unsupported:
      return 'This browser or device cannot create a passkey. Try another browser or device.';
    case PasskeyFailure.Misconfigured:
      return 'ASYS cannot use passkeys at this address. Open ASYS at its usual address.';
    case PasskeyFailure.AlreadyRegistered:
      return ALREADY_REGISTERED_MESSAGE;
    default:
      return GENERIC_MESSAGE;
  }
};

const hasUnusualCharacters = (value: string): boolean => {
  if (value.includes('\u0000')) {
    return true;
  }

  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);

      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
      } else {
        return true;
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }

  return false;
};

/** Signs up a new User from a Sign-up link: name, passkey, recovery codes. */
@Component({
  selector: 'asys-sign-up',
  imports: [Button, FormField, FormRoot, RouterLink, TextField],
  template: `
    <main class="asys-page sign-up">
      <h1 #title class="sign-up__title" tabindex="-1">{{ heading() }}</h1>
      @switch (step()) {
        @case (Step.Name) {
          <form class="sign-up__block" animate.enter="asys-enter" [formRoot]="nameForm">
            <asys-text-field
              [formField]="nameForm.name"
              label="Name"
              hint="How ASYS addresses you."
              autocomplete="name"
            />
            <button asys-button type="submit" [block]="true" [variant]="Variant.Primary">
              Continue
            </button>
          </form>
        }
        @case (Step.Passkey) {
          <div class="sign-up__block" animate.enter="asys-enter">
            <p class="sign-up__body">Next, create a passkey for {{ submittedName() }}.</p>
            <button
              asys-button
              type="button"
              [block]="true"
              [variant]="Variant.Primary"
              [disabled]="options() === null || busy()"
              (click)="createPasskey()"
            >
              Create passkey
            </button>
            <button
              asys-button
              type="button"
              [variant]="Variant.Quiet"
              [disabled]="busy()"
              (click)="changeName()"
            >
              Change name
            </button>
            @if (shownMessage(); as text) {
              <p class="sign-up__message" role="alert">{{ text }}</p>
            }
            @if (loadError() !== null) {
              <button asys-button type="button" [variant]="Variant.Quiet" (click)="discard()">
                Try again
              </button>
            }
          </div>
        }
        @case (Step.Codes) {
          <div class="sign-up__block" animate.enter="asys-enter">
            <ol class="sign-up__codes asys-num">
              @for (code of codes(); track $index) {
                <li>{{ code }}</li>
              }
            </ol>
            <p class="sign-up__body">These codes are shown only now. Keep them somewhere safe.</p>
            <button asys-button type="button" [variant]="Variant.Secondary" (click)="copy()">
              Copy
            </button>
            @if (copyStatus(); as text) {
              <p class="sign-up__body" role="status">{{ text }}</p>
            }
            <button
              asys-button
              type="button"
              [block]="true"
              [variant]="Variant.Primary"
              (click)="finish()"
            >
              Continue
            </button>
          </div>
        }
        @case (Step.LinkInvalid) {
          <div class="sign-up__block" animate.enter="asys-enter">
            <p class="sign-up__body">Open the Sign-up link again.</p>
            <a asys-button routerLink="/signin" [variant]="Variant.Quiet">Sign in instead</a>
          </div>
        }
        @case (Step.AlreadySignedIn) {
          <div class="sign-up__block" animate.enter="asys-enter">
            <p class="sign-up__body">You are already signed in.</p>
            <a asys-button routerLink="/now" [variant]="Variant.Quiet">Go to Now</a>
          </div>
        }
      }
    </main>
  `,
  styles: `
    .sign-up,
    .sign-up__block {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .sign-up {
      padding-block-end: var(--space-5);
    }

    .sign-up__title {
      margin: 0;
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
    }

    .sign-up__body,
    .sign-up__message {
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .sign-up__message {
      color: var(--danger);
    }

    .sign-up__codes {
      margin: 0;
      padding-inline-start: var(--space-6);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class SignUp {
  private readonly authApi = inject(AuthApi);

  private readonly ceremony = inject(PasskeyCeremony);

  private readonly session = inject(Session);

  private readonly appUpdate = inject(AppUpdate);

  private readonly deviceZone = inject(DeviceZone);

  private readonly router = inject(Router);

  protected readonly Variant = ButtonVariant;

  protected readonly Step = SignUpStep;

  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  /** The Sign-up token: a credential, kept in memory only. */
  private token = '';

  private held = false;

  private destroyed = false;

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

        if (name.trim().length === 0) {
          return { kind: 'required', message: 'Enter your name' };
        }

        if (name.length > MAX_NAME_LENGTH) {
          return { kind: 'max_length', message: 'Use at most 100 characters' };
        }

        return hasUnusualCharacters(name)
          ? { kind: 'unusual_characters', message: 'Remove the unusual characters' }
          : undefined;
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

    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
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

      if (this.destroyed) {
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

      if (this.destroyed) {
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
          this.message.set('Try again.');
          break;
        case AuthError.AlreadyRegistered:
          this.message.set(ALREADY_REGISTERED_MESSAGE);
          break;
        default:
          this.message.set(GENERIC_MESSAGE);
      }
    } finally {
      if (!this.destroyed) {
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
