// SPDX-License-Identifier: EUPL-1.2
import { SignInFailed, type Me } from '@asys/contract';
import type { Instant } from '@asys/domain';
import type { StoredPasskey } from '@ionaru/effect-passkeys/server';
import { and, count, eq, isNull } from 'drizzle-orm';
import { Clock, Effect } from 'effect';
import { lockCounter } from '../changes/change-log';
import { Db } from '../db/database';
import { recoveryCodes } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { readMe } from './account';
import { lookupRecoveryCode } from './lookups';
import { normalizeRecoveryCode } from './recovery-codes';
import { createSession, deleteOtherSessions } from './sessions';
import { hashToken } from './tokens';

/** A new session: its token (shown once, stored only as a hash), its id and its expiry. */
export interface Session {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: Instant;
}

/**
 * The `onAuthenticated` hook: creates a session for the passkey's owner and reads their `me`.
 * Runs inside the library's unit of work and joins its transaction; sets no cookie.
 */
export const signIn = (passkey: StoredPasskey) =>
  Effect.gen(function* () {
    const session: Session = yield* createSession(passkey.userId);
    const me: Me = yield* readMe(passkey.userId);
    return { me, session };
  });

/**
 * Recovery-code sign-in: marks the code used, starts a session and ends every other session
 * of the owner, in one transaction under the owner's counter lock. Fails with `SignInFailed`
 * when the code is malformed, unknown or already used; database failures are defects.
 */
export const recover = (input: { readonly code: string }) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const canonical = normalizeRecoveryCode(input.code);
    if (canonical === undefined) return yield* new SignInFailed();
    const codeHash = hashToken(canonical);

    const found = yield* lookupRecoveryCode(codeHash).pipe(Effect.orDie);
    if (found === undefined) return yield* new SignInFailed();
    const { ownerId, id: codeId } = found;

    return yield* withOwner(
      ownerId,
      Effect.gen(function* () {
        yield* lockCounter;
        const rows = yield* db
          .select({ usedAt: recoveryCodes.usedAt })
          .from(recoveryCodes)
          .where(eq(recoveryCodes.id, codeId))
          .for('update');
        if (rows.length === 0 || rows[0].usedAt !== null) return yield* new SignInFailed();

        const now = yield* Clock.currentTimeMillis;
        yield* db
          .update(recoveryCodes)
          .set({ usedAt: new Date(now) })
          .where(eq(recoveryCodes.id, codeId));

        const session: Session = yield* createSession(ownerId);
        yield* deleteOtherSessions(ownerId, session.sessionId);
        const counts = yield* db
          .select({ left: count() })
          .from(recoveryCodes)
          .where(and(eq(recoveryCodes.ownerId, ownerId), isNull(recoveryCodes.usedAt)));
        return { recoveryCodesLeft: counts[0].left, session };
      }),
    ).pipe(
      Effect.catch((error): Effect.Effect<never, SignInFailed> =>
        error instanceof SignInFailed ? Effect.fail(error) : Effect.die(error),
      ),
    );
  });
