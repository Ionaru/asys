// SPDX-License-Identifier: EUPL-1.2
import { inject, Service, signal } from '@angular/core';

import { AuthApi, AuthError, AuthResultTag, type AuthResult, type Me } from '../api/auth-api';
import { ReportedZone } from '../platform/reported-zone';

/** What the PWA knows about the sign-in. */
export enum SessionState {
  Unknown = 'unknown',
  SignedIn = 'signed_in',
  SignedOut = 'signed_out',
  Unreachable = 'unreachable',
}

/** Why the session ended, which decides where `App` sends the person next. */
export enum SignOutReason {
  /** The person asked for it, on the Account screen. */
  Chosen = 'chosen',
  /** The server ended it, or no longer knows it. */
  Revoked = 'revoked',
}

/** How long `check()` waits for the server before reporting it unreachable. */
export const SESSION_CHECK_TIMEOUT_MS = 10_000;

/** Whether someone is signed in, learned from `GET /v1/auth/me` (the session cookie is HttpOnly). */
@Service()
export class Session {
  readonly #api = inject(AuthApi);

  readonly #reportedZone = inject(ReportedZone);

  readonly #stateSignal = signal(SessionState.Unknown);

  readonly #meSignal = signal<Me | null>(null);

  readonly #signOutReasonSignal = signal<SignOutReason | null>(null);

  #inFlight: Promise<void> | null = null;

  /** Bumped by `signedIn()` and `signedOut()`; answers from an older generation are dropped. */
  #generation = 0;

  readonly state = this.#stateSignal.asReadonly();

  readonly me = this.#meSignal.asReadonly();

  /**
   * Why the session ended, or null while it has not. Chosen outranks Revoked until the next
   * sign-in, which clears it, so a later revocation is never taken for a choice.
   */
  readonly signOutReason = this.#signOutReasonSignal.asReadonly();

  /** Asks the server who is signed in. Never rejects; concurrent calls share one request. */
  check(): Promise<void> {
    if (this.#inFlight !== null) {
      return this.#inFlight;
    }

    const pending = this.#ask().finally(() => {
      if (this.#inFlight === pending) {
        this.#inFlight = null;
      }
    });

    this.#inFlight = pending;

    return pending;
  }

  /** Records a successful sign-up, sign-in or recovery. */
  async signedIn(me?: Me): Promise<void> {
    this.#generation += 1;
    this.#signOutReasonSignal.set(null);
    this.#reportedZone.clear();

    if (me === undefined) {
      await this.#ask();

      return;
    }

    this.#enter(me);
  }

  /** Records that the session is gone, and why. Harmless to repeat. */
  signedOut(reason: SignOutReason): void {
    this.#generation += 1;
    this.#record(reason);
    this.#stateSignal.set(SessionState.SignedOut);
    this.#meSignal.set(null);
    this.#reportedZone.clear();
  }

  #enter(me: Me): void {
    this.#stateSignal.set(SessionState.SignedIn);
    this.#meSignal.set(me);
    this.#signOutReasonSignal.set(null);
  }

  #record(reason: SignOutReason): void {
    if (this.#signOutReasonSignal() !== SignOutReason.Chosen) {
      this.#signOutReasonSignal.set(reason);
    }
  }

  #ask(): Promise<void> {
    const generation = this.#generation;

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (generation === this.#generation) {
          this.#stateSignal.set(SessionState.Unreachable);
        }

        resolve();
      }, SESSION_CHECK_TIMEOUT_MS);

      const settle = (result: AuthResult<Me>): void => {
        clearTimeout(timer);

        if (generation === this.#generation) {
          this.#apply(result);
        }

        resolve();
      };

      this.#api.me().then(settle, () => {
        settle({ _tag: AuthResultTag.Failed, error: AuthError.Unexpected });
      });
    });
  }

  #apply(result: AuthResult<Me>): void {
    if (result._tag === AuthResultTag.Ok) {
      this.#enter(result.value);

      return;
    }

    if (result.error === AuthError.Unauthorized) {
      this.#record(SignOutReason.Revoked);
      this.#stateSignal.set(SessionState.SignedOut);
      this.#meSignal.set(null);

      return;
    }

    this.#stateSignal.set(SessionState.Unreachable);
  }
}
