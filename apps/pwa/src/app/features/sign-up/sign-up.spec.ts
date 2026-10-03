// SPDX-License-Identifier: EUPL-1.2
import { Location } from '@angular/common';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import type { Subject } from 'rxjs';
import {
  CeremonyResultTag,
  PasskeyFailure,
  type CeremonyResult,
} from '@ionaru/effect-passkeys/client';
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
  type RecoveryCodes,
} from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { SessionState, Session } from '../../core/auth/session';
import { AppUpdate } from '../../core/platform/app-update';
import { DeviceZone } from '../../core/platform/device-zone';
import { SignUp } from './sign-up';

type BeginOptions = CeremonyOptions<PublicKeyCredentialCreationOptionsJSON>;

const TOKEN = 'a'.repeat(43);

const CODES = ['aaaa-1111', 'bbbb-2222', 'cccc-3333', 'dddd-4444'];

const response = { id: 'credential-1' } as unknown as RegistrationResponseJSON;

const begin = (n: number): AuthResult<BeginOptions> => ({
  _tag: AuthResultTag.Ok,
  value: {
    challengeId: `challenge-${n}`,
    options: { challenge: `challenge-bytes-${n}` } as PublicKeyCredentialCreationOptionsJSON,
  },
});

const optionsOf = (n: number): PublicKeyCredentialCreationOptionsJSON =>
  ({ challenge: `challenge-bytes-${n}` }) as PublicKeyCredentialCreationOptionsJSON;

const ceremonyOk: CeremonyResult<RegistrationResponseJSON> = {
  _tag: CeremonyResultTag.Ok,
  response,
};

const ceremonyFailed = (failure: PasskeyFailure): CeremonyResult<RegistrationResponseJSON> => ({
  _tag: CeremonyResultTag.Failed,
  failure,
  cause: new Error('cause'),
});

const registered: AuthResult<RecoveryCodes> = {
  _tag: AuthResultTag.Ok,
  value: { recoveryCodes: CODES },
};

const registerFailed = (error: AuthError): AuthResult<RecoveryCodes> => ({
  _tag: AuthResultTag.Failed,
  error,
});

const SOMETHING_WENT_WRONG = 'Something went wrong. Try again.';

const ALREADY_REGISTERED = 'This device already has a passkey for ASYS. Sign in instead.';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

const defer = <T>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

