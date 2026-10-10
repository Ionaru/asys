// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';

import { AuthApi, AuthError, AuthResultTag, type AuthResult, type Me } from '../api/auth-api';
import { ReportedZone } from '../platform/reported-zone';
import { SESSION_CHECK_TIMEOUT_MS, Session, SessionState, SignOutReason } from './session';

const ada: Me = { name: 'Ada', recoveryCodesLeft: 4 };

const grace: Me = { name: 'Grace', recoveryCodesLeft: 2 };

const ok = (value: Me): AuthResult<Me> => ({ _tag: AuthResultTag.Ok, value });

const failed = (error: AuthError): AuthResult<Me> => ({ _tag: AuthResultTag.Failed, error });

interface Deferred {
  readonly promise: Promise<AuthResult<Me>>;
  readonly resolve: (result: AuthResult<Me>) => void;
}

const defer = (): Deferred => {
  let resolve: (result: AuthResult<Me>) => void = () => undefined;
  const promise = new Promise<AuthResult<Me>>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

describe('Session', () => {
  let me: ReturnType<typeof vi.fn<() => Promise<AuthResult<Me>>>>;
  let get: ReturnType<typeof vi.fn<() => string | null>>;
  let set: ReturnType<typeof vi.fn<(zone: string) => void>>;
  let clear: ReturnType<typeof vi.fn<() => void>>;
  let session: Session;

  beforeEach(() => {
    me = vi.fn<() => Promise<AuthResult<Me>>>();
    get = vi.fn<() => string | null>();
    set = vi.fn<(zone: string) => void>();
    clear = vi.fn<() => void>();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthApi, useValue: { me } },
        { provide: ReportedZone, useValue: { get, set, clear } },
      ],
    });
    session = TestBed.inject(Session);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('starts Unknown with no Me and no sign-out reason', () => {
    expect(session.state()).toBe(SessionState.Unknown);
    expect(session.me()).toBeNull();
    expect(session.signOutReason()).toBeNull();
  });

  it('exposes the documented timeout', () => {
    expect(SESSION_CHECK_TIMEOUT_MS).toBe(10_000);
  });

  describe('check', () => {
    it('Ok becomes SignedIn with the Me', async () => {
      me.mockResolvedValue(ok(ada));

      await session.check();

      expect(session.state()).toBe(SessionState.SignedIn);
      expect(session.me()).toEqual(ada);
    });

    it('Unauthorized becomes SignedOut and clears the Me', async () => {
      me.mockResolvedValueOnce(ok(ada));
      await session.check();
      me.mockResolvedValueOnce(failed(AuthError.Unauthorized));

      await session.check();

      expect(session.state()).toBe(SessionState.SignedOut);
      expect(session.me()).toBeNull();
    });

    it('Unauthorized records Revoked', async () => {
      me.mockResolvedValueOnce(ok(ada));
      await session.check();
      me.mockResolvedValueOnce(failed(AuthError.Unauthorized));

      await session.check();

      expect(session.signOutReason()).toBe(SignOutReason.Revoked);
    });

    it('Unauthorized after a Chosen sign-out leaves the reason Chosen', async () => {
      await session.signedIn(ada);
      session.signedOut(SignOutReason.Chosen);
      me.mockResolvedValueOnce(failed(AuthError.Unauthorized));

      await session.check();

      expect(session.signOutReason()).toBe(SignOutReason.Chosen);
    });

    it('Ok after a sign-out clears the reason', async () => {
      session.signedOut(SignOutReason.Chosen);
      me.mockResolvedValueOnce(ok(ada));

      await session.check();

      expect(session.state()).toBe(SessionState.SignedIn);
      expect(session.signOutReason()).toBeNull();
    });

    it.each([AuthError.Network, AuthError.Unexpected, AuthError.SignInFailed])(
      '%s becomes Unreachable',
      async (error) => {
        me.mockResolvedValue(failed(error));

        await session.check();

        expect(session.state()).toBe(SessionState.Unreachable);
      },
    );

    it('Unreachable leaves the Me unchanged', async () => {
      me.mockResolvedValueOnce(ok(ada));
      await session.check();
      me.mockResolvedValueOnce(failed(AuthError.Network));

      await session.check();

      expect(session.state()).toBe(SessionState.Unreachable);
      expect(session.me()).toEqual(ada);
    });

    it('does not touch the reported zone', async () => {
      me.mockResolvedValue(ok(ada));
      await session.check();
      me.mockResolvedValue(failed(AuthError.Unauthorized));
      await session.check();

      expect(get).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
    });

    it('is single-flight: a second call returns the same promise and makes one request', async () => {
      const pending = defer();
      me.mockReturnValue(pending.promise);

      const first = session.check();
      const second = session.check();

      expect(second).toBe(first);
      expect(me).toHaveBeenCalledTimes(1);

      pending.resolve(ok(ada));
      await first;

      expect(session.state()).toBe(SessionState.SignedIn);
    });

    it('asks again after the first check settled', async () => {
      me.mockResolvedValue(ok(ada));

      await session.check();
      await session.check();

      expect(me).toHaveBeenCalledTimes(2);
    });

    describe('timeout', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      it('resolves as Unreachable after 10 000 ms without an answer', async () => {
        me.mockReturnValue(defer().promise);
        let settled = false;

        const done = session.check().then(() => {
          settled = true;
        });
        await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS - 1);

        expect(settled).toBe(false);
        expect(session.state()).toBe(SessionState.Unknown);

        await vi.advanceTimersByTimeAsync(1);
        await done;

        expect(settled).toBe(true);
        expect(session.state()).toBe(SessionState.Unreachable);
      });

      it('still applies a late Ok answer', async () => {
        const pending = defer();
        me.mockReturnValue(pending.promise);

        const done = session.check();
        await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS);
        await done;
        expect(session.state()).toBe(SessionState.Unreachable);

        pending.resolve(ok(ada));
        await vi.advanceTimersByTimeAsync(0);

        expect(session.state()).toBe(SessionState.SignedIn);
        expect(session.me()).toEqual(ada);
      });

      it('still applies a late Unauthorized answer', async () => {
        const pending = defer();
        me.mockReturnValue(pending.promise);

        const done = session.check();
        await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS);
        await done;

        pending.resolve(failed(AuthError.Unauthorized));
        await vi.advanceTimersByTimeAsync(0);

        expect(session.state()).toBe(SessionState.SignedOut);
        expect(session.me()).toBeNull();
      });

      it('an answer before the timeout wins', async () => {
        const pending = defer();
        me.mockReturnValue(pending.promise);

        const done = session.check();
        pending.resolve(ok(ada));
        await vi.advanceTimersByTimeAsync(0);
        await done;
        await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS);

        expect(session.state()).toBe(SessionState.SignedIn);
      });
    });
  });

  describe('stale answers', () => {
    it('a check answering 200 after signedOut() leaves the state SignedOut and still resolves', async () => {
      const pending = defer();
      me.mockReturnValue(pending.promise);

      const done = session.check();
      session.signedOut(SignOutReason.Revoked);
      pending.resolve(ok(ada));
      await done;

      expect(session.state()).toBe(SessionState.SignedOut);
      expect(session.me()).toBeNull();
    });

    it('a check answering 401 after signedIn(me) leaves the state SignedIn', async () => {
      const pending = defer();
      me.mockReturnValue(pending.promise);

      const done = session.check();
      await session.signedIn(grace);
      pending.resolve(failed(AuthError.Unauthorized));
      await done;

      expect(session.state()).toBe(SessionState.SignedIn);
      expect(session.me()).toEqual(grace);
    });

    it('signedIn() without a Me sends a new request instead of joining a check in flight', async () => {
      me.mockReturnValueOnce(defer().promise);
      me.mockReturnValueOnce(defer().promise);

      void session.check();
      void session.signedIn();
      await Promise.resolve();

      expect(me).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['the stale 401 arrives first', true],
      ['the fresh 200 arrives first', false],
    ])(
      'is SignedIn when the check answers 401 and signedIn() answers 200 (%s)',
      async (_name, staleFirst) => {
        const stale = defer();
        const fresh = defer();
        me.mockReturnValueOnce(stale.promise);
        me.mockReturnValueOnce(fresh.promise);

        const check = session.check();
        const signIn = session.signedIn();
        await Promise.resolve();

        if (staleFirst) {
          stale.resolve(failed(AuthError.Unauthorized));
          await check;
          fresh.resolve(ok(ada));
        } else {
          fresh.resolve(ok(ada));
          await signIn;
          stale.resolve(failed(AuthError.Unauthorized));
        }

        await Promise.all([check, signIn]);

        expect(session.state()).toBe(SessionState.SignedIn);
        expect(session.me()).toEqual(ada);
      },
    );

    describe('timeout', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      it('a timeout after signedOut() leaves the state SignedOut and the check still resolves', async () => {
        me.mockReturnValue(defer().promise);
        let settled = false;

        const done = session.check().then(() => {
          settled = true;
        });
        session.signedOut(SignOutReason.Revoked);
        await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS);
        await done;

        expect(settled).toBe(true);
        expect(session.state()).toBe(SessionState.SignedOut);
      });

      it('a timeout after signedIn(me) leaves the state SignedIn', async () => {
        me.mockReturnValue(defer().promise);

        const done = session.check();
        await session.signedIn(grace);
        await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS);
        await done;

        expect(session.state()).toBe(SessionState.SignedIn);
        expect(session.me()).toEqual(grace);
      });

      it('a late 200 after a timeout still signs in when nothing happened in between', async () => {
        const pending = defer();
        me.mockReturnValue(pending.promise);

        const done = session.check();
        await vi.advanceTimersByTimeAsync(SESSION_CHECK_TIMEOUT_MS);
        await done;
        pending.resolve(ok(ada));
        await vi.advanceTimersByTimeAsync(0);

        expect(session.state()).toBe(SessionState.SignedIn);
      });
    });
  });

  describe('signedIn', () => {
    it('with a Me clears the reported zone, sets SignedIn and the Me, and makes no request', async () => {
      await session.signedIn(grace);

      expect(clear).toHaveBeenCalledOnce();
      expect(session.state()).toBe(SessionState.SignedIn);
      expect(session.me()).toEqual(grace);
      expect(me).not.toHaveBeenCalled();
    });

    it('without a Me clears the reported zone and runs check, resolving when it settles', async () => {
      const pending = defer();
      me.mockReturnValue(pending.promise);
      let settled = false;

      const done = session.signedIn().then(() => {
        settled = true;
      });
      await Promise.resolve();

      expect(clear).toHaveBeenCalledOnce();
      expect(me).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);

      pending.resolve(ok(ada));
      await done;

      expect(settled).toBe(true);
      expect(session.state()).toBe(SessionState.SignedIn);
      expect(session.me()).toEqual(ada);
    });

    it('without a Me and an unreachable server ends Unreachable', async () => {
      me.mockResolvedValue(failed(AuthError.Network));

      await session.signedIn();

      expect(session.state()).toBe(SessionState.Unreachable);
    });

    it.each([SignOutReason.Chosen, SignOutReason.Revoked])(
      'with a Me clears a %s reason',
      async (reason) => {
        session.signedOut(reason);

        await session.signedIn(grace);

        expect(session.signOutReason()).toBeNull();
      },
    );

    it('without a Me clears a Chosen reason once the server confirms the sign-in', async () => {
      session.signedOut(SignOutReason.Chosen);
      me.mockResolvedValue(ok(ada));

      await session.signedIn();

      expect(session.signOutReason()).toBeNull();
    });

    it('without a Me clears a Chosen reason even when the server does not answer', async () => {
      session.signedOut(SignOutReason.Chosen);
      me.mockResolvedValueOnce(failed(AuthError.Network));

      await session.signedIn();

      expect(session.state()).toBe(SessionState.Unreachable);
      expect(session.signOutReason()).toBeNull();

      me.mockResolvedValueOnce(failed(AuthError.Unauthorized));

      await session.check();

      expect(session.state()).toBe(SessionState.SignedOut);
      expect(session.signOutReason()).toBe(SignOutReason.Revoked);
    });

    it('a revocation in the next session is not mistaken for the earlier Chosen sign-out', async () => {
      await session.signedIn(ada);
      session.signedOut(SignOutReason.Chosen);
      await session.signedIn(grace);

      session.signedOut(SignOutReason.Revoked);

      expect(session.signOutReason()).toBe(SignOutReason.Revoked);
    });
  });

  describe('signedOut', () => {
    it('sets SignedOut, clears the Me and clears the reported zone', async () => {
      await session.signedIn(ada);
      clear.mockClear();

      session.signedOut(SignOutReason.Chosen);

      expect(session.state()).toBe(SessionState.SignedOut);
      expect(session.me()).toBeNull();
      expect(clear).toHaveBeenCalledOnce();
    });

    it.each([SignOutReason.Chosen, SignOutReason.Revoked])('records %s', async (reason) => {
      await session.signedIn(ada);

      session.signedOut(reason);

      expect(session.signOutReason()).toBe(reason);
    });

    it('is harmless when called twice', () => {
      session.signedOut(SignOutReason.Revoked);

      expect(() => session.signedOut(SignOutReason.Revoked)).not.toThrow();
      expect(session.state()).toBe(SessionState.SignedOut);
      expect(session.me()).toBeNull();
      expect(session.signOutReason()).toBe(SignOutReason.Revoked);
    });

    it('keeps Chosen when Revoked follows it', () => {
      session.signedOut(SignOutReason.Chosen);
      session.signedOut(SignOutReason.Revoked);

      expect(session.signOutReason()).toBe(SignOutReason.Chosen);
    });

    it('settles on Chosen when Revoked comes first', () => {
      session.signedOut(SignOutReason.Revoked);
      session.signedOut(SignOutReason.Chosen);

      expect(session.signOutReason()).toBe(SignOutReason.Chosen);
    });
  });
});
