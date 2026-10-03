// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import type { Instant } from '@asys/domain';
import { Clock, Effect } from 'effect';
import { Db } from '../db/database';
import { signUpLinks } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { hashToken, newToken } from './tokens';

/** The longest a Sign-up link may stay valid. */
export const MAX_LINK_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Creates a Sign-up link for a new owner and returns its token (stored only as a hash), the
 * new owner id, the link id and the expiry. `expiresInDays` must be an integer from 1 to
 * `MAX_LINK_DAYS`, else it is a defect. The owner has no change counter yet, so no lock is taken.
 */
export const createSignUpLink = (input: { readonly expiresInDays: number }) =>
  Effect.gen(function* () {
    const { expiresInDays } = input;
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_LINK_DAYS) {
      return yield* Effect.die(
        `A Sign-up link lasts 1 to ${MAX_LINK_DAYS} whole days, got ${expiresInDays}`,
      );
    }

    const db = yield* Db;
    const token = newToken();
    const ownerId = randomUUID();
    const linkId = randomUUID();
    const now = yield* Clock.currentTimeMillis;
    const expiresAt: Instant = now + expiresInDays * DAY_MS;

    yield* withOwner(
      ownerId,
      db.insert(signUpLinks).values({
        ownerId,
        id: linkId,
        tokenHash: hashToken(token),
        createdAt: new Date(now),
        expiresAt: new Date(expiresAt),
        usedAt: null,
      }),
    );
    return { token, ownerId, linkId, expiresAt };
  });
