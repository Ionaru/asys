// SPDX-License-Identifier: MIT

import { Effect, Layer, Option } from 'effect';
import {
  CreatePasskeyResult,
  DeletePasskeyResult,
  PasskeyStore,
  type StoredPasskey,
} from '../server/store';
import { CurrentRun } from './recording-unit-of-work';

export interface MemoryPasskeyStore {
  readonly layer: Layer.Layer<PasskeyStore>;
  /** By credential id, inspectable and seedable. */
  readonly passkeys: Map<string, StoredPasskey>;
  /** User id to user name. */
  readonly userNames: Map<string, string>;
  /** Every store call, with the `CurrentRun` value at the time of the call. */
  readonly calls: ReadonlyArray<{ readonly method: string; readonly run: string | undefined }>;
  /** When true, `updateCounter` returns false and changes nothing. */
  failCounterUpdates: boolean;
}

/** An in-memory `PasskeyStore` for tests. */
export const makeMemoryPasskeyStore = (): MemoryPasskeyStore => {
  const passkeys = new Map<string, StoredPasskey>();
  const userNames = new Map<string, string>();
  const calls: Array<{ readonly method: string; readonly run: string | undefined }> = [];

  const state = { failCounterUpdates: false };

  const record = (method: string) =>
    Effect.gen(function* () {
      calls.push({ method, run: yield* CurrentRun });
    });

  const layer = Layer.succeed(PasskeyStore)({
    findPasskey: (credentialId) =>
      Effect.gen(function* () {
        yield* record('findPasskey');
        return Option.fromUndefinedOr(passkeys.get(credentialId));
      }),
    listPasskeys: (userId) =>
      Effect.gen(function* () {
        yield* record('listPasskeys');
        return [...passkeys.values()].filter((passkey) => passkey.userId === userId);
      }),
    createPasskey: (passkey) =>
      Effect.gen(function* () {
        yield* record('createPasskey');
        if (passkeys.has(passkey.credentialId)) {
          return CreatePasskeyResult.Duplicate;
        }
        passkeys.set(passkey.credentialId, passkey);
        return CreatePasskeyResult.Created;
      }),
    updateCounter: (credentialId, expected, next, usedAt) =>
      Effect.gen(function* () {
        yield* record('updateCounter');
        const stored = passkeys.get(credentialId);
        if (state.failCounterUpdates || stored === undefined || stored.counter !== expected) {
          return false;
        }
        passkeys.set(credentialId, { ...stored, counter: next, lastUsedAt: usedAt });
        return true;
      }),
    deletePasskey: (userId, credentialId, keepLast) =>
      Effect.gen(function* () {
        yield* record('deletePasskey');
        const stored = passkeys.get(credentialId);
        if (stored === undefined || stored.userId !== userId) {
          return DeletePasskeyResult.NotFound;
        }
        const owned = [...passkeys.values()].filter((passkey) => passkey.userId === userId);
        if (keepLast && owned.length === 1) {
          return DeletePasskeyResult.LastPasskey;
        }
        passkeys.delete(credentialId);
        return DeletePasskeyResult.Deleted;
      }),
    userName: (userId) =>
      Effect.gen(function* () {
        yield* record('userName');
        return Option.fromUndefinedOr(userNames.get(userId));
      }),
  });

  return {
    layer,
    passkeys,
    userNames,
    calls,
    get failCounterUpdates() {
      return state.failCounterUpdates;
    },
    set failCounterUpdates(value: boolean) {
      state.failCounterUpdates = value;
    },
  };
};
