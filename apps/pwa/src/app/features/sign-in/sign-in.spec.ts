// SPDX-License-Identifier: EUPL-1.2
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import {
  CeremonyResultTag,
  PasskeyFailure,
  type CeremonyResult,
} from '@ionaru/effect-passkeys/client';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

import {
  AuthApi,
  AuthError,
  AuthResultTag,
  type AuthResult,
  type CeremonyOptions,
  type Me,
} from '../../core/api/auth-api';
import { PasskeyCeremony } from '../../core/api/passkey-ceremony';
import { Session } from '../../core/auth/session';
import { OPTIONS_MAX_AGE_MS } from '../auth/ceremony-options';
import { SignIn } from './sign-in';

type BeginOptions = CeremonyOptions<PublicKeyCredentialRequestOptionsJSON>;

const ada: Me = { name: 'Ada', recoveryCodesLeft: 4 };

const response = { id: 'credential-1' } as unknown as AuthenticationResponseJSON;

const begin = (n: number): AuthResult<BeginOptions> => ({
  _tag: AuthResultTag.Ok,
  value: {
    challengeId: `challenge-${n}`,
    options: { challenge: `challenge-bytes-${n}` } as PublicKeyCredentialRequestOptionsJSON,
  },
});

const optionsOf = (n: number): PublicKeyCredentialRequestOptionsJSON =>
  ({ challenge: `challenge-bytes-${n}` }) as PublicKeyCredentialRequestOptionsJSON;

const ceremonyOk: CeremonyResult<AuthenticationResponseJSON> = {
  _tag: CeremonyResultTag.Ok,
  response,
};

const ceremonyFailed = (failure: PasskeyFailure): CeremonyResult<AuthenticationResponseJSON> => ({
  _tag: CeremonyResultTag.Failed,
  failure,
  cause: new Error('cause'),
});

const authFailed = (error: AuthError): AuthResult<Me> => ({ _tag: AuthResultTag.Failed, error });

const SOMETHING_WENT_WRONG = 'Something went wrong. Try again.';

const setVisibility = (state: 'visible' | 'hidden'): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
};

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

