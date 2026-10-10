// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { CurrentOwner } from '@asys/contract';
import type { Instant } from '@asys/domain';
import { and, eq, gt, ne } from 'drizzle-orm';
import { Clock, Effect } from 'effect';
import { HttpApiError } from 'effect/http-api';
import { lockCounter } from '../changes/change-log';
import { Db } from '../db/database';
import { sessions } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { lookupSession } from './lookups';
import { hashToken, newToken } from './tokens';

/** How long a session lasts from its creation or last renewal. */
export const SESSION_DAYS = 30;

/** A session with less than this many days left is renewed when it is used. */
export const SESSION_RENEW_BELOW_DAYS = 29;

const DAY_MS = 86_400_000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Creates a session for the owner and returns its token (stored only as a hash), its id and
 * its expiry. Must run inside the caller's `withOwner(ownerId, ...)`, after its first lock.
 */
export const createSession = (ownerId: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const token = newToken();
    const sessionId = randomUUID();
    const now = yield* Clock.currentTimeMillis;
    const expiresAt: Instant = now + SESSION_DAYS * DAY_MS;
    yield* db.insert(sessions).values({
      ownerId,
      id: sessionId,
      tokenHash: hashToken(token),
      createdAt: new Date(now),
      expiresAt: new Date(expiresAt),
    });
    return { token, sessionId, expiresAt };
  });

/**
 * Resolves a session token to its owner and session. A token that is not 43 base64url
 * characters, is unknown, or has expired is `Unauthorized`; database failures are defects.
 * A session with less than `SESSION_RENEW_BELOW_DAYS` left is extended to `SESSION_DAYS`
 * from now, and the new expiry is returned as `renewedUntil`.
 */
export const authenticate = (token: string) =>
  Effect.gen(function* () {
    if (!TOKEN_PATTERN.test(token)) return yield* new HttpApiError.Unauthorized();

    const db = yield* Db;
    const found = yield* lookupSession(hashToken(token)).pipe(Effect.orDie);
    if (found === undefined) return yield* new HttpApiError.Unauthorized();
    const { ownerId, id: sessionId } = found;

    const now = yield* Clock.currentTimeMillis;
    const rows = yield* withOwner(
      ownerId,
      db.select({ expiresAt: sessions.expiresAt }).from(sessions).where(eq(sessions.id, sessionId)),
    ).pipe(Effect.orDie);
    if (rows.length === 0 || rows[0].expiresAt.getTime() <= now) {
      return yield* new HttpApiError.Unauthorized();
    }
    if (rows[0].expiresAt.getTime() - now >= SESSION_RENEW_BELOW_DAYS * DAY_MS) {
      return { ownerId, sessionId };
    }

    const renewedUntil: Instant = now + SESSION_DAYS * DAY_MS;
    const renewed = yield* withOwner(
      ownerId,
      Effect.gen(function* () {
        yield* lockCounter;
        return yield* db
          .update(sessions)
          .set({ expiresAt: new Date(renewedUntil) })
          .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date(now))))
          .returning({ id: sessions.id });
      }),
    ).pipe(Effect.orDie);
    if (renewed.length === 0) return yield* new HttpApiError.Unauthorized();
    return { ownerId, sessionId, renewedUntil };
  });

/**
 * Fails with `Unauthorized` unless the session still exists and has not expired. Must run
 * inside the caller's `withOwner(ownerId, ...)`, after `lockCounter`: every revocation takes
 * the same lock, so a request that authenticated before a revocation committed cannot write
 * after it. This relies on read committed, `withOwner`'s default: the check's snapshot is
 * taken after the lock is granted. Database failures are defects.
 */
export const requireLiveSession = (sessionId: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const now = yield* Clock.currentTimeMillis;
    const rows = yield* db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date(now))))
      .pipe(Effect.orDie);
    if (rows.length === 0) return yield* new HttpApiError.Unauthorized();
  });

/**
 * `requireLiveSession` for the request's `CurrentOwner`: the passkey library's
 * `recheckSession`, which runs first inside the unit of work of adding or removing a passkey,
 * after its counter lock. A session revoked while the request waited for the lock fails with
 * `Unauthorized`, which the endpoint answers as the middleware does. Database failures are
 * defects.
 */
export const requireLiveCurrentSession: Effect.Effect<
  void,
  HttpApiError.Unauthorized,
  Db | CurrentOwner
> = CurrentOwner.use((owner) => requireLiveSession(owner.sessionId));

/** Deletes one session of the owner, under the owner's counter lock. */
export const deleteSession = (ownerId: string, sessionId: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* withOwner(
      ownerId,
      Effect.gen(function* () {
        yield* lockCounter;
        yield* db.delete(sessions).where(eq(sessions.id, sessionId));
      }),
    );
  });

/**
 * Deletes the owner's sessions other than `keepSessionId`; row-level security limits it to
 * the owner. Must run inside the caller's `withOwner(ownerId, ...)`, after `lockCounter`.
 */
export const deleteOtherSessions = (ownerId: string, keepSessionId: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db
      .delete(sessions)
      .where(and(eq(sessions.ownerId, ownerId), ne(sessions.id, keepSessionId)));
  });
