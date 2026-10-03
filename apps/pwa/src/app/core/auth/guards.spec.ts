// SPDX-License-Identifier: EUPL-1.2
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideRouter,
  Router,
  UrlTree,
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  type RouterStateSnapshot,
} from '@angular/router';

import { signedInGuard, signedOutGuard } from './guards';
import { Session, SessionState } from './session';

describe('guards', () => {
  let state: WritableSignal<SessionState>;
  let check: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let router: Router;

  beforeEach(() => {
    state = signal(SessionState.Unknown);
    check = vi.fn<() => Promise<void>>();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Session, useValue: { state, check } }],
    });
    router = TestBed.inject(Router);
  });

  const run = async (guard: CanActivateFn, url: string): Promise<boolean | string> => {
    const result = await TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    );

    if (result instanceof UrlTree) {
      return router.serializeUrl(result);
    }

    return result as boolean;
  };

  describe('signedInGuard', () => {
    it.each([SessionState.SignedIn, SessionState.Unreachable])('allows %s', async (value) => {
      state.set(value);

      expect(await run(signedInGuard, '/capture')).toBe(true);
      expect(check).not.toHaveBeenCalled();
    });

    it('redirects SignedOut to /signin with the encoded returnUrl', async () => {
      state.set(SessionState.SignedOut);

      expect(await run(signedInGuard, '/capture?text=hi')).toBe(
        '/signin?returnUrl=%2Fcapture%3Ftext%3Dhi',
      );
      expect(check).not.toHaveBeenCalled();
    });

    it.each([
      [SessionState.SignedIn, true],
      [SessionState.Unreachable, true],
      [SessionState.SignedOut, '/signin?returnUrl=%2Fnow'],
    ])('Unknown awaits check, then decides on %s', async (after, expected) => {
      check.mockImplementation(() => {
        state.set(after);

        return Promise.resolve();
      });

      expect(await run(signedInGuard, '/now')).toBe(expected);
      expect(check).toHaveBeenCalledTimes(1);
    });
  });

  describe('signedOutGuard', () => {
    it.each([SessionState.SignedOut, SessionState.Unreachable])('allows %s', async (value) => {
      state.set(value);

      expect(await run(signedOutGuard, '/signin')).toBe(true);
      expect(check).not.toHaveBeenCalled();
    });

    it('redirects SignedIn to /now', async () => {
      state.set(SessionState.SignedIn);

      expect(await run(signedOutGuard, '/signin')).toBe('/now');
    });

    it.each(['/signup', '/signup?token=abc', '/signup#x', '/signup?token=abc#x'])(
      'lets SignedIn through on %s',
      async (url) => {
        state.set(SessionState.SignedIn);

        expect(await run(signedOutGuard, url)).toBe(true);
      },
    );

    it('redirects SignedIn from a path that only starts with /signup', async () => {
      state.set(SessionState.SignedIn);

      expect(await run(signedOutGuard, '/signups')).toBe('/now');
    });

    it.each([
      [SessionState.SignedIn, '/now'],
      [SessionState.SignedOut, true],
      [SessionState.Unreachable, true],
    ])('Unknown awaits check, then decides on %s', async (after, expected) => {
      check.mockImplementation(() => {
        state.set(after);

        return Promise.resolve();
      });

      expect(await run(signedOutGuard, '/signin')).toBe(expected);
      expect(check).toHaveBeenCalledTimes(1);
    });

    it('Unknown then SignedIn still allows /signup', async () => {
      check.mockImplementation(() => {
        state.set(SessionState.SignedIn);

        return Promise.resolve();
      });

      expect(await run(signedOutGuard, '/signup?token=abc')).toBe(true);
    });
  });
});
