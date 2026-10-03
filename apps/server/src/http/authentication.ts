// SPDX-License-Identifier: EUPL-1.2
import { Authentication, CurrentOwner } from '@asys/contract';
import { Effect, Layer, Redacted } from 'effect';
import { authenticate } from '../auth/sessions';
import { Db } from '../db/database';
import { setSessionCookie } from './cookies';

/**
 * The cookie-session middleware: resolves the session token to the `CurrentOwner`, fails with
 * `Unauthorized` for a missing, unknown or expired session, and re-sets the cookie with the
 * same token and a fresh `Max-Age` when the session was renewed.
 */
export const AuthenticationLive: Layer.Layer<Authentication, never, Db> = Layer.effect(
  Authentication,
)(
  Effect.gen(function* () {
    const db = yield* Db;
    return {
      session: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const token = Redacted.value(credential);
          const session = yield* authenticate(token);
          if ('renewedUntil' in session) yield* setSessionCookie(token);
          return yield* Effect.provideService(httpEffect, CurrentOwner, {
            ownerId: session.ownerId,
            sessionId: session.sessionId,
          });
        }).pipe(Effect.provideService(Db, db)),
    };
  }),
);
