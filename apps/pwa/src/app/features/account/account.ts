// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { form, FormField, FormRoot, validate } from '@angular/forms/signals';
import { CeremonyResultTag, PasskeyFailure } from '@ionaru/effect-passkeys/client';

import { AuthApi, AuthError, AuthResultTag, type Passkey } from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { Session } from '../../core/auth/session';
import { DataStore } from '../../core/data/data-store';
import { AppUpdate } from '../../core/platform/app-update';
import { Clock } from '../../core/platform/clock';
import { DeviceZone } from '../../core/platform/device-zone';
import { Button, ButtonSize, ButtonVariant } from '../../ui/button/button';
import { TextField } from '../../ui/text-field/text-field';
import { ceremonyOptions } from '../auth/ceremony-options';

const GENERIC_MESSAGE = 'Something went wrong. Try again.';

const MAX_NAME_LENGTH = 100;

const messageForFailure = (failure: PasskeyFailure): string | null => {
  switch (failure) {
    case PasskeyFailure.Cancelled:
      return null;
    case PasskeyFailure.AlreadyRegistered:
      return 'This device already has a passkey for ASYS.';
    case PasskeyFailure.Unsupported:
      return 'This browser or device cannot create a passkey.';
    case PasskeyFailure.Misconfigured:
      return 'ASYS cannot use passkeys at this address. Open ASYS at its usual address.';
    default:
      return GENERIC_MESSAGE;
  }
};

