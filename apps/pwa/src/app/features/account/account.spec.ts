// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CeremonyResultTag, type CeremonyResult } from '@ionaru/effect-passkeys/client';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

import {
  AuthApi,
  AuthError,
  AuthResultTag,
  type AuthResult,
  type CeremonyOptions,
  type Passkey,
  type RecoveryCodes,
} from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { Session, SignOutReason } from '../../core/auth/session';
import { CaptureQueue } from '../../core/data/capture-queue';
import { DataStore } from '../../core/data/data-store';
import { DoneUndo } from '../../core/data/done-undo';
import { GENERIC_MESSAGE } from '../../core/data/outcome-message';
import { AppUpdate } from '../../core/platform/app-update';
import { Clock } from '../../core/platform/clock';
import { DeviceZone } from '../../core/platform/device-zone';
import { Account } from './account';

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

const OK: AuthResult<void> = { _tag: AuthResultTag.Ok, value: undefined };

const CODES = ['aaaa-1111', 'bbbb-2222', 'cccc-3333', 'dddd-4444'];

const NEW_CODES = ['eeee-5555', 'ffff-6666'];

const codesOk = (recoveryCodes: readonly string[]): AuthResult<RecoveryCodes> => ({
  _tag: AuthResultTag.Ok,
  value: { recoveryCodes },
});

const failed = <T>(error: AuthError): Promise<AuthResult<T>> =>
  Promise.resolve({ _tag: AuthResultTag.Failed, error });

const PASSKEY: Passkey = {
  credentialId: 'credential-1',
  name: 'Laptop',
  createdAt: 0,
  lastUsedAt: null,
  backedUp: false,
};

const BEGIN: AuthResult<CeremonyOptions<PublicKeyCredentialCreationOptionsJSON>> = {
  _tag: AuthResultTag.Ok,
  value: {
    challengeId: 'challenge-1',
    options: { challenge: 'challenge-bytes' } as PublicKeyCredentialCreationOptionsJSON,
  },
};

const CEREMONY_OK: CeremonyResult<RegistrationResponseJSON> = {
  _tag: CeremonyResultTag.Ok,
  response: { id: 'credential-2' } as unknown as RegistrationResponseJSON,
};

type AuthApiSeams = Pick<
  AuthApi,
  'passkeys' | 'addOptions' | 'addPasskey' | 'removePasskey' | 'regenerateRecoveryCodes'
>;

interface Seams {
  readonly api?: Partial<AuthApiSeams>;
  readonly create?: PasskeyCeremony['create'];
}

const settle = async (): Promise<void> => {
  for (let round = 0; round < 3; round += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve));
  }
};

const setup = async ({ api = {}, create = vi.fn() }: Seams = {}) => {
  const flush = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const drain = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const signOut = vi.fn<() => Promise<AuthResult<void>>>(() => Promise.resolve(OK));
  const signedOut = vi.fn<(reason: SignOutReason) => void>();
  const hold = vi.fn<() => void>();
  const release = vi.fn<() => void>();
  const check = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const regenerate = vi.fn<() => Promise<AuthResult<RecoveryCodes>>>(() =>
    Promise.resolve(codesOk(CODES)),
  );

  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthApi,
        useValue: {
          passkeys: () => Promise.resolve({ _tag: AuthResultTag.Ok, value: [] }),
          addOptions: () =>
            Promise.resolve({ _tag: AuthResultTag.Failed, error: AuthError.Unauthorized }),
          signOut,
          regenerateRecoveryCodes: regenerate,
          ...api,
        },
      },
      { provide: PasskeyCeremony, useValue: { create, supported: () => true } },
      { provide: AppUpdate, useValue: { hold, release } },
      { provide: DataStore, useValue: { state: signal(null) } },
      { provide: Clock, useValue: { now: () => 0 } },
      { provide: DeviceZone, useValue: { current: () => 'UTC' } },
      {
        provide: Session,
        useValue: {
          me: signal({ name: 'Jeroen', recoveryCodesLeft: 3 }),
          check,
          signedOut,
        },
      },
      { provide: DoneUndo, useValue: { flush } },
      { provide: CaptureQueue, useValue: { drain } },
    ],
  });

  const fixture = TestBed.createComponent(Account);

  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const signOutButton = (): HTMLButtonElement =>
    must(
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
      ).find((b) => b.textContent?.trim() === 'Sign out'),
      'Sign out button',
    );

  const root = (): HTMLElement => fixture.nativeElement;

  const button = (text: string): HTMLButtonElement =>
    must(
      Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent?.trim() === text,
      ),
      `${text} button`,
    );

  const alert = (): string | null =>
    root().querySelector('[role="alert"]')?.textContent?.trim() ?? null;

  const hasButton = (text: string): boolean =>
    Array.from(root().querySelectorAll('button')).some((b) => b.textContent?.trim() === text);

  const click = async (target: HTMLButtonElement): Promise<void> => {
    target.click();
    await fixture.whenStable();
    await settle();
    fixture.detectChanges();
  };

  const showCodes = async (): Promise<void> => {
    await click(button('Make new recovery codes'));
    await click(button('Make new codes'));
  };

  const items = (): string[] =>
    Array.from(root().querySelectorAll('ol.asys-num li')).map((li) => li.textContent?.trim() ?? '');

  const status = (): HTMLElement | null => root().querySelector('p[role="status"]');

  return {
    fixture,
    root,
    flush,
    drain,
    signOut,
    signedOut,
    signOutButton,
    button,
    alert,
    hasButton,
    click,
    hold,
    release,
    check,
    regenerate,
    showCodes,
    items,
    status,
  };
};

