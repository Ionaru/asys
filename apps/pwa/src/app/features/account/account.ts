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
import { CaptureQueue } from '../../core/data/capture-queue';
import { DataStore } from '../../core/data/data-store';
import { DoneUndo } from '../../core/data/done-undo';
import { GENERIC_MESSAGE } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { DeviceZone } from '../../core/platform/device-zone';
import { Button, ButtonSize, ButtonVariant } from '../../ui/button/button';
import { IconName } from '../../ui/icon/icon';
import { TextField } from '../../ui/text-field/text-field';
import { ceremonyOptions } from '../auth/ceremony-options';
import { nameError } from '../auth/name-rule';
import { MISCONFIGURED_MESSAGE, TRY_AGAIN_MESSAGE } from '../auth/passkey-messages';
import { recoveryCodes } from '../auth/recovery-codes';

const messageForFailure = (failure: PasskeyFailure): string | null => {
  switch (failure) {
    case PasskeyFailure.Cancelled:
      return null;
    case PasskeyFailure.AlreadyRegistered:
      return 'This device already has a passkey for ASYS.';
    case PasskeyFailure.Unsupported:
      return 'This browser or device cannot create a passkey.';
    case PasskeyFailure.Misconfigured:
      return MISCONFIGURED_MESSAGE;
    default:
      return GENERIC_MESSAGE;
  }
};

const messageForAddError = (error: AuthError): string | null => {
  switch (error) {
    case AuthError.ChallengeInvalid:
    case AuthError.VerificationFailed:
      return TRY_AGAIN_MESSAGE;
    case AuthError.AlreadyRegistered:
      return 'This device already has a passkey for ASYS.';
    case AuthError.Unauthorized:
      return null;
    default:
      return GENERIC_MESSAGE;
  }
};

/** The account screen: passkeys, recovery codes and sign out. */
@Component({
  selector: 'asys-account',
  imports: [Button, FormField, FormRoot, TextField],
  templateUrl: './account.component.html',
  styleUrl: './account.css',
})
export class Account {
  readonly #authApi = inject(AuthApi);

  readonly #ceremony = inject(PasskeyCeremony);

  readonly #dataStore = inject(DataStore);

  readonly #clock = inject(Clock);

  readonly #deviceZone = inject(DeviceZone);

  readonly #doneUndo = inject(DoneUndo);

  readonly #captureQueue = inject(CaptureQueue);

  readonly #destroyRef = inject(DestroyRef);

  protected readonly session = inject(Session);

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly Icons = IconName;

  protected readonly AuthError = AuthError;

  private readonly passkeysHeading = viewChild<ElementRef<HTMLElement>>('passkeysHeading');

  protected readonly passkeys = resource({
    loader: async () => {
      const result = await this.#authApi.passkeys();

      if (result._tag === AuthResultTag.Failed) {
        throw new Error('passkeys');
      }

      return result.value;
    },
  });

  readonly #timeZone = computed(
    () => this.#dataStore.state()?.settings.timeZone ?? this.#deviceZone.current() ?? 'UTC',
  );

  protected readonly rows = computed(() => {
    if (!this.passkeys.hasValue()) {
      return [];
    }

    const zone = this.#timeZone();

    return this.passkeys.value().map((passkey: Passkey) => ({
      passkey,
      created: this.#formatDate(passkey.createdAt, zone),
      lastUsed: passkey.lastUsedAt === null ? null : this.#formatDate(passkey.lastUsedAt, zone),
    }));
  });

  protected readonly confirmingRemoval = signal<string | null>(null);

  protected readonly removing = signal(false);

  protected readonly removeMessage = signal<string | null>(null);

  protected readonly adding = signal(false);

  protected readonly added = signal(false);

  readonly #addMessage = signal<string | null>(null);

  protected readonly addRef = ceremonyOptions(() => this.#authApi.addOptions());

  protected readonly addOptions = this.addRef.options;

  protected readonly shownAddMessage = computed(
    () =>
      this.#addMessage() ??
      (this.addRef.error() === null || this.addRef.error() === AuthError.Unauthorized
        ? null
        : GENERIC_MESSAGE),
  );

  readonly #addModel = signal({ name: '' });

  protected readonly addForm = form(
    this.#addModel,
    (path) => {
      validate(path.name, ({ value }) => {
        const name = value();

        return name.trim().length === 0 ? undefined : nameError(name);
      });
    },
    {
      submission: {
        action: async () => {
          await this.#addPasskey();

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

  readonly #recovery = recoveryCodes();

  protected readonly codes = this.#recovery.codes;

  protected readonly copyStatus = this.#recovery.copyStatus;

  protected readonly codesMessage = signal<string | null>(null);

  protected readonly signingOut = signal(false);

  protected readonly signOutMessage = signal<string | null>(null);

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
      const result = await this.#authApi.removePasskey(credentialId);

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

  async #addPasskey(): Promise<void> {
    const current = this.addOptions();

    if (current === null || this.adding()) {
      return;
    }

    this.#addMessage.set(null);
    this.added.set(false);
    this.adding.set(true);

    try {
      const created = await this.#ceremony.create(current.options);

      if (created._tag === CeremonyResultTag.Failed) {
        this.#addMessage.set(messageForFailure(created.failure));

        if (created.failure !== PasskeyFailure.Cancelled) {
          this.addRef.discard();
        }

        return;
      }

      const name = this.#addModel().name.trim();

      const result = await this.#authApi.addPasskey(
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

      this.#addMessage.set(messageForAddError(result.error));
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
      const result = await this.#authApi.regenerateRecoveryCodes();

      if (this.#destroyRef.destroyed) {
        return;
      }

      if (result._tag === AuthResultTag.Failed) {
        if (result.error !== AuthError.Unauthorized) {
          this.codesMessage.set(GENERIC_MESSAGE);
        }

        return;
      }

      this.confirmingCodes.set(false);
      this.#recovery.show(result.value.recoveryCodes);

      await this.session.check();
    } finally {
      if (!this.#destroyRef.destroyed) {
        this.regenerating.set(false);
      }
    }
  }

  protected copy(): Promise<void> {
    return this.#recovery.copy();
  }

  protected hideCodes(): void {
    this.#recovery.hide();
  }

  protected async signOut(): Promise<void> {
    if (this.signingOut()) {
      return;
    }

    this.signOutMessage.set(null);
    this.signingOut.set(true);

    try {
      await this.#doneUndo.flush();
      await this.#captureQueue.drain();

      const result = await this.#authApi.signOut();

      if (result._tag === AuthResultTag.Ok || result.error === AuthError.Unauthorized) {
        this.session.signedOut();

        return;
      }

      this.signOutMessage.set('Could not sign out. Try again.');
    } finally {
      this.signingOut.set(false);
    }
  }

  #formatDate(at: number, zone: string): string {
    try {
      const year = (instant: number): string =>
        new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: zone }).format(instant);

      return new Intl.DateTimeFormat('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(year(at) === year(this.#clock.now()) ? {} : { year: 'numeric' }),
        timeZone: zone,
      }).format(at);
    } catch {
      return this.#formatDateIn(at, 'UTC');
    }
  }

  #formatDateIn(at: number, zone: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: zone,
    }).format(at);
  }
}
