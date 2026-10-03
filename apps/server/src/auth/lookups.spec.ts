// SPDX-License-Identifier: EUPL-1.2
import { randomBytes, randomUUID } from 'node:crypto';
import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { appDatabase, Db } from '../db/database';
import { passkeys, recoveryCodes, sessions, signUpLinks } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { scopedOwner } from '../test/owners';
import {
  lookupPasskey,
  lookupRecoveryCode,
  lookupSession,
  lookupSignUpLink,
  type OwnedKey,
} from './lookups';

// The lookups run before an owner is known, so they set none and see every
// owner's rows through the SECURITY DEFINER functions (ADR 0007).

const createdAt = new Date('2026-10-02T08:00:00.000Z');
const expiresAt = new Date('2026-10-02T09:00:00.000Z');

const hash = () => randomBytes(32).toString('hex');

const credentialId = () => randomBytes(32).toString('base64url');

// A key that differs from `key` in its last character only.
const lastCharChanged = (key: string) => key.slice(0, -1) + (key.endsWith('0') ? '1' : '0');

interface Seeded {
  readonly signUpLink: { readonly key: string; readonly id: string };
  readonly session: { readonly key: string; readonly id: string };
  readonly passkey: { readonly key: string; readonly id: string };
  readonly recoveryCode: { readonly key: string; readonly id: string };
}

const seedOwner = (ownerId: string) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      const seeded: Seeded = {
        signUpLink: { key: hash(), id: randomUUID() },
        session: { key: hash(), id: randomUUID() },
        passkey: { key: credentialId(), id: randomUUID() },
        recoveryCode: { key: hash(), id: randomUUID() },
      };
      yield* db.insert(signUpLinks).values({
        ownerId,
        id: seeded.signUpLink.id,
        tokenHash: seeded.signUpLink.key,
        createdAt,
        expiresAt,
      });
      yield* db.insert(sessions).values({
        ownerId,
        id: seeded.session.id,
        tokenHash: seeded.session.key,
        createdAt,
        expiresAt,
      });
      yield* db.insert(passkeys).values({
        ownerId,
        id: seeded.passkey.id,
        credentialId: seeded.passkey.key,
        publicKey: 'a public key',
        counter: 0,
        transports: [],
        backedUp: false,
        name: 'a passkey',
        createdAt,
      });
      yield* db.insert(recoveryCodes).values({
        ownerId,
        id: seeded.recoveryCode.id,
        codeHash: seeded.recoveryCode.key,
        createdAt,
      });
      return seeded;
    }),
  );

const lookups: ReadonlyArray<{
  readonly name: string;
  readonly kind: keyof Seeded;
  readonly lookup: (key: string) => Effect.Effect<OwnedKey | undefined, unknown, Db>;
}> = [
  { name: 'lookupSignUpLink', kind: 'signUpLink', lookup: lookupSignUpLink },
  { name: 'lookupSession', kind: 'session', lookup: lookupSession },
  { name: 'lookupPasskey', kind: 'passkey', lookup: lookupPasskey },
  { name: 'lookupRecoveryCode', kind: 'recoveryCode', lookup: lookupRecoveryCode },
];

layer(appDatabase())('pre-owner lookups', (it) => {
  for (const { name, kind, lookup } of lookups) {
    it.effect(`${name} finds the exact key outside any transaction`, () =>
      Effect.gen(function* () {
        const a = yield* scopedOwner();
        const b = yield* scopedOwner();
        const seededA = yield* seedOwner(a);
        yield* seedOwner(b);

        const found = yield* lookup(seededA[kind].key);

        assert.deepStrictEqual(found, { ownerId: a, id: seededA[kind].id });
      }),
    );

    it.effect(`${name} finds another owner's key while an owner is set`, () =>
      Effect.gen(function* () {
        const a = yield* scopedOwner();
        const b = yield* scopedOwner();
        const seededA = yield* seedOwner(a);
        yield* seedOwner(b);

        const found = yield* withOwner(b, lookup(seededA[kind].key));

        assert.deepStrictEqual(found, { ownerId: a, id: seededA[kind].id });
      }),
    );

    it.effect(`${name} finds nothing for a near miss or the empty string`, () =>
      Effect.gen(function* () {
        const a = yield* scopedOwner();
        const seededA = yield* seedOwner(a);

        assert.strictEqual(yield* lookup(lastCharChanged(seededA[kind].key)), undefined);
        assert.strictEqual(yield* lookup(''), undefined);
      }),
    );
  }

  it.effect('a plain select sees no session while no owner is set', () =>
    Effect.gen(function* () {
      const a = yield* scopedOwner();
      yield* seedOwner(a);
      const db = yield* Db;

      const rows = yield* db.select().from(sessions);

      assert.deepStrictEqual(rows, []);
    }),
  );
});