describe('SignIn', () => {
  let authenticateOptions: ReturnType<typeof vi.fn<() => Promise<AuthResult<BeginOptions>>>>;
  let authenticate: ReturnType<
    typeof vi.fn<
      (challengeId: string, response: AuthenticationResponseJSON) => Promise<AuthResult<Me>>
    >
  >;
  let use: ReturnType<
    typeof vi.fn<
      (
        options: PublicKeyCredentialRequestOptionsJSON,
      ) => Promise<CeremonyResult<AuthenticationResponseJSON>>
    >
  >;
  let signedIn: ReturnType<typeof vi.fn<(me?: Me) => Promise<void>>>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;
  let fake = false;

  const advance = async (ms: number): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
  };

  const flush = async (fixture: ComponentFixture<SignIn>): Promise<void> => {
    if (fake) {
      await vi.advanceTimersByTimeAsync(0);
      TestBed.tick();
      await vi.advanceTimersByTimeAsync(0);
    } else {
      for (let round = 0; round < 3; round += 1) {
        TestBed.tick();
        await fixture.whenStable();
        await new Promise<void>((resolve) => setTimeout(resolve));
        fixture.detectChanges();
      }
    }
  };

  const setup = async (returnUrl?: string, waitForOptions = true) => {
    const fixture = TestBed.createComponent(SignIn);

    if (returnUrl !== undefined) {
      fixture.componentRef.setInput('returnUrl', returnUrl);
    }

    if (waitForOptions) {
      await flush(fixture);
    } else {
      fixture.detectChanges();
    }

    const root = (): HTMLElement => fixture.nativeElement;
    const button = (text: string): HTMLButtonElement | undefined =>
      Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
    const signInButton = (): HTMLButtonElement =>
      button('Sign in with passkey') as HTMLButtonElement;
    const alert = (): HTMLElement | null => root().querySelector('p[role="alert"]');
    const click = async (target: HTMLButtonElement): Promise<void> => {
      target.click();
      await flush(fixture);
    };

    return { fixture, root, button, signInButton, alert, click };
  };

  beforeEach(() => {
    fake = false;
    setVisibility('visible');
    let n = 0;
    authenticateOptions = vi
      .fn<() => Promise<AuthResult<BeginOptions>>>()
      .mockImplementation(() => {
        n += 1;

        return Promise.resolve(begin(n));
      });
    authenticate = vi
      .fn<(challengeId: string, response: AuthenticationResponseJSON) => Promise<AuthResult<Me>>>()
      .mockResolvedValue({ _tag: AuthResultTag.Ok, value: ada });
    use = vi
      .fn<
        (
          options: PublicKeyCredentialRequestOptionsJSON,
        ) => Promise<CeremonyResult<AuthenticationResponseJSON>>
      >()
      .mockResolvedValue(ceremonyOk);
    signedIn = vi.fn<(me?: Me) => Promise<void>>().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([], withComponentInputBinding()),
        { provide: AuthApi, useValue: { authenticateOptions, authenticate } },
        { provide: PasskeyCeremony, useValue: { use, supported: () => true } },
        { provide: Session, useValue: { signedIn } },
      ],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('rendering', () => {
    it('renders the copy inside main.asys-page', async () => {
      const { root } = await setup();

      expect(root().querySelector('main.asys-page h1')?.textContent?.trim()).toBe('Sign in');
      expect(root().textContent).toContain('Use the passkey you made for ASYS.');
    });

    it('links to the recovery code screen', async () => {
      const { root } = await setup();

      const link = Array.from(root().querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Use a recovery code',
      );

      expect(link?.getAttribute('href')).toBe('/recover');
      expect(link?.classList.contains('asys-button')).toBe(true);
      expect(link?.classList.contains('asys-button--quiet')).toBe(true);
    });

    it('shows no message at first', async () => {
      const { alert } = await setup();

      expect(alert()).toBeNull();
    });
  });

  describe('button state', () => {
    it('is disabled until the options are loaded', async () => {
      const pending = defer<AuthResult<BeginOptions>>();
      authenticateOptions.mockReturnValue(pending.promise);
      const { fixture, signInButton } = await setup(undefined, false);

      expect(signInButton().disabled).toBe(true);

      pending.resolve(begin(1));
      await flush(fixture);

      expect(signInButton().disabled).toBe(false);
    });

    it('is disabled while an attempt is running', async () => {
      const ceremony = defer<CeremonyResult<AuthenticationResponseJSON>>();
      use.mockReturnValue(ceremony.promise);
      const { fixture, signInButton } = await setup();

      signInButton().click();
      fixture.detectChanges();
      await Promise.resolve();

      expect(signInButton().disabled).toBe(true);

      ceremony.resolve(ceremonyFailed(PasskeyFailure.Cancelled));
      await flush(fixture);

      expect(signInButton().disabled).toBe(false);
    });

    it('is disabled while the authenticate request is running', async () => {
      const finish = defer<AuthResult<Me>>();
      authenticate.mockReturnValue(finish.promise);
      const { fixture, signInButton } = await setup();

      signInButton().click();
      fixture.detectChanges();
      await Promise.resolve();
      await Promise.resolve();

      expect(authenticate).toHaveBeenCalled();
      expect(signInButton().disabled).toBe(true);

      finish.resolve(authFailed(AuthError.Unexpected));
      await flush(fixture);

      expect(signInButton().disabled).toBe(false);
    });
  });

  describe('ceremony', () => {
    it('is started with the loaded options', async () => {
      const { signInButton, click } = await setup();

      await click(signInButton());

      expect(use).toHaveBeenCalledTimes(1);
      expect(use).toHaveBeenCalledWith(optionsOf(1));
    });

    it('Cancelled shows no message, keeps the options and enables the button again', async () => {
      use.mockResolvedValue(ceremonyFailed(PasskeyFailure.Cancelled));
      const { signInButton, alert, click } = await setup();

      await click(signInButton());

      expect(alert()).toBeNull();
      expect(authenticate).not.toHaveBeenCalled();
      expect(authenticateOptions).toHaveBeenCalledTimes(1);
      expect(signInButton().disabled).toBe(false);

      await click(signInButton());

      expect(use).toHaveBeenLastCalledWith(optionsOf(1));
    });

    it.each([
      [
        PasskeyFailure.Unsupported,
        'This browser or device cannot use passkeys. Use a recovery code instead.',
      ],
      [
        PasskeyFailure.Misconfigured,
        'ASYS cannot use passkeys at this address. Open ASYS at its usual address.',
      ],
      [PasskeyFailure.Failed, SOMETHING_WENT_WRONG],
      [PasskeyFailure.AlreadyRegistered, SOMETHING_WENT_WRONG],
    ])('%s shows its message and keeps the options', async (failure, message) => {
      use.mockResolvedValue(ceremonyFailed(failure));
      const { signInButton, alert, click } = await setup();

      await click(signInButton());

      expect(alert()?.textContent?.trim()).toBe(message);
      expect(authenticate).not.toHaveBeenCalled();
      expect(authenticateOptions).toHaveBeenCalledTimes(1);
      expect(signInButton().disabled).toBe(false);
    });

    it('clears the message when the button is clicked again', async () => {
      use.mockResolvedValueOnce(ceremonyFailed(PasskeyFailure.Unsupported));
      use.mockResolvedValueOnce(ceremonyFailed(PasskeyFailure.Cancelled));
      const { signInButton, alert, click } = await setup();

      await click(signInButton());
      expect(alert()).not.toBeNull();

      await click(signInButton());

      expect(alert()).toBeNull();
    });
  });

  describe('authenticate', () => {
    it('sends the challenge id of the options and the ceremony response', async () => {
      const { signInButton, click } = await setup();

      await click(signInButton());

      expect(authenticate).toHaveBeenCalledWith('challenge-1', response);
    });

    it('Ok records the sign-in with the Me before navigating, and does not discard', async () => {
      const recorded = defer<void>();
      signedIn.mockReturnValue(recorded.promise);
      const { fixture, signInButton, click } = await setup();

      await click(signInButton());

      expect(signedIn).toHaveBeenCalledWith(ada);
      expect(navigateByUrl).not.toHaveBeenCalled();

      recorded.resolve();
      await flush(fixture);

      expect(navigateByUrl).toHaveBeenCalledTimes(1);
      expect(authenticateOptions).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['/capture?text=hi', '/capture?text=hi'],
      ['//evil.com', '/now'],
      ['/signin', '/now'],
      [undefined, '/now'],
    ])('Ok navigates for returnUrl %s to %s', async (returnUrl, target) => {
      const { signInButton, click } = await setup(returnUrl);

      await click(signInButton());

      expect(navigateByUrl).toHaveBeenCalledWith(target);
    });

    it.each([
      [AuthError.ChallengeInvalid, 'Try again.'],
      [AuthError.VerificationFailed, 'Try again.'],
      [AuthError.UnknownCredential, 'This passkey is not known to ASYS.'],
      [AuthError.Network, SOMETHING_WENT_WRONG],
      [AuthError.Unexpected, SOMETHING_WENT_WRONG],
      [AuthError.SignInFailed, SOMETHING_WENT_WRONG],
    ])(
      '%s shows its message, discards the options and does not navigate',
      async (error, message) => {
        authenticate.mockResolvedValue(authFailed(error));
        const { signInButton, alert, click } = await setup();

        await click(signInButton());

        expect(alert()?.textContent?.trim()).toBe(message);
        expect(authenticateOptions).toHaveBeenCalledTimes(2);
        expect(signedIn).not.toHaveBeenCalled();
        expect(navigateByUrl).not.toHaveBeenCalled();
        expect(signInButton().disabled).toBe(false);
      },
    );

    it('uses the refetched options for the next attempt', async () => {
      authenticate.mockResolvedValueOnce(authFailed(AuthError.VerificationFailed));
      const { signInButton, click } = await setup();

      await click(signInButton());
      await click(signInButton());

      expect(use).toHaveBeenNthCalledWith(1, optionsOf(1));
      expect(use).toHaveBeenNthCalledWith(2, optionsOf(2));
      expect(authenticate).toHaveBeenLastCalledWith('challenge-2', response);
    });
  });

  describe('options failed to load', () => {
    it('shows the message and a Try again button, with the sign-in button disabled', async () => {
      authenticateOptions.mockResolvedValueOnce({
        _tag: AuthResultTag.Failed,
        error: AuthError.Network,
      });
      const { root, button, signInButton } = await setup();

      expect(root().textContent).toContain(SOMETHING_WENT_WRONG);
      expect(button('Try again')).toBeDefined();
      expect(button('Try again')?.querySelector('svg[data-icon="rotate-right"]')).not.toBeNull();
      expect(signInButton().disabled).toBe(true);
    });

    it('Try again loads new options', async () => {
      authenticateOptions.mockResolvedValueOnce({
        _tag: AuthResultTag.Failed,
        error: AuthError.Network,
      });
      const { root, button, signInButton, click } = await setup();

      await click(button('Try again') as HTMLButtonElement);

      expect(authenticateOptions).toHaveBeenCalledTimes(2);
      expect(signInButton().disabled).toBe(false);
      expect(root().textContent).not.toContain(SOMETHING_WENT_WRONG);
      expect(button('Try again')).toBeUndefined();
    });

    it('shows no Try again button when the options loaded', async () => {
      const { button } = await setup();

      expect(button('Try again')).toBeUndefined();
    });
  });

  describe('options age', () => {
    beforeEach(() => {
      fake = true;
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-03T09:00:00Z'));
    });

    it('refetches at 4 minutes, not before', async () => {
      await setup();

      await advance(OPTIONS_MAX_AGE_MS - 1);
      expect(authenticateOptions).toHaveBeenCalledTimes(1);

      await advance(1);
      expect(authenticateOptions).toHaveBeenCalledTimes(2);
    });

    it('refetches on online once 4 minutes old', async () => {
      await setup();

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS - 1);
      window.dispatchEvent(new Event('online'));
      await advance(0);
      expect(authenticateOptions).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 1);
      window.dispatchEvent(new Event('online'));
      await advance(0);
      expect(authenticateOptions).toHaveBeenCalledTimes(2);
    });

    it('refetches on visibilitychange to visible once 4 minutes old', async () => {
      await setup();

      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS - 1);
      document.dispatchEvent(new Event('visibilitychange'));
      await advance(0);
      expect(authenticateOptions).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 1);
      document.dispatchEvent(new Event('visibilitychange'));
      await advance(0);
      expect(authenticateOptions).toHaveBeenCalledTimes(2);
    });

    it('does not refetch after the component is destroyed', async () => {
      const { fixture } = await setup();

      fixture.destroy();
      vi.setSystemTime(Date.now() + OPTIONS_MAX_AGE_MS);
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await advance(OPTIONS_MAX_AGE_MS * 2);

      expect(authenticateOptions).toHaveBeenCalledTimes(1);
    });
  });
});
