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
  templateUrl: './account.component.html',
  styleUrl: './account.css',
})
export class Account {
  private readonly authApi = inject(AuthApi);

  private readonly ceremony = inject(PasskeyCeremony);

  private readonly appUpdate = inject(AppUpdate);

  private readonly dataStore = inject(DataStore);

  private readonly clock = inject(Clock);

  private readonly deviceZone = inject(DeviceZone);

  private readonly doneUndo = inject(DoneUndo);

  private readonly captureQueue = inject(CaptureQueue);

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
      await this.doneUndo.flush();
      await this.captureQueue.drain();

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
