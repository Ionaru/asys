// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import {
  CreatePasskeyResult,
  DeletePasskeyResult,
  PasskeyStore,
  type StoredPasskey,
} from '@ionaru/effect-passkeys/server';
import { and, eq } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { lockCounter } from '../changes/change-log';
import { Db } from '../db/database';
import { passkeys, users } from '../db/schema';
import { uniqueViolationConstraint } from '../db/sql-error';
import { withOwner } from '../db/with-owner';
import { lookupPasskey } from './lookups';

const CREDENTIAL_ID_CONSTRAINT = 'passkeys_credential_id_key';

/** A passkey row as the library's stored passkey: `userId` is the owner id, instants are epoch ms. */
export const passkeyFromRow = (row: typeof passkeys.$inferSelect): StoredPasskey => ({
  userId: row.ownerId,
  credentialId: row.credentialId,
  publicKey: row.publicKey,
  counter: row.counter,
  transports: row.transports,
  backedUp: row.backedUp,
  name: row.name,
  createdAt: row.createdAt.getTime(),
  lastUsedAt: row.lastUsedAt === null ? null : row.lastUsedAt.getTime(),
});

/** A new passkey row for `passkey`, with a new row id. */
export const passkeyToRow = (passkey: StoredPasskey): typeof passkeys.$inferInsert => ({
  ownerId: passkey.userId,
  id: randomUUID(),
  credentialId: passkey.credentialId,
  publicKey: passkey.publicKey,
  counter: passkey.counter,
  transports: passkey.transports,
  backedUp: passkey.backedUp,
  name: passkey.name,
  createdAt: new Date(passkey.createdAt),
  lastUsedAt: passkey.lastUsedAt === null ? null : new Date(passkey.lastUsedAt),
});

/**
 * The library's `PasskeyStore` over drizzle and row-level security. Captures `Db`; every
 * database failure is a defect. The writes lock the owner's change counter first. A duplicate
 * credential id is caught outside the store's own `withOwner`, so inside a unit of work the
 * savepoint rolls back and the outer transaction stays usable.
 */
export const PasskeyStoreLive: Layer.Layer<PasskeyStore, never, Db> = Layer.effect(PasskeyStore)(
  Effect.gen(function* () {
    const db = yield* Db;

    return PasskeyStore.of({
      findPasskey: (credentialId) =>
        Effect.gen(function* () {
          const found = yield* lookupPasskey(credentialId);
          if (found === undefined) return Option.none<StoredPasskey>();
          const rows = yield* withOwner(
            found.ownerId,
            db.select().from(passkeys).where(eq(passkeys.id, found.id)),
          );
          return rows.length === 0
            ? Option.none<StoredPasskey>()
            : Option.some(passkeyFromRow(rows[0]));
        }).pipe(Effect.provideService(Db, db), Effect.orDie),

      listPasskeys: (userId) =>
        withOwner(userId, db.select().from(passkeys)).pipe(
          Effect.provideService(Db, db),
          Effect.map((rows) => rows.map(passkeyFromRow)),
          Effect.orDie,
        ),

      createPasskey: (passkey) =>
        withOwner(
          passkey.userId,
          lockCounter.pipe(Effect.andThen(db.insert(passkeys).values(passkeyToRow(passkey)))),
        ).pipe(
          Effect.provideService(Db, db),
          Effect.as(CreatePasskeyResult.Created),
          Effect.catch((error) =>
            uniqueViolationConstraint(error) === CREDENTIAL_ID_CONSTRAINT
              ? Effect.succeed(CreatePasskeyResult.Duplicate)
              : Effect.die(error),
          ),
        ),

      updateCounter: (credentialId, expected, next, usedAt) =>
        Effect.gen(function* () {
          const found = yield* lookupPasskey(credentialId);
          if (found === undefined) return false;
          const rows = yield* withOwner(
            found.ownerId,
            Effect.gen(function* () {
              yield* lockCounter;
              return yield* db
                .update(passkeys)
                .set({ counter: next, lastUsedAt: new Date(usedAt) })
                .where(and(eq(passkeys.credentialId, credentialId), eq(passkeys.counter, expected)))
                .returning({ id: passkeys.id });
            }),
          );
          return rows.length === 1;
        }).pipe(Effect.provideService(Db, db), Effect.orDie),

      deletePasskey: (userId, credentialId, keepLast) =>
        withOwner(
          userId,
          Effect.gen(function* () {
            yield* lockCounter;
            const rows = yield* db
              .select({ credentialId: passkeys.credentialId })
              .from(passkeys)
              .where(eq(passkeys.ownerId, userId));
            if (!rows.some((row) => row.credentialId === credentialId)) {
              return DeletePasskeyResult.NotFound;
            }
            if (keepLast && rows.length === 1) return DeletePasskeyResult.LastPasskey;
            yield* db
              .delete(passkeys)
              .where(and(eq(passkeys.ownerId, userId), eq(passkeys.credentialId, credentialId)));
            return DeletePasskeyResult.Deleted;
          }),
        ).pipe(Effect.provideService(Db, db), Effect.orDie),

      userName: (userId) =>
        withOwner(userId, db.select({ name: users.name }).from(users)).pipe(
          Effect.provideService(Db, db),
          Effect.map((rows) =>
            rows.length === 0 ? Option.none<string>() : Option.some(rows[0].name),
          ),
          Effect.orDie,
        ),
    });
  }),
);
