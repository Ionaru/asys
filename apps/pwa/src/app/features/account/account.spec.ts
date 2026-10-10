// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  AuthApi,
  AuthError,
  AuthResultTag,
  type AuthResult,
  type RecoveryCodes,
} from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { Session } from '../../core/auth/session';
import { CaptureQueue } from '../../core/data/capture-queue';
import { DataStore } from '../../core/data/data-store';
import { DoneUndo } from '../../core/data/done-undo';
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

const settle = async (): Promise<void> => {
  for (let round = 0; round < 3; round += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve));
  }
};

const setup = async () => {
  const flush = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const drain = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const signOut = vi.fn<() => Promise<AuthResult<void>>>(() => Promise.resolve(OK));
  const signedOut = vi.fn<() => void>();
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
        },
      },
      { provide: PasskeyCeremony, useValue: { create: vi.fn(), supported: () => true } },
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

  const button = (text: string): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === text,
    );

  const click = async (text: string): Promise<void> => {
    must(button(text), `${text} button`).click();
    await fixture.whenStable();
    await settle();
    fixture.detectChanges();
  };

  const showCodes = async (): Promise<void> => {
    await click('Make new recovery codes');
    await click('Make new codes');
  };

  const items = (): string[] =>
    Array.from(root().querySelectorAll('ol.asys-num li')).map((li) => li.textContent?.trim() ?? '');

  const status = (): HTMLElement | null => root().querySelector('p[role="status"]');

  return {
    fixture,
    flush,
    drain,
    signOut,
    signedOut,
    signOutButton,
    hold,
    release,
    check,
    regenerate,
    root,
    button,
    click,
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
    expect(signedOut).toHaveBeenCalledTimes(1);
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

describe('Account recovery codes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('asks before it makes new codes, and holds nothing yet', async () => {
    const { regenerate, hold, button, click } = await setup();

    await click('Make new recovery codes');

    expect(button('Make new codes')).toBeDefined();
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
    const { regenerate, root, hold, items, showCodes } = await setup();

    regenerate.mockResolvedValueOnce({ _tag: AuthResultTag.Failed, error: AuthError.Network });

    await showCodes();

    expect(items()).toEqual([]);
    expect(root().querySelector('p[role="alert"]')).not.toBeNull();
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
    const { status, click, showCodes } = await setup();

    await showCodes();
    await click('Copy');

    expect(writeText).toHaveBeenCalledExactlyOnceWith(CODES.join('\n'));
    expect(status()?.textContent?.trim()).toBe('Copied.');
  });

  it('Copy shows the failure text when the write is rejected', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error('denied'));

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { status, click, showCodes } = await setup();

    await showCodes();
    await click('Copy');

    expect(status()?.textContent?.trim()).toBe('Could not copy. Select the codes instead.');
  });

  it('Done clears the codes and the copy status and releases the hold once', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { fixture, hold, release, items, status, click, showCodes } = await setup();

    await showCodes();
    await click('Copy');
    await click('Done');

    expect(items()).toEqual([]);
    expect(status()).toBeNull();
    expect(hold).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);

    fixture.destroy();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('holds again for codes made after Done', async () => {
    const { regenerate, hold, release, items, click, showCodes } = await setup();

    await showCodes();
    await click('Done');
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

    await click('Make new recovery codes');
    must(button('Make new codes'), 'Make new codes button').click();
    await settle();
    fixture.destroy();

    pending.resolve(codesOk(CODES));
    await settle();

    expect(hold).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});
