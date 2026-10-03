// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { SignUpLinkInvalid } from '@asys/contract';
import { PasskeyAlreadyRegistered } from '@ionaru/effect-passkeys/api';
import type { VerifiedRegistration } from '@ionaru/effect-passkeys/server';
import { eq } from 'drizzle-orm';
import { Clock, Effect } from 'effect';
import { Db } from '../db/database';
import { passkeys, recoveryCodes, signUpLinks } from '../db/schema';
import { uniqueViolationConstraint } from '../db/sql-error';
import { withOwner } from '../db/with-owner';
import {
  CreateOwnerRejected,
  CreateOwnerRejectedReason,
  createOwnerRows,
} from '../owners/create-owner';
import { lookupSignUpLink } from './lookups';
import { passkeyToRow } from './passkey-store';
import { newRecoveryCodes, normalizeRecoveryCode } from './recovery-codes';
import { createSession } from './sessions';
import { hashToken } from './tokens';

const CREDENTIAL_ID_CONSTRAINT = 'passkeys_credential_id_key';

/**
 * The `onRegisterBegin` hook: checks the Sign-up link and returns the new account's identity,
 * the link's owner id and the trimmed name. Fails with `SignUpLinkInvalid` when the token is
 * unknown, or its link is used or expired.
 */
export const signUpBegin = (payload: { readonly token: string; readonly name: string }) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const found = yield* lookupSignUpLink(hashToken(payload.token)).pipe(Effect.orDie);
    if (found === undefined) return yield* new SignUpLinkInvalid();

    const now = yield* Clock.currentTimeMillis;
    const rows = yield* withOwner(
      found.ownerId,
      db
        .select({ usedAt: signUpLinks.usedAt, expiresAt: signUpLinks.expiresAt })
        .from(signUpLinks)
        .where(eq(signUpLinks.id, found.id)),
    ).pipe(Effect.orDie);
    if (rows.length === 0 || rows[0].usedAt !== null || rows[0].expiresAt.getTime() <= now) {
      return yield* new SignUpLinkInvalid();
    }
    return { userId: found.ownerId, userName: payload.name.trim() };
  });

/**
 * The `onRegistered` hook: in one transaction that locks the link row first, marks the link
 * used, creates the owner, stores the first passkey, writes the recovery codes and starts a
 * session. Returns the formatted recovery codes and the session; sets no cookie. Fails with
 * `SignUpLinkInvalid` when the link does not belong to the registration, is used or expired
 * (or the owner exists), and with `PasskeyAlreadyRegistered` on a duplicate credential id,
 * in which case nothing is written.
 */
export const signUp = (
  registration: VerifiedRegistration,
  payload: { readonly token: string; readonly timeZone: string },
) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const found = yield* lookupSignUpLink(hashToken(payload.token)).pipe(Effect.orDie);
    if (found === undefined || found.ownerId !== registration.userId) {
      return yield* new SignUpLinkInvalid();
    }
    const { ownerId, id: linkId } = found;

    return yield* withOwner(
      ownerId,
      Effect.gen(function* () {
        const links = yield* db
          .select({ usedAt: signUpLinks.usedAt, expiresAt: signUpLinks.expiresAt })
          .from(signUpLinks)
          .where(eq(signUpLinks.id, linkId))
          .for('update');
        const now = yield* Clock.currentTimeMillis;
        if (links.length === 0 || links[0].usedAt !== null || links[0].expiresAt.getTime() <= now) {
          return yield* new SignUpLinkInvalid();
        }
        yield* db
          .update(signUpLinks)
          .set({ usedAt: new Date(now) })
          .where(eq(signUpLinks.id, linkId));

        yield* createOwnerRows({
          ownerId,
          name: registration.userName,
          timeZone: payload.timeZone,
        });
        yield* db
          .insert(passkeys)
          .values(passkeyToRow({ ...registration.passkey, userId: ownerId }));

        const codes = newRecoveryCodes();
        const hashes = yield* Effect.forEach(codes, (code) => {
          const normalized = normalizeRecoveryCode(code);
          return normalized === undefined
            ? Effect.die('A new recovery code failed to normalize')
            : Effect.succeed(hashToken(normalized));
        });
        yield* db.insert(recoveryCodes).values(
          hashes.map((codeHash) => ({
            ownerId,
            id: randomUUID(),
            codeHash,
            createdAt: new Date(now),
            usedAt: null,
          })),
        );

        const session = yield* createSession(ownerId);
        return { recoveryCodes: codes, session };
      }),
    ).pipe(
      Effect.catch((error): Effect.Effect<never, SignUpLinkInvalid | PasskeyAlreadyRegistered> => {
        if (error instanceof SignUpLinkInvalid) return Effect.fail(error);
        if (error instanceof CreateOwnerRejected) {
          return error.reason === CreateOwnerRejectedReason.OwnerExists
            ? Effect.fail(new SignUpLinkInvalid())
            : Effect.die(error);
        }
        return uniqueViolationConstraint(error) === CREDENTIAL_ID_CONSTRAINT
          ? Effect.fail(new PasskeyAlreadyRegistered())
          : Effect.die(error);
      }),
    );
  });