describe('Account sign out', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('flushes a held Done, then drains the capture queue, then signs out', async () => {
    const { fixture, flush, drain, signOut, signedOut, signOutButton } = await setup();

    signOutButton().click();
    await fixture.whenStable();
    await settle();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);

    const order = [flush, drain, signOut].map((spy) => must(spy.mock.invocationCallOrder[0]));

    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(signedOut).toHaveBeenCalledExactlyOnceWith(SignOutReason.Chosen);
  });

  it('ends the session as Chosen when the server no longer knows it', async () => {
    const { fixture, signOut, signedOut, signOutButton } = await setup();

    signOut.mockResolvedValueOnce({ _tag: AuthResultTag.Failed, error: AuthError.Unauthorized });

    signOutButton().click();
    await fixture.whenStable();
    await settle();

    expect(signedOut).toHaveBeenCalledExactlyOnceWith(SignOutReason.Chosen);
  });

  it('does not sign out while the flush is pending, nor drain before it resolves', async () => {
    const { fixture, flush, drain, signOut, signedOut, signOutButton } = await setup();
    const pending = deferred<void>();

    flush.mockReturnValueOnce(pending.promise);

    signOutButton().click();
    await settle();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(drain).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(signedOut).not.toHaveBeenCalled();

    pending.resolve();
    await fixture.whenStable();
    await settle();

    expect(drain).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('does not sign out while the capture queue is still draining', async () => {
    const { fixture, drain, signOut, signedOut, signOutButton } = await setup();
    const pending = deferred<void>();

    drain.mockReturnValueOnce(pending.promise);

    signOutButton().click();
    await settle();

    expect(drain).toHaveBeenCalledTimes(1);
    expect(signOut).not.toHaveBeenCalled();
    expect(signedOut).not.toHaveBeenCalled();

    pending.resolve();
    await fixture.whenStable();
    await settle();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('disables the Sign out button while the flush is pending, so a second click starts nothing', async () => {
    const { fixture, flush, signOutButton } = await setup();
    const pending = deferred<void>();

    flush.mockReturnValueOnce(pending.promise);

    signOutButton().click();
    await fixture.whenStable();
    await settle();
    fixture.detectChanges();

    expect(signOutButton().disabled).toBe(true);

    signOutButton().click();
    await settle();

    expect(flush).toHaveBeenCalledTimes(1);

    pending.resolve();
    await fixture.whenStable();
  });

  it('still reports a failed sign-out after the flush and the drain, and does not end the session', async () => {
    const { fixture, flush, drain, signOut, signedOut, signOutButton } = await setup();

    signOut.mockResolvedValueOnce({ _tag: AuthResultTag.Failed, error: AuthError.Network });

    signOutButton().click();
    await fixture.whenStable();
    await settle();
    fixture.detectChanges();

    expect(flush).toHaveBeenCalledTimes(1);
    expect(drain).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signedOut).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Could not sign out. Try again.');
    expect(signOutButton().disabled).toBe(false);
  });
});

describe('Account failures', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('when the session ended (Unauthorized)', () => {
    it('shows no alert and no Try again when loading the add options fails', async () => {
      const addOptions = vi.fn<AuthApi['addOptions']>(() => failed(AuthError.Unauthorized));
      const { fixture, alert, hasButton } = await setup({ api: { addOptions } });

      fixture.detectChanges();

      expect(addOptions).toHaveBeenCalledTimes(1);
      expect(alert()).toBeNull();
      expect(hasButton('Try again')).toBe(false);
    });

    it('shows no alert and no Try again when adding a passkey fails', async () => {
      const addOptions = vi.fn<AuthApi['addOptions']>(() => Promise.resolve(BEGIN));
      const addPasskey = vi.fn<AuthApi['addPasskey']>(() => failed(AuthError.Unauthorized));
      const create = vi.fn<PasskeyCeremony['create']>(() => Promise.resolve(CEREMONY_OK));
      const { fixture, alert, hasButton, button, click } = await setup({
        api: { addOptions, addPasskey },
        create,
      });

      fixture.detectChanges();
      await click(button('Add a passkey'));

      expect(addPasskey).toHaveBeenCalledTimes(1);
      expect(alert()).toBeNull();
      expect(hasButton('Try again')).toBe(false);
    });

    it('shows no alert and no Try again when removing a passkey fails', async () => {
      const passkeys = vi.fn<AuthApi['passkeys']>(() =>
        Promise.resolve({ _tag: AuthResultTag.Ok, value: [PASSKEY] }),
      );
      const removePasskey = vi.fn<AuthApi['removePasskey']>(() => failed(AuthError.Unauthorized));
      const { fixture, alert, hasButton, button, click } = await setup({
        api: { passkeys, removePasskey },
      });

      fixture.detectChanges();
      await click(button('Remove Laptop'));
      await click(button('Remove passkey'));

      expect(removePasskey).toHaveBeenCalledWith(PASSKEY.credentialId);
      expect(alert()).toBeNull();
      expect(hasButton('Try again')).toBe(false);
    });

    it('shows no alert and no Try again when making new recovery codes fails', async () => {
      const regenerateRecoveryCodes = vi.fn<AuthApi['regenerateRecoveryCodes']>(() =>
        failed(AuthError.Unauthorized),
      );
      const { fixture, alert, hasButton, button, click } = await setup({
        api: { regenerateRecoveryCodes },
      });

      fixture.detectChanges();
      await click(button('Make new recovery codes'));
      await click(button('Make new codes'));

      expect(regenerateRecoveryCodes).toHaveBeenCalledTimes(1);
      expect(alert()).toBeNull();
      expect(hasButton('Try again')).toBe(false);
    });
  });

  describe('when the server cannot be reached (Network)', () => {
    it('shows GENERIC_MESSAGE and Try again when loading the add options fails, and Try again loads them again', async () => {
      const addOptions = vi.fn<AuthApi['addOptions']>(() => failed(AuthError.Network));
      const { fixture, alert, button, click } = await setup({ api: { addOptions } });

      fixture.detectChanges();

      expect(alert()).toBe(GENERIC_MESSAGE);

      await click(button('Try again'));

      expect(addOptions).toHaveBeenCalledTimes(2);
    });

    it('shows GENERIC_MESSAGE when adding a passkey fails', async () => {
      const addOptions = vi.fn<AuthApi['addOptions']>(() => Promise.resolve(BEGIN));
      const addPasskey = vi.fn<AuthApi['addPasskey']>(() => failed(AuthError.Network));
      const create = vi.fn<PasskeyCeremony['create']>(() => Promise.resolve(CEREMONY_OK));
      const { fixture, alert, button, click } = await setup({
        api: { addOptions, addPasskey },
        create,
      });

      fixture.detectChanges();
      await click(button('Add a passkey'));

      expect(addPasskey).toHaveBeenCalledTimes(1);
      expect(alert()).toBe(GENERIC_MESSAGE);
    });

    it('shows GENERIC_MESSAGE when removing a passkey fails', async () => {
      const passkeys = vi.fn<AuthApi['passkeys']>(() =>
        Promise.resolve({ _tag: AuthResultTag.Ok, value: [PASSKEY] }),
      );
      const removePasskey = vi.fn<AuthApi['removePasskey']>(() => failed(AuthError.Network));
      const { fixture, alert, button, click } = await setup({ api: { passkeys, removePasskey } });

      fixture.detectChanges();
      await click(button('Remove Laptop'));
      await click(button('Remove passkey'));

      expect(removePasskey).toHaveBeenCalledTimes(1);
      expect(alert()).toBe(GENERIC_MESSAGE);
    });

    it('shows GENERIC_MESSAGE when making new recovery codes fails', async () => {
      const regenerateRecoveryCodes = vi.fn<AuthApi['regenerateRecoveryCodes']>(() =>
        failed<RecoveryCodes>(AuthError.Network),
      );
      const { fixture, alert, button, click } = await setup({ api: { regenerateRecoveryCodes } });

      fixture.detectChanges();
      await click(button('Make new recovery codes'));
      await click(button('Make new codes'));

      expect(regenerateRecoveryCodes).toHaveBeenCalledTimes(1);
      expect(alert()).toBe(GENERIC_MESSAGE);
    });
  });

  describe('specific messages', () => {
    it('says a passkey that is the only one cannot be removed', async () => {
      const passkeys = vi.fn<AuthApi['passkeys']>(() =>
        Promise.resolve({ _tag: AuthResultTag.Ok, value: [PASSKEY] }),
      );
      const removePasskey = vi.fn<AuthApi['removePasskey']>(() => failed(AuthError.LastPasskey));
      const { fixture, alert, button, click } = await setup({ api: { passkeys, removePasskey } });

      fixture.detectChanges();
      await click(button('Remove Laptop'));
      await click(button('Remove passkey'));

      expect(alert()).toBe('You cannot remove your only passkey.');
    });

    it.each([
      [AuthError.ChallengeInvalid, 'Try again.'],
      [AuthError.VerificationFailed, 'Try again.'],
      [AuthError.AlreadyRegistered, 'This device already has a passkey for ASYS.'],
    ])('says the add message for %s', async (error, message) => {
      const addOptions = vi.fn<AuthApi['addOptions']>(() => Promise.resolve(BEGIN));
      const addPasskey = vi.fn<AuthApi['addPasskey']>(() => failed(error));
      const create = vi.fn<PasskeyCeremony['create']>(() => Promise.resolve(CEREMONY_OK));
      const { fixture, alert, button, click } = await setup({
        api: { addOptions, addPasskey },
        create,
      });

      fixture.detectChanges();
      await click(button('Add a passkey'));

      expect(alert()).toBe(message);
    });
  });

  describe('the passkeys list', () => {
    it.each([AuthError.Unauthorized, AuthError.Network])(
      'shows that it could not load, with Try again, on %s',
      async (error) => {
        const passkeys = vi.fn<AuthApi['passkeys']>(() => failed(error));
        const { fixture, root, alert, button, click } = await setup({ api: { passkeys } });

        fixture.detectChanges();

        expect(root().textContent).toContain('Could not load your passkeys.');
        expect(alert()).toBeNull();

        await click(button('Try again'));

        expect(passkeys).toHaveBeenCalledTimes(2);
      },
    );
  });
});

