// SPDX-License-Identifier: EUPL-1.2
import { sql, type SQL } from 'drizzle-orm';
import { Effect } from 'effect';
import { Db } from '../db/database';

/** The key of an owned row: the owner and the row id. */
export interface OwnedKey {
  readonly ownerId: string;
  readonly id: string;
}

const lookup = (query: SQL) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const rows = yield* db.execute<{ owner_id: string; id: string }>(query, 'objects');
    if (rows.length > 1) {
      return yield* Effect.die(`A lookup matched ${rows.length} rows, expected at most one`);
    }
    const row = rows[0];
    return row === undefined
      ? undefined
      : ({ ownerId: row.owner_id, id: row.id } satisfies OwnedKey);
  });

/**
 * Finds the sign-up link with this token hash across all owners, or `undefined`.
 * Sets no owner and opens no transaction. More than one match is a defect.
 */
export const lookupSignUpLink = (tokenHash: string) =>
  lookup(sql`select owner_id, id from lookup_sign_up_link(${tokenHash})`);

/**
 * Finds the session with this token hash across all owners, or `undefined`.
 * Sets no owner and opens no transaction. More than one match is a defect.
 */
export const lookupSession = (tokenHash: string) =>
  lookup(sql`select owner_id, id from lookup_session(${tokenHash})`);

/**
 * Finds the passkey with this credential id across all owners, or `undefined`.
 * Sets no owner and opens no transaction. More than one match is a defect.
 */
export const lookupPasskey = (credentialId: string) =>
  lookup(sql`select owner_id, id from lookup_passkey(${credentialId})`);

/**
 * Finds the recovery code with this hash across all owners, or `undefined`.
 * Sets no owner and opens no transaction. More than one match is a defect.
 */
export const lookupRecoveryCode = (codeHash: string) =>
  lookup(sql`select owner_id, id from lookup_recovery_code(${codeHash})`);
