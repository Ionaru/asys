// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthApi, AuthError, AuthResultTag, type AuthResult } from '../../core/api/auth-api';
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

  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthApi,
        useValue: {
          passkeys: () => Promise.resolve({ _tag: AuthResultTag.Ok, value: [] }),
          addOptions: () =>
            Promise.resolve({ _tag: AuthResultTag.Failed, error: AuthError.Unauthorized }),
          signOut,
        },
      },
      { provide: PasskeyCeremony, useValue: { create: vi.fn(), supported: () => true } },
      { provide: AppUpdate, useValue: { hold: vi.fn(), release: vi.fn() } },
      { provide: DataStore, useValue: { state: signal(null) } },
      { provide: Clock, useValue: { now: () => 0 } },
      { provide: DeviceZone, useValue: { current: () => 'UTC' } },
      {
        provide: Session,
        useValue: {
          me: signal({ name: 'Jeroen', recoveryCodesLeft: 3 }),
          check: vi.fn(() => Promise.resolve()),
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

  return { fixture, flush, drain, signOut, signedOut, signOutButton };
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