const messageForAddError = (error: AuthError): string | null => {
  switch (error) {
    case AuthError.ChallengeInvalid:
    case AuthError.VerificationFailed:
      return 'Try again.';
    case AuthError.AlreadyRegistered:
      return 'This device already has a passkey for ASYS.';
    case AuthError.Unauthorized:
      return null;
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

/** The account screen: passkeys, recovery codes and sign out. */
@Component({
  selector: 'asys-account',
  imports: [Button, FormField, FormRoot, TextField],
  template: `
    <div class="account">
      <header class="account__block">
        <h1 class="account__title">Account</h1>
        <p class="account__reason">{{ session.me()?.name }}</p>
      </header>

      <section class="account__block">
        <h2 #passkeysHeading class="account__heading" tabindex="-1">Passkeys</h2>
        @if (passkeys.hasValue()) {
          <ul class="account__list">
            @for (row of rows(); track row.passkey.credentialId) {
              <li class="account__row">
                <span class="account__strong">{{ row.passkey.name }}</span>
                <span class="account__reason">Created {{ row.created }}</span>
                <span class="account__reason">
                  {{ row.lastUsed === null ? 'Never used' : 'Last used ' + row.lastUsed }}
                </span>
                @if (confirmingRemoval() === row.passkey.credentialId) {
                  <div class="account__confirm" animate.enter="asys-enter">
                    <p class="account__body">
                      Remove {{ row.passkey.name }}? You cannot sign in with it afterwards.
                    </p>
                    <div class="account__actions">
                      <button
                        asys-button
                        type="button"
                        [variant]="Variant.Danger"
                        [size]="Size.Small"
                        [disabled]="removing()"
                        (click)="remove(row.passkey.credentialId)"
                      >
                        Remove passkey
                      </button>
                      <button
                        asys-button
                        type="button"
                        [variant]="Variant.Quiet"
                        [size]="Size.Small"
                        (click)="confirmingRemoval.set(null)"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                } @else {
                  <div>
                    <button
                      asys-button
                      type="button"
                      [variant]="Variant.Quiet"
                      [size]="Size.Small"
                      (click)="confirmingRemoval.set(row.passkey.credentialId)"
                    >
                      Remove<span class="asys-visually-hidden"> {{ row.passkey.name }}</span>
                    </button>
                  </div>
                }
              </li>
            }
          </ul>
        } @else if (passkeys.isLoading()) {
          <p class="account__reason">Loading your passkeys…</p>
        } @else {
          <p class="account__reason">Could not load your passkeys.</p>
          <div>
            <button
              asys-button
              type="button"
              [variant]="Variant.Quiet"
              [size]="Size.Small"
              (click)="reload()"
            >
              Try again
            </button>
          </div>
        }
        @if (removeMessage(); as text) {
          <p class="account__message" role="alert">{{ text }}</p>
        }
        <form class="account__block" [formRoot]="addForm">
          <asys-text-field
            [formField]="addForm.name"
            label="Name for the new passkey"
            hint="Optional. For example the device it is on."
          />
          <div>
            <button
              asys-button
              type="submit"
              [variant]="Variant.Secondary"
              [disabled]="addOptions() === null || adding()"
            >
              Add a passkey
            </button>
          </div>
        </form>
        @if (shownAddMessage(); as text) {
          <p class="account__message" role="alert">{{ text }}</p>
        }
        @if (addRef.error() !== null && addRef.error() !== AuthError.Unauthorized) {
          <div>
            <button
              asys-button
              type="button"
              [variant]="Variant.Quiet"
              [size]="Size.Small"
              (click)="addRef.discard()"
            >
              Try again
            </button>
          </div>
        }
        @if (added()) {
          <p class="account__body" role="status">Passkey added.</p>
        }
      </section>

      <section class="account__block">
        <h2 class="account__heading">Recovery codes</h2>
        <p class="account__body">
          Recovery codes left: <span class="asys-num">{{ session.me()?.recoveryCodesLeft }}</span>
        </p>
        @if (codes().length > 0) {
          <div class="account__block" animate.enter="asys-enter">
            <ol class="account__codes asys-num">
              @for (code of codes(); track $index) {
                <li>{{ code }}</li>
              }
            </ol>
            <p class="account__body">These codes are shown only now. Keep them somewhere safe.</p>
            <div class="account__actions">
              <button asys-button type="button" [variant]="Variant.Secondary" (click)="copy()">
                Copy
              </button>
              <button asys-button type="button" [variant]="Variant.Primary" (click)="hideCodes()">
                Done
              </button>
            </div>
            @if (copyStatus(); as text) {
              <p class="account__body" role="status">{{ text }}</p>
            }
          </div>
        } @else if (confirmingCodes()) {
          <div class="account__block" animate.enter="asys-enter">
            <p class="account__body">
              New codes replace all your current codes and sign you out on your other devices.
            </p>
            <div class="account__actions">
              <button
                asys-button
                type="button"
                [variant]="Variant.Danger"
                [disabled]="regenerating()"
                (click)="makeCodes()"
              >
                Make new codes
              </button>
              <button
                asys-button
                type="button"
                [variant]="Variant.Quiet"
                (click)="confirmingCodes.set(false)"
              >
                Cancel
              </button>
            </div>
          </div>
        } @else {
          <div>
            <button
              asys-button
              type="button"
              [variant]="Variant.Secondary"
              (click)="confirmingCodes.set(true)"
            >
              Make new recovery codes
            </button>
          </div>
        }
        @if (codesMessage(); as text) {
          <p class="account__message" role="alert">{{ text }}</p>
        }
      </section>

      <section class="account__block">
        <h2 class="account__heading">Sign out</h2>
        <div>
          <button
            asys-button
            type="button"
            [variant]="Variant.Secondary"
            [disabled]="signingOut()"
            (click)="signOut()"
          >
            Sign out
          </button>
        </div>
        @if (signOutMessage(); as text) {
          <p class="account__message" role="alert">{{ text }}</p>
        }
      </section>
    </div>
  `,
  styles: `
    .account,
    .account__block,
    .account__confirm {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .account {
      padding-block-end: var(--space-5);
      gap: var(--space-6);
    }

    .account__block {
      gap: var(--space-2);
    }

    .account__title,
    .account__heading,
    .account__body,
    .account__reason,
    .account__message {
      margin: 0;
    }

    .account__title {
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
    }

    .account__heading {
      font-size: var(--font-size-heading);
      line-height: var(--line-height-heading);
    }

    .account__body,
    .account__codes {
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .account__strong {
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
    }

    .account__reason {
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
    }

    .account__message {
      color: var(--danger);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }

    .account__list,
    .account__codes {
      margin: 0;
      padding: 0;
    }

    .account__list {
      list-style: none;
    }

    .account__codes {
      padding-inline-start: var(--space-6);
    }

    .account__row {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding-block: var(--space-2);
    }

    .account__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class Account {
  private readonly authApi = inject(AuthApi);

  private readonly ceremony = inject(PasskeyCeremony);

  private readonly appUpdate = inject(AppUpdate);

  private readonly dataStore = inject(DataStore);

  private readonly clock = inject(Clock);

  private readonly deviceZone = inject(DeviceZone);

  protected readonly session = inject(Session);

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly AuthError = AuthError;

  private readonly passkeysHeading = viewChild<ElementRef<HTMLElement>>('passkeysHeading');

  protected readonly passkeys = resource({
    loader: async () => {
      const result = await this.authApi.passkeys();

      if (result._tag === AuthResultTag.Failed) {
        throw new Error('passkeys');
      }

      return result.value;
    },
  });

  private readonly timeZone = computed(
    () => this.dataStore.state()?.settings.timeZone ?? this.deviceZone.current() ?? 'UTC',
  );

  protected readonly rows = computed(() => {
    if (!this.passkeys.hasValue()) {
      return [];
    }

    const zone = this.timeZone();

    return this.passkeys.value().map((passkey: Passkey) => ({
      passkey,
      created: this.formatDate(passkey.createdAt, zone),
      lastUsed: passkey.lastUsedAt === null ? null : this.formatDate(passkey.lastUsedAt, zone),
    }));
  });

  protected readonly confirmingRemoval = signal<string | null>(null);

  protected readonly removing = signal(false);

  protected readonly removeMessage = signal<string | null>(null);

  protected readonly adding = signal(false);

  protected readonly added = signal(false);

  private readonly addMessage = signal<string | null>(null);

  protected readonly addRef = ceremonyOptions(() => this.authApi.addOptions());

  protected readonly addOptions = this.addRef.options;

  protected readonly shownAddMessage = computed(
    () =>
      this.addMessage() ??
      (this.addRef.error() === null || this.addRef.error() === AuthError.Unauthorized
        ? null
        : GENERIC_MESSAGE),
  );

  private readonly addModel = signal({ name: '' });

  protected readonly addForm = form(
    this.addModel,
    (path) => {
      validate(path.name, ({ value }) => {
        const name = value();

        if (name.trim().length === 0) {
          return undefined;
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
        action: async () => {
          await this.addPasskey();

          return undefined;
        },
        onInvalid: (field) => {
          field.name().focusBoundControl();
        },
      },
    },
  );

  protected readonly confirmingCodes = signal(false);

  protected readonly regenerating = signal(false);

  protected readonly codes = signal<readonly string[]>([]);

  protected readonly copyStatus = signal<string | null>(null);

  protected readonly codesMessage = signal<string | null>(null);

  private held = false;

  private destroyed = false;

  protected readonly signingOut = signal(false);

  protected readonly signOutMessage = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.codes.set([]);
      this.releaseHold();
    });
  }

  protected reload(): void {
    this.passkeys.reload();
  }

  protected async remove(credentialId: string): Promise<void> {
    if (this.removing()) {
      return;
    }

    this.removeMessage.set(null);
    this.removing.set(true);

    try {
      const result = await this.authApi.removePasskey(credentialId);

      if (result._tag === AuthResultTag.Ok) {
        this.confirmingRemoval.set(null);
        this.reload();
        this.passkeysHeading()?.nativeElement.focus();

        return;
      }

      if (result.error === AuthError.LastPasskey) {
        this.removeMessage.set('You cannot remove your only passkey.');
      } else if (result.error !== AuthError.Unauthorized) {
        this.removeMessage.set(GENERIC_MESSAGE);
      }
    } finally {
      this.removing.set(false);
    }
  }

  private async addPasskey(): Promise<void> {
    const current = this.addOptions();

    if (current === null || this.adding()) {
      return;
    }

    this.addMessage.set(null);
    this.added.set(false);
    this.adding.set(true);

    try {
      const created = await this.ceremony.create(current.options);

      if (created._tag === CeremonyResultTag.Failed) {
        this.addMessage.set(messageForFailure(created.failure));

        if (created.failure !== PasskeyFailure.Cancelled) {
          this.addRef.discard();
        }

        return;
      }

      const name = this.addModel().name.trim();

      const result = await this.authApi.addPasskey(
        current.challengeId,
        created.response,
        name === '' ? undefined : name,
      );

      this.addRef.discard();

      if (result._tag === AuthResultTag.Ok) {
        this.addForm().reset({ name: '' });
        this.added.set(true);
        this.reload();

        return;
      }

      this.addMessage.set(messageForAddError(result.error));
    } finally {
      this.adding.set(false);
    }
  }

  protected async makeCodes(): Promise<void> {
    if (this.regenerating()) {
      return;
    }

    this.codesMessage.set(null);
    this.regenerating.set(true);

    try {
      const result = await this.authApi.regenerateRecoveryCodes();

      if (this.destroyed) {
        return;
      }

      if (result._tag === AuthResultTag.Failed) {
        if (result.error !== AuthError.Unauthorized) {
          this.codesMessage.set(GENERIC_MESSAGE);
        }

        return;
      }

      this.confirmingCodes.set(false);
      this.copyStatus.set(null);
      this.codes.set(result.value.recoveryCodes);

      if (!this.held) {
        this.held = true;
        this.appUpdate.hold();
      }

      await this.session.check();
    } finally {
      if (!this.destroyed) {
        this.regenerating.set(false);
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

  protected hideCodes(): void {
    this.codes.set([]);
    this.copyStatus.set(null);
    this.releaseHold();
  }

  protected async signOut(): Promise<void> {
    if (this.signingOut()) {
      return;
    }

    this.signOutMessage.set(null);
    this.signingOut.set(true);

    try {
      const result = await this.authApi.signOut();

      if (result._tag === AuthResultTag.Ok || result.error === AuthError.Unauthorized) {
        this.session.signedOut();

        return;
      }

      this.signOutMessage.set('Could not sign out. Try again.');
    } finally {
      this.signingOut.set(false);
    }
  }

  private releaseHold(): void {
    if (this.held) {
      this.held = false;
      this.appUpdate.release();
    }
  }

  private formatDate(at: number, zone: string): string {
    try {
      const year = (instant: number): string =>
        new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: zone }).format(instant);

      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(year(at) === year(this.clock.now()) ? {} : { year: 'numeric' }),
        timeZone: zone,
      }).format(at);
    } catch {
      return this.formatDateIn(at, 'UTC');
    }
  }

  private formatDateIn(at: number, zone: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: zone,
    }).format(at);
  }
}
