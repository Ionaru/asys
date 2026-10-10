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

/** How long `check()` waits for the server before reporting it unreachable. */
export const SESSION_CHECK_TIMEOUT_MS = 10_000;

/** Whether someone is signed in, learned from `GET /v1/auth/me` (the session cookie is HttpOnly). */
@Service()
export class Session {
  readonly #api = inject(AuthApi);

  readonly #reportedZone = inject(ReportedZone);

  readonly #stateSignal = signal(SessionState.Unknown);

  readonly #meSignal = signal<Me | null>(null);

  #inFlight: Promise<void> | null = null;

  /** Bumped by `signedIn()` and `signedOut()`; answers from an older generation are dropped. */
  #generation = 0;

  readonly state = this.#stateSignal.asReadonly();

  readonly me = this.#meSignal.asReadonly();

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
    this.#reportedZone.clear();

    if (me === undefined) {
      await this.#ask();

      return;
    }

    this.#stateSignal.set(SessionState.SignedIn);
    this.#meSignal.set(me);
  }

  /** Records that the session is gone. Harmless to repeat. */
  signedOut(): void {
    this.#generation += 1;
    this.#stateSignal.set(SessionState.SignedOut);
    this.#meSignal.set(null);
    this.#reportedZone.clear();
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
      this.#stateSignal.set(SessionState.SignedIn);
      this.#meSignal.set(result.value);

      return;
    }

    if (result.error === AuthError.Unauthorized) {
      this.#stateSignal.set(SessionState.SignedOut);
      this.#meSignal.set(null);

      return;
    }

    this.#stateSignal.set(SessionState.Unreachable);
  }
}