describe('Account recovery codes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('asks before it makes new codes, and holds nothing yet', async () => {
    const { regenerate, hold, button, hasButton, click } = await setup();

    await click(button('Make new recovery codes'));

    expect(hasButton('Make new codes')).toBe(true);
    expect(regenerate).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
  });

  it('shows the new codes in order, holds the update prompt and checks the session', async () => {
    const { root, hold, release, check, items, showCodes } = await setup();

    await showCodes();

    expect(items()).toEqual(CODES);
    expect(root().textContent).toContain(
      'These codes are shown only now. Keep them somewhere safe.',
    );
    expect(hold).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('shows a message and holds nothing when the new codes cannot be made', async () => {
    const { regenerate, alert, hold, items, showCodes } = await setup();

    regenerate.mockResolvedValueOnce({ _tag: AuthResultTag.Failed, error: AuthError.Network });

    await showCodes();

    expect(items()).toEqual([]);
    expect(alert()).toBe(GENERIC_MESSAGE);
    expect(hold).not.toHaveBeenCalled();
  });

  it('shows no status message at first', async () => {
    const { status, showCodes } = await setup();

    await showCodes();

    expect(status()).toBeNull();
  });

  it('Copy writes the codes joined by newlines and shows Copied.', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { status, button, click, showCodes } = await setup();

    await showCodes();
    await click(button('Copy'));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(CODES.join('\n'));
    expect(status()?.textContent?.trim()).toBe('Copied.');
  });

  it('Copy shows the failure text when the write is rejected', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error('denied'));

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { status, button, click, showCodes } = await setup();

    await showCodes();
    await click(button('Copy'));

    expect(status()?.textContent?.trim()).toBe('Could not copy. Select the codes instead.');
  });

  it('Done clears the codes and the copy status and releases the hold once', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { fixture, hold, release, items, status, button, click, showCodes } = await setup();

    await showCodes();
    await click(button('Copy'));
    await click(button('Done'));

    expect(items()).toEqual([]);
    expect(status()).toBeNull();
    expect(hold).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);

    fixture.destroy();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('holds again for codes made after Done', async () => {
    const { regenerate, hold, release, items, button, click, showCodes } = await setup();

    await showCodes();
    await click(button('Done'));
    regenerate.mockResolvedValueOnce(codesOk(NEW_CODES));
    await showCodes();

    expect(items()).toEqual(NEW_CODES);
    expect(hold).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the hold once when the screen is destroyed with codes on it', async () => {
    const { fixture, hold, release, showCodes } = await setup();

    await showCodes();
    fixture.destroy();

    expect(hold).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('does not release when no codes were shown', async () => {
    const { fixture, release } = await setup();

    fixture.destroy();

    expect(release).not.toHaveBeenCalled();
  });

  it('holds nothing when it is destroyed while the new codes are pending', async () => {
    const { fixture, regenerate, hold, release, button, click } = await setup();
    const pending = deferred<AuthResult<RecoveryCodes>>();

    regenerate.mockReturnValueOnce(pending.promise);

    await click(button('Make new recovery codes'));
    button('Make new codes').click();
    await settle();
    fixture.destroy();

    pending.resolve(codesOk(CODES));
    await settle();

    expect(hold).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});
