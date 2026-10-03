// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';

import {
  AuthApi,
  AuthError,
  AuthResultTag,
  type AuthResult,
  type RecoverResult,
} from '../../core/api/auth-api';
import { Session } from '../../core/auth/session';
import { Recover } from './recover';

const okResult: AuthResult<RecoverResult> = {
  _tag: AuthResultTag.Ok,
  value: { recoveryCodesLeft: 3 },
};

const failed = (error: AuthError): AuthResult<RecoverResult> => ({
  _tag: AuthResultTag.Failed,
  error,
});

describe('Recover', () => {
  let recover: ReturnType<typeof vi.fn<(code: string) => Promise<AuthResult<RecoverResult>>>>;
  let signedIn: ReturnType<typeof vi.fn<(me?: unknown) => Promise<void>>>;
  let navigateByUrl: ReturnType<typeof vi.spyOn>;

  const setup = async () => {
    const fixture = TestBed.createComponent(Recover);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();

    const root = (): HTMLElement => fixture.nativeElement;
    const input = (): HTMLInputElement => root().querySelector('input') as HTMLInputElement;
    const error = (): string | undefined =>
      root().querySelector('p.asys-field__error')?.textContent?.replace(/\s+/g, ' ').trim();
    const type = async (value: string): Promise<void> => {
      input().value = value;
      input().dispatchEvent(new Event('input'));
      input().dispatchEvent(new Event('blur'));
      await fixture.whenStable();
    };
    const submit = async (): Promise<void> => {
      root()
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
    };

    return { fixture, root, input, error, type, submit };
  };

  beforeEach(() => {
    recover = vi
      .fn<(code: string) => Promise<AuthResult<RecoverResult>>>()
      .mockResolvedValue(okResult);
    signedIn = vi.fn<(me?: unknown) => Promise<void>>().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([], withComponentInputBinding()),
        { provide: AuthApi, useValue: { recover } },
        { provide: Session, useValue: { signedIn } },
      ],
    });
    navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('rendering', () => {
    it('renders the heading inside main.asys-page', async () => {
      const { root } = await setup();

      expect(root().querySelector('main.asys-page h1')?.textContent?.trim()).toBe(
        'Use a recovery code',
      );
    });

    it('renders the labelled field with its hint', async () => {
      const { root, input } = await setup();

      const label = root().querySelector('label') as HTMLLabelElement;

      expect(label.textContent?.trim()).toBe('Recovery code');
      expect(label.getAttribute('for')).toBe(input().id);
      expect(root().textContent).toContain('One of the codes you saved when you signed up.');
    });

    it('turns off autocomplete, spellcheck and auto-capitalisation on the input', async () => {
      const { input } = await setup();

      expect(input().getAttribute('autocomplete')).toBe('off');
      expect(input().getAttribute('spellcheck')).toBe('false');
      expect(input().getAttribute('autocapitalize')).toBe('none');
    });

    it('renders a submit button and a link back to the passkey screen', async () => {
      const { root } = await setup();

      const submitButton = root().querySelector('form button[type="submit"]');
      const link = Array.from(root().querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'Sign in with a passkey instead',
      );

      expect(submitButton?.textContent?.trim()).toBe('Sign in');
      expect(link?.getAttribute('href')).toBe('/signin');
      expect(link?.classList.contains('asys-button')).toBe(true);
      expect(link?.classList.contains('asys-button--quiet')).toBe(true);
    });

    it('shows no error at first', async () => {
      const { error } = await setup();

      expect(error()).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('shows "Enter a recovery code" for an empty submit and sends nothing', async () => {
      const { error, submit } = await setup();

      await submit();

      expect(error()).toBe('Error: Enter a recovery code');
      expect(recover).not.toHaveBeenCalled();
      expect(signedIn).not.toHaveBeenCalled();
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only code as empty', async () => {
      const { error, type, submit } = await setup();

      await type('   ');
      await submit();

      expect(error()).toBe('Error: Enter a recovery code');
      expect(recover).not.toHaveBeenCalled();
    });

    it('shows "Use at most 64 characters" for 65 characters and sends nothing', async () => {
      const { error, type, submit } = await setup();

      await type('a'.repeat(65));
      await submit();

      expect(error()).toBe('Error: Use at most 64 characters');
      expect(recover).not.toHaveBeenCalled();
    });

    it('accepts exactly 64 characters', async () => {
      const { type, submit } = await setup();

      await type('a'.repeat(64));
      await submit();

      expect(recover).toHaveBeenCalledWith('a'.repeat(64));
    });

    it('focuses the code field on an invalid submit', async () => {
      const { input, submit } = await setup();

      await submit();

      expect(document.activeElement).toBe(input());
    });

    it('clears the error once the code is valid', async () => {
      const { error, type, submit } = await setup();
      await submit();

      await type('abcd');

      expect(error()).toBeUndefined();
    });
  });

  describe('submitting', () => {
    it('sends the code exactly as typed', async () => {
      const { type, submit } = await setup();

      await type('  ab-CD 12 ');
      await submit();

      expect(recover).toHaveBeenCalledTimes(1);
      expect(recover).toHaveBeenCalledWith('  ab-CD 12 ');
    });

    it('submits when the submit button is clicked', async () => {
      const { root, type, fixture } = await setup();

      await type('abcd-efgh');
      (root().querySelector('button[type="submit"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(recover).toHaveBeenCalledWith('abcd-efgh');
    });

    it('Ok checks the session without a Me, then navigates to /recovered', async () => {
      let resolveSignedIn: () => void = () => undefined;
      signedIn.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSignedIn = resolve;
        }),
      );
      const { fixture, type, submit } = await setup();

      await type('abcd-efgh');
      await submit();

      expect(signedIn).toHaveBeenCalledTimes(1);
      expect(signedIn).toHaveBeenCalledWith();
      expect(navigateByUrl).not.toHaveBeenCalled();

      resolveSignedIn();
      await fixture.whenStable();

      expect(navigateByUrl).toHaveBeenCalledTimes(1);
      expect(navigateByUrl).toHaveBeenCalledWith('/recovered');
    });

    it('SignInFailed shows "That recovery code did not work" in the field error markup', async () => {
      recover.mockResolvedValue(failed(AuthError.SignInFailed));
      const { root, error, type, submit } = await setup();

      await type('wrong-code');
      await submit();

      expect(error()).toBe('Error: That recovery code did not work');
      expect(root().querySelector('span.asys-field__error-word')?.textContent).toBe('Error:');
      expect(signedIn).not.toHaveBeenCalled();
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('SignInFailed focuses the code field', async () => {
      recover.mockResolvedValue(failed(AuthError.SignInFailed));
      const { input, type, submit } = await setup();
      await type('wrong-code');
      (document.activeElement as HTMLElement | null)?.blur();

      await submit();

      expect(document.activeElement).toBe(input());
    });

    it('SignInFailed focuses the code field once, after the error has rendered', async () => {
      recover.mockResolvedValue(failed(AuthError.SignInFailed));
      const { input, type, submit } = await setup();
      await type('wrong-code');
      (document.activeElement as HTMLElement | null)?.blur();
      const atFocus: { describedBy: string | null; target: string | undefined }[] = [];

      input().addEventListener('focus', () => {
        const id = input().getAttribute('aria-describedby');
        const target = id === null ? null : document.getElementById(id);

        atFocus.push({
          describedBy: id,
          target: target?.classList.contains('asys-field__error')
            ? target.textContent?.replace(/\s+/g, ' ').trim()
            : undefined,
        });
      });

      await submit();

      expect(atFocus).toEqual([
        { describedBy: expect.any(String), target: 'Error: That recovery code did not work' },
      ]);
    });

    it.each([AuthError.Network, AuthError.Unexpected, AuthError.Unauthorized])(
      '%s shows "Something went wrong. Try again." in the field error markup',
      async (authError) => {
        recover.mockResolvedValue(failed(authError));
        const { error, type, submit } = await setup();

        await type('abcd-efgh');
        await submit();

        expect(error()).toBe('Error: Something went wrong. Try again.');
        expect(signedIn).not.toHaveBeenCalled();
        expect(navigateByUrl).not.toHaveBeenCalled();
      },
    );
  });
});
