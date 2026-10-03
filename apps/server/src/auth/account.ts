// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { CurrentOwner, type Me } from '@asys/contract';
import { and, count, eq, isNull } from 'drizzle-orm';
import { Clock, Effect } from 'effect';
import { lockCounter } from '../changes/change-log';
import { Db } from '../db/database';
import { recoveryCodes, users } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { newRecoveryCodes, normalizeRecoveryCode } from './recovery-codes';
import { deleteOtherSessions, deleteSession, requireLiveSession } from './sessions';
import { hashToken } from './tokens';

/**
 * The owner's name and unused recovery code count. Must run inside the caller's
 * `withOwner(ownerId, ...)`. A missing owner is a defect.
 */
export const readMe = (ownerId: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const names = yield* db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.ownerId, ownerId));
    if (names.length !== 1)
      return yield* Effect.die(`Expected one user row, found ${names.length}`);
    const counts = yield* db
      .select({ left: count() })
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.ownerId, ownerId), isNull(recoveryCodes.usedAt)));
    return { name: names[0].name, recoveryCodesLeft: counts[0].left } satisfies Me;
  });

/** The signed-in owner's name and unused recovery code count, read in its own transaction. */
export const me = (ownerId: string) => withOwner(ownerId, readMe(ownerId));

/**
 * Replaces the owner's recovery codes with `RECOVERY_CODE_COUNT` new ones, signs out every
 * other session and returns the new codes, formatted. Runs under the owner's counter lock,
 * and fails with `Unauthorized` without writing when the current session was revoked before
 * the lock was taken.
 */
export const regenerateRecoveryCodes = (owner: {
  readonly ownerId: string;
  readonly sessionId: string;
}) =>
  withOwner(
    owner.ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* lockCounter;
      yield* requireLiveSession(owner.sessionId);
      const now = yield* Clock.currentTimeMillis;

      const codes = newRecoveryCodes();
      const hashes = yield* Effect.forEach(codes, (code) => {
        const normalized = normalizeRecoveryCode(code);
        return normalized === undefined
          ? Effect.die('A new recovery code failed to normalize')
          : Effect.succeed(hashToken(normalized));
      });

      yield* db.delete(recoveryCodes).where(eq(recoveryCodes.ownerId, owner.ownerId));
      yield* db.insert(recoveryCodes).values(
        hashes.map((codeHash) => ({
          ownerId: owner.ownerId,
          id: randomUUID(),
          codeHash,
          createdAt: new Date(now),
          usedAt: null,
        })),
      );
      yield* deleteOtherSessions(owner.ownerId, owner.sessionId);
      return codes;
    }),
  );

/** Deletes the current session. */
export const signOut = (owner: { readonly ownerId: string; readonly sessionId: string }) =>
  deleteSession(owner.ownerId, owner.sessionId);

/**
 * The passkey library's `onRemoved` hook: deletes every other session of the owner and keeps
 * the current one. Runs inside the removal's unit of work. Database failures are defects.
 */
export const revokeOtherSessions = (_removed: {
  readonly userId: string;
  readonly credentialId: string;
}): Effect.Effect<void, never, Db | CurrentOwner> =>
  Effect.gen(function* () {
    const current = yield* CurrentOwner;
    yield* deleteOtherSessions(current.ownerId, current.sessionId);
  }).pipe(Effect.orDie);