describe('SignUp', () => {
  let registerOptions: ReturnType<
    typeof vi.fn<(token: string, name: string) => Promise<AuthResult<BeginOptions>>>
  >;
  let register: ReturnType<
    typeof vi.fn<
      (
        token: string,
        timeZone: string,
        challengeId: string,
        response: RegistrationResponseJSON,
      ) => Promise<AuthResult<RecoveryCodes>>
    >
  >;
  let create: ReturnType<
    typeof vi.fn<
      (
        options: PublicKeyCredentialCreationOptionsJSON,
      ) => Promise<CeremonyResult<RegistrationResponseJSON>>
    >
  >;
  let signedIn: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let hold: ReturnType<typeof vi.fn<() => void>>;
  let release: ReturnType<typeof vi.fn<() => void>>;
  let zone: ReturnType<typeof vi.fn<() => string | undefined>>;
  let sessionState: SessionState;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  let replaceState: ReturnType<typeof vi.spyOn>;

  const flush = async (fixture: ComponentFixture<SignUp>): Promise<void> => {
    for (let round = 0; round < 3; round += 1) {
      TestBed.tick();
      await fixture.whenStable();
      await new Promise<void>((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }
  };

  /** Settles without `whenStable()`, which hangs while a fake promise is pending. */
  const settle = async (fixture: ComponentFixture<SignUp>): Promise<void> => {
    for (let round = 0; round < 3; round += 1) {
      TestBed.tick();
      await new Promise<void>((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }
  };

  const setup = async (hash = `#token=${TOKEN}`) => {
    history.replaceState(null, '', `/signup${hash}`);
    const fixture = TestBed.createComponent(SignUp);

    await flush(fixture);

    const root = (): HTMLElement => fixture.nativeElement;
    const h1s = (): string[] =>
      Array.from(root().querySelectorAll('h1')).map((h) => h.textContent?.trim() ?? '');
    const button = (text: string): HTMLButtonElement | undefined =>
      Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
    const alert = (): HTMLElement | null => root().querySelector('p[role="alert"]');
    const status = (): HTMLElement | null => root().querySelector('p[role="status"]');
    const nameInput = (): HTMLInputElement => root().querySelector('input') as HTMLInputElement;
    const click = async (target: HTMLButtonElement | undefined): Promise<void> => {
      (target as HTMLButtonElement).click();
      await flush(fixture);
    };
    const typeName = (value: string): void => {
      const input = nameInput();

      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
    };
    const submitName = async (value: string): Promise<void> => {
      typeName(value);
      await click(button('Continue'));
    };
    const toCodes = async (): Promise<void> => {
      await submitName('Ann');
      await click(button('Create passkey'));
    };

    return {
      fixture,
      root,
      h1s,
      button,
      alert,
      status,
      nameInput,
      click,
      typeName,
      submitName,
      toCodes,
    };
  };

  beforeEach(() => {
    sessionState = SessionState.SignedOut;
    let n = 0;
    registerOptions = vi
      .fn<(token: string, name: string) => Promise<AuthResult<BeginOptions>>>()
      .mockImplementation(() => {
        n += 1;

        return Promise.resolve(begin(n));
      });
    register = vi
      .fn<
        (
          token: string,
          timeZone: string,
          challengeId: string,
          response: RegistrationResponseJSON,
        ) => Promise<AuthResult<RecoveryCodes>>
      >()
      .mockResolvedValue(registered);
    create = vi
      .fn<
        (
          options: PublicKeyCredentialCreationOptionsJSON,
        ) => Promise<CeremonyResult<RegistrationResponseJSON>>
      >()
      .mockResolvedValue(ceremonyOk);
    signedIn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    hold = vi.fn<() => void>();
    release = vi.fn<() => void>();
    zone = vi.fn<() => string | undefined>().mockReturnValue('Europe/Amsterdam');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthApi, useValue: { registerOptions, register } },
        { provide: PasskeyCeremony, useValue: { create, supported: () => true } },
        { provide: Session, useValue: { state: () => sessionState, signedIn } },
        { provide: AppUpdate, useValue: { hold, release } },
        { provide: DeviceZone, useValue: { current: zone } },
      ],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    replaceState = vi.spyOn(TestBed.inject(Location), 'replaceState');
  });

  afterEach(() => {
    history.replaceState(null, '', '/');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  describe('start', () => {
    it('a valid token shows the Name step with a single h1 inside main.asys-page', async () => {
      const { root, h1s } = await setup();

      expect(h1s()).toEqual(['Sign up']);
      expect(root().querySelector('main.asys-page h1')).not.toBeNull();
      expect(root().textContent).toContain('How ASYS addresses you.');
      expect(registerOptions).not.toHaveBeenCalled();
    });

    it('when already signed in shows the AlreadySignedIn step and sends nothing', async () => {
      sessionState = SessionState.SignedIn;
      const { root, h1s } = await setup();

      expect(h1s()).toEqual(['Sign up']);
      expect(root().textContent).toContain('You are already signed in.');

      const link = Array.from(root().querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Go to Now',
      );

      expect(link?.getAttribute('href')).toBe('/now');
      expect(link?.classList.contains('asys-button')).toBe(true);
      expect(link?.classList.contains('asys-button--quiet')).toBe(true);
      expect(registerOptions).not.toHaveBeenCalled();
      expect(register).not.toHaveBeenCalled();
    });

    it('when already signed in ignores a valid token', async () => {
      sessionState = SessionState.SignedIn;
      const { root } = await setup();

      expect(root().querySelector('input')).toBeNull();
      expect(registerOptions).not.toHaveBeenCalled();
    });

    it.each([
      ['no hash', ''],
      ['no token parameter', '#other=value'],
      ['an empty token', '#token='],
      ['a token of 42 characters', `#token=${'a'.repeat(42)}`],
      ['a token of 44 characters', `#token=${'a'.repeat(44)}`],
      ['a token with a character outside base64url', `#token=${'a'.repeat(42)}!`],
      ['a token with a plus sign', `#token=${'a'.repeat(42)}+`],
    ])('%s shows the LinkInvalid step and sends nothing', async (_label, hash) => {
      const { root, h1s } = await setup(hash);

      expect(h1s()).toEqual(['This Sign-up link does not work']);
      expect(root().querySelector('main.asys-page')).not.toBeNull();
      expect(root().textContent).toContain('Open the Sign-up link again.');

      const link = Array.from(root().querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Sign in instead',
      );

      expect(link?.getAttribute('href')).toBe('/signin');
      expect(link?.classList.contains('asys-button')).toBe(true);
      expect(link?.classList.contains('asys-button--quiet')).toBe(true);
      expect(registerOptions).not.toHaveBeenCalled();
      expect(register).not.toHaveBeenCalled();
    });

    it('accepts base64url characters in a token', async () => {
      const { h1s } = await setup(`#token=${'A-_z09'.repeat(7)}a`);

      expect(h1s()).toEqual(['Sign up']);
    });

    it.each([
      ['a valid token', `#token=${TOKEN}`, false],
      ['an invalid token', '#token=short', false],
      ['a missing token', '#other=1', false],
      ['a valid token while signed in', `#token=${TOKEN}`, true],
    ])('removes the fragment once for %s', async (_label, hash, signedInAlready) => {
      sessionState = signedInAlready ? SessionState.SignedIn : SessionState.SignedOut;
      const { fixture } = await setup(hash);

      await flush(fixture);

      expect(replaceState).toHaveBeenCalledExactlyOnceWith('/signup');
    });

    it('does not touch the address bar without a hash', async () => {
      await setup('');

      expect(replaceState).not.toHaveBeenCalled();
    });

    it('does not ask the router to replace its URL when created outside a navigation', async () => {
      const { toCodes } = await setup();

      await toCodes();

      expect(navigateByUrl).not.toHaveBeenCalledWith('/signup', expect.anything());
    });

    it('replaces the router URL on the first NavigationEnd when it still contains a fragment', async () => {
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'url', 'get').mockReturnValue(`/signup#token=${TOKEN}`);
      const { fixture } = await setup();

      (router.events as Subject<unknown>).next(new NavigationEnd(1, '/signup', '/signup'));
      await flush(fixture);

      expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/signup', { replaceUrl: true });
    });

    it('leaves the router URL alone on NavigationEnd when it has no fragment', async () => {
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'url', 'get').mockReturnValue('/signup');
      const { fixture } = await setup();

      (router.events as Subject<unknown>).next(new NavigationEnd(1, '/signup', '/signup'));
      await flush(fixture);

      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('does not touch the address bar again when moving through the steps', async () => {
      const { toCodes } = await setup();

      await toCodes();

      expect(replaceState).toHaveBeenCalledExactlyOnceWith('/signup');
    });
  });

  describe('focus', () => {
    it('moves to the h1 when the step changes', async () => {
      const { root, button, click, submitName } = await setup();

      await submitName('Ann');

      expect(document.activeElement).toBe(root().querySelector('h1'));
      expect(root().querySelector('h1')?.getAttribute('tabindex')).toBe('-1');

      await click(button('Create passkey'));

      expect(document.activeElement).toBe(root().querySelector('h1'));
      expect(document.activeElement?.textContent?.trim()).toBe('Your recovery codes');
    });
  });

  describe('name step', () => {
    it.each([
      ['a blank name', '', 'Enter your name'],
      ['a whitespace-only name', '   ', 'Enter your name'],
      ['a name of 101 characters', 'a'.repeat(101), 'Use at most 100 characters'],
      ['a name with a NUL', 'An\u0000n', 'Remove the unusual characters'],
      ['a name with an unpaired high surrogate', 'An\uD800n', 'Remove the unusual characters'],
      ['a name with an unpaired low surrogate', 'An\uDC00n', 'Remove the unusual characters'],
    ])('%s shows its message and sends nothing', async (_label, name, message) => {
      const { root, h1s, submitName } = await setup();

      await submitName(name);

      expect(root().textContent).toContain(message);
      expect(h1s()).toEqual(['Sign up']);
      expect(root().textContent).not.toContain('Next, create a passkey');
      expect(registerOptions).not.toHaveBeenCalled();
    });

    it('an empty submit without typing shows the blank message', async () => {
      const { root, button, click } = await setup();

      await click(button('Continue'));

      expect(root().textContent).toContain('Enter your name');
      expect(registerOptions).not.toHaveBeenCalled();
    });

    it('accepts a name of exactly 100 characters', async () => {
      const { root, submitName } = await setup();

      await submitName('a'.repeat(100));

      expect(root().textContent).toContain('Next, create a passkey for');
      expect(registerOptions).toHaveBeenCalledWith(TOKEN, 'a'.repeat(100));
    });

    it('accepts a valid surrogate pair', async () => {
      const { root, submitName } = await setup();

      await submitName('Ann 😀');

      expect(root().textContent).toContain('Next, create a passkey for');
    });

    it('loads no options before Continue, and sends the name untrimmed after it', async () => {
      const { fixture, typeName, button, click } = await setup();

      typeName('  Ann  ');
      await flush(fixture);

      expect(registerOptions).not.toHaveBeenCalled();

      await click(button('Continue'));

      expect(registerOptions).toHaveBeenCalledTimes(1);
      expect(registerOptions).toHaveBeenCalledWith(TOKEN, '  Ann  ');
    });
  });

  describe('passkey step', () => {
    it('shows the Sign up h1, the name and the Create passkey button', async () => {
      const { root, h1s, button, submitName } = await setup();

      await submitName('Ann');

      expect(h1s()).toEqual(['Sign up']);
      expect(root().textContent).toContain('Next, create a passkey for Ann.');
      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(false);
      expect(button('Change name')).toBeDefined();
    });

    it('disables Create passkey until the options are loaded', async () => {
      const pending = defer<AuthResult<BeginOptions>>();

      registerOptions.mockReturnValue(pending.promise);
      const { fixture, button, typeName } = await setup();

      typeName('Ann');
      (button('Continue') as HTMLButtonElement).click();
      await settle(fixture);

      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(true);

      pending.resolve(begin(1));
      await flush(fixture);

      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(false);
    });

    it('disables Create passkey while the ceremony runs', async () => {
      const ceremony = defer<CeremonyResult<RegistrationResponseJSON>>();

      create.mockReturnValue(ceremony.promise);
      const { fixture, button, submitName } = await setup();

      await submitName('Ann');
      (button('Create passkey') as HTMLButtonElement).click();
      await settle(fixture);

      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(true);

      ceremony.resolve(ceremonyFailed(PasskeyFailure.Cancelled));
      await flush(fixture);

      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(false);
    });

    it('disables Create passkey while the register request runs', async () => {
      const finish = defer<AuthResult<RecoveryCodes>>();

      register.mockReturnValue(finish.promise);
      const { fixture, button, submitName } = await setup();

      await submitName('Ann');
      (button('Create passkey') as HTMLButtonElement).click();
      await settle(fixture);

      expect(register).toHaveBeenCalled();
      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(true);

      finish.resolve(registerFailed(AuthError.Unexpected));
      await flush(fixture);

      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(false);
    });

    it('disables Change name and ignores it while the ceremony runs', async () => {
      const ceremony = defer<CeremonyResult<RegistrationResponseJSON>>();

      create.mockReturnValue(ceremony.promise);
      const { fixture, button, h1s, submitName } = await setup();

      await submitName('Ann');
      (button('Create passkey') as HTMLButtonElement).click();
      await settle(fixture);

      const change = button('Change name') as HTMLButtonElement;

      expect(change.disabled).toBe(true);

      change.click();
      await settle(fixture);

      expect(button('Create passkey')).toBeDefined();
      expect(h1s()).toEqual(['Sign up']);

      ceremony.resolve(ceremonyFailed(PasskeyFailure.Cancelled));
      await flush(fixture);

      expect((button('Change name') as HTMLButtonElement).disabled).toBe(false);
    });

    it('disables Change name while the register request runs', async () => {
      const finish = defer<AuthResult<RecoveryCodes>>();

      register.mockReturnValue(finish.promise);
      const { fixture, button, submitName } = await setup();

      await submitName('Ann');
      (button('Create passkey') as HTMLButtonElement).click();
      await settle(fixture);

      expect((button('Change name') as HTMLButtonElement).disabled).toBe(true);

      finish.resolve(registerFailed(AuthError.Unexpected));
      await flush(fixture);
    });

    it('Change name goes back to the Name step and keeps the typed name', async () => {
      const { root, h1s, button, nameInput, submitName, click } = await setup();

      await submitName('  Ann  ');
      await click(button('Change name'));

      expect(h1s()).toEqual(['Sign up']);
      expect(root().textContent).not.toContain('Next, create a passkey');
      expect(nameInput().value).toBe('  Ann  ');
      expect(button('Continue')).toBeDefined();
    });

    it('starts the ceremony with the loaded options', async () => {
      const { button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));

      expect(create).toHaveBeenCalledExactlyOnceWith(optionsOf(1));
    });

    it('Cancelled shows its message and keeps the options', async () => {
      create.mockResolvedValue(ceremonyFailed(PasskeyFailure.Cancelled));
      const { alert, button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));

      expect(alert()?.textContent?.trim()).toBe('Passkey creation was cancelled.');
      expect(register).not.toHaveBeenCalled();
      expect(registerOptions).toHaveBeenCalledTimes(1);
      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(false);

      await click(button('Create passkey'));

      expect(create).toHaveBeenLastCalledWith(optionsOf(1));
    });

    it.each([
      [
        PasskeyFailure.Unsupported,
        'This browser or device cannot create a passkey. Try another browser or device.',
      ],
      [
        PasskeyFailure.Misconfigured,
        'ASYS cannot use passkeys at this address. Open ASYS at its usual address.',
      ],
      [PasskeyFailure.AlreadyRegistered, ALREADY_REGISTERED],
      [PasskeyFailure.Failed, SOMETHING_WENT_WRONG],
    ])('%s shows its message and keeps the options', async (failure, message) => {
      create.mockResolvedValue(ceremonyFailed(failure));
      const { alert, button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));

      expect(alert()?.textContent?.trim()).toBe(message);
      expect(register).not.toHaveBeenCalled();
      expect(registerOptions).toHaveBeenCalledTimes(1);
      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(false);
    });

    it('clears the message when Create passkey is tapped again', async () => {
      create.mockResolvedValueOnce(ceremonyFailed(PasskeyFailure.Unsupported));
      const { fixture, alert, button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));
      expect(alert()).not.toBeNull();

      const ceremony = defer<CeremonyResult<RegistrationResponseJSON>>();

      create.mockReturnValue(ceremony.promise);
      (button('Create passkey') as HTMLButtonElement).click();
      await settle(fixture);

      expect(alert()).toBeNull();

      ceremony.resolve(ceremonyFailed(PasskeyFailure.Cancelled));
      await flush(fixture);
    });
  });

  describe('register', () => {
    it('sends the token, the device zone, the challenge id and the response', async () => {
      const { button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));

      expect(register).toHaveBeenCalledExactlyOnceWith(
        TOKEN,
        'Europe/Amsterdam',
        'challenge-1',
        response,
      );
    });

    it('falls back to UTC when the device zone is undefined', async () => {
      zone.mockReturnValue(undefined);
      const { button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));

      expect(register).toHaveBeenCalledExactlyOnceWith(TOKEN, 'UTC', 'challenge-1', response);
    });

    it('Ok shows the codes, holds the update prompt and records the sign-in without a Me', async () => {
      const { h1s, root, toCodes } = await setup();

      await toCodes();

      expect(h1s()).toEqual(['Your recovery codes']);
      expect(root().querySelector('main.asys-page')).not.toBeNull();
      expect(hold).toHaveBeenCalledTimes(1);
      expect(signedIn).toHaveBeenCalledTimes(1);
      expect(signedIn).toHaveBeenCalledWith();
      expect(release).not.toHaveBeenCalled();
    });

    it('Ok holds the update prompt before it records the sign-in', async () => {
      let holdsWhenSignedIn = -1;

      signedIn.mockImplementation(() => {
        holdsWhenSignedIn = hold.mock.calls.length;

        return Promise.resolve();
      });
      const { toCodes } = await setup();

      await toCodes();

      expect(holdsWhenSignedIn).toBe(1);
    });

    it('Ok never loads options again', async () => {
      const { fixture, toCodes } = await setup();

      await toCodes();
      await flush(fixture);
      await flush(fixture);

      expect(registerOptions).toHaveBeenCalledTimes(1);
      expect(register).toHaveBeenCalledTimes(1);
    });

    it('Ok does not navigate by itself', async () => {
      const { toCodes } = await setup();

      await toCodes();

      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it.each([
      [AuthError.ChallengeInvalid, 'Try again.'],
      [AuthError.VerificationFailed, 'Try again.'],
      [AuthError.AlreadyRegistered, ALREADY_REGISTERED],
      [AuthError.Network, SOMETHING_WENT_WRONG],
      [AuthError.Unexpected, SOMETHING_WENT_WRONG],
    ])('%s shows its message and refetches the options once', async (error, message) => {
      register.mockResolvedValue(registerFailed(error));
      const { h1s, alert, button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));

      expect(alert()?.textContent?.trim()).toBe(message);
      expect(h1s()).toEqual(['Sign up']);
      expect(registerOptions).toHaveBeenCalledTimes(2);
      expect(register).toHaveBeenCalledTimes(1);
      expect(hold).not.toHaveBeenCalled();
      expect(signedIn).not.toHaveBeenCalled();
      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(false);
    });

    it('uses the refetched options for the next attempt', async () => {
      register.mockResolvedValueOnce(registerFailed(AuthError.VerificationFailed));
      const { button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));
      await click(button('Create passkey'));

      expect(create).toHaveBeenNthCalledWith(1, optionsOf(1));
      expect(create).toHaveBeenNthCalledWith(2, optionsOf(2));
      expect(register).toHaveBeenLastCalledWith(TOKEN, 'Europe/Amsterdam', 'challenge-2', response);
    });

    it('SignUpLinkInvalid shows the LinkInvalid step with the Sign in link', async () => {
      register.mockResolvedValue(registerFailed(AuthError.SignUpLinkInvalid));
      const { root, h1s, button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Create passkey'));

      expect(h1s()).toEqual(['This Sign-up link does not work']);
      expect(root().textContent).toContain('Open the Sign-up link again.');

      const link = Array.from(root().querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Sign in instead',
      );

      expect(link?.getAttribute('href')).toBe('/signin');
      expect(link?.classList.contains('asys-button')).toBe(true);
      expect(link?.classList.contains('asys-button--quiet')).toBe(true);
      expect(hold).not.toHaveBeenCalled();
    });
  });

  describe('options failed to load', () => {
    it('SignUpLinkInvalid shows the LinkInvalid step', async () => {
      registerOptions.mockResolvedValue({
        _tag: AuthResultTag.Failed,
        error: AuthError.SignUpLinkInvalid,
      });
      const { h1s, submitName } = await setup();

      await submitName('Ann');

      expect(h1s()).toEqual(['This Sign-up link does not work']);
      expect(create).not.toHaveBeenCalled();
    });

    it('another error shows the message and a Try again button, without looping', async () => {
      registerOptions.mockResolvedValueOnce({
        _tag: AuthResultTag.Failed,
        error: AuthError.Network,
      });
      const { fixture, root, button, submitName } = await setup();

      await submitName('Ann');
      await flush(fixture);
      await flush(fixture);

      expect(root().textContent).toContain(SOMETHING_WENT_WRONG);
      expect(button('Try again')).toBeDefined();
      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(true);
      expect(registerOptions).toHaveBeenCalledTimes(1);
    });

    it('Try again loads new options', async () => {
      registerOptions.mockResolvedValueOnce({
        _tag: AuthResultTag.Failed,
        error: AuthError.Unexpected,
      });
      const { root, button, submitName, click } = await setup();

      await submitName('Ann');
      await click(button('Try again'));

      expect(registerOptions).toHaveBeenCalledTimes(2);
      expect(registerOptions).toHaveBeenLastCalledWith(TOKEN, 'Ann');
      expect((button('Create passkey') as HTMLButtonElement).disabled).toBe(false);
      expect(button('Try again')).toBeUndefined();
      expect(root().textContent).not.toContain(SOMETHING_WENT_WRONG);
    });

    it('shows no Try again button when the options loaded', async () => {
      const { button, submitName } = await setup();

      await submitName('Ann');

      expect(button('Try again')).toBeUndefined();
    });
  });

  describe('codes step', () => {
    it('lists the codes in order in an ordered list with asys-num', async () => {
      const { root, toCodes } = await setup();

      await toCodes();

      const list = root().querySelector('ol.asys-num');
      const items = Array.from(list?.querySelectorAll('li') ?? []).map((li) =>
        li.textContent?.trim(),
      );

      expect(items).toEqual(CODES);
      expect(root().textContent).toContain(
        'These codes are shown only now. Keep them somewhere safe.',
      );
    });

    it('shows no status message at first', async () => {
      const { status, toCodes } = await setup();

      await toCodes();

      expect(status()?.textContent?.trim() ?? '').toBe('');
    });

    it('Copy writes the codes joined by newlines and shows Copied.', async () => {
      const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);

      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
      const { status, button, toCodes, click } = await setup();

      await toCodes();
      await click(button('Copy'));

      expect(writeText).toHaveBeenCalledExactlyOnceWith(CODES.join('\n'));
      expect(status()?.textContent?.trim()).toBe('Copied.');
    });

    it('Copy shows the failure text when the write is rejected', async () => {
      const writeText = vi
        .fn<(text: string) => Promise<void>>()
        .mockRejectedValue(new Error('denied'));

      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
      const { status, button, toCodes, click } = await setup();

      await toCodes();
      await click(button('Copy'));

      expect(status()?.textContent?.trim()).toBe('Could not copy. Select the codes instead.');
    });

    it('Continue waits for the recorded sign-in before navigating to /now', async () => {
      const recorded = defer<void>();

      signedIn.mockReturnValue(recorded.promise);
      const { fixture, button, toCodes, click } = await setup();

      await toCodes();
      await click(button('Continue'));

      expect(navigateByUrl).not.toHaveBeenCalled();

      recorded.resolve();
      await flush(fixture);

      expect(navigateByUrl).toHaveBeenCalledExactlyOnceWith('/now');
      expect(signedIn).toHaveBeenCalledTimes(1);
    });
  });

  describe('destroy', () => {
    it('destroyed while register is pending and then Ok: only records the sign-in', async () => {
      const finish = defer<AuthResult<RecoveryCodes>>();

      register.mockReturnValue(finish.promise);
      const { fixture, button, submitName } = await setup();

      await submitName('Ann');
      (button('Create passkey') as HTMLButtonElement).click();
      await settle(fixture);
      fixture.destroy();

      finish.resolve(registered);
      await new Promise<void>((resolve) => setTimeout(resolve));

      expect(hold).not.toHaveBeenCalled();
      expect(release).not.toHaveBeenCalled();
      expect(signedIn).toHaveBeenCalledTimes(1);
    });

    it('destroyed while the ceremony is pending: nothing is registered or held', async () => {
      const ceremony = defer<CeremonyResult<RegistrationResponseJSON>>();

      create.mockReturnValue(ceremony.promise);
      const { fixture, button, submitName } = await setup();

      await submitName('Ann');
      (button('Create passkey') as HTMLButtonElement).click();
      await settle(fixture);
      fixture.destroy();

      ceremony.resolve(ceremonyOk);
      await new Promise<void>((resolve) => setTimeout(resolve));

      expect(register).not.toHaveBeenCalled();
      expect(hold).not.toHaveBeenCalled();
      expect(signedIn).not.toHaveBeenCalled();
    });

    it('releases the update hold once', async () => {
      const { fixture, toCodes } = await setup();

      await toCodes();
      fixture.destroy();

      expect(release).toHaveBeenCalledTimes(1);
      expect(hold).toHaveBeenCalledTimes(1);
    });

    it('does not release when nothing was held (Name step)', async () => {
      const { fixture } = await setup();

      fixture.destroy();

      expect(release).not.toHaveBeenCalled();
    });

    it('does not release when nothing was held (Passkey step)', async () => {
      const { fixture, submitName } = await setup();

      await submitName('Ann');
      fixture.destroy();

      expect(release).not.toHaveBeenCalled();
    });

    it('does not release when nothing was held (LinkInvalid step)', async () => {
      const { fixture } = await setup('');

      fixture.destroy();

      expect(release).not.toHaveBeenCalled();
    });
  });
});
