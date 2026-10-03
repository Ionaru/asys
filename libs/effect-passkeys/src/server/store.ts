// SPDX-License-Identifier: MIT

import { Context, type Effect, type Option } from 'effect';

/** A passkey as the host stores it. */
export interface StoredPasskey {
  readonly userId: string;
  /** The credential id, base64url. */
  readonly credentialId: string;
  /** The COSE public key, base64url. */
  readonly publicKey: string;
  /** An unsigned 32-bit value; hosts store it in a 64-bit column. */
  readonly counter: number;
  readonly transports: ReadonlyArray<string>;
  readonly backedUp: boolean;
  readonly name: string;
  /** Epoch milliseconds. */
  readonly createdAt: number;
  /** Epoch milliseconds, or null when the passkey was never used to authenticate. */
  readonly lastUsedAt: number | null;
}

/** The outcome of `PasskeyStore.createPasskey`. */
export enum CreatePasskeyResult {
  Created = 'created',
  Duplicate = 'duplicate',
}

/** The outcome of `PasskeyStore.deletePasskey`. */
export enum DeletePasskeyResult {
  Deleted = 'deleted',
  NotFound = 'not_found',
  LastPasskey = 'last_passkey',
}

/**
 * The storage port the host implements. Methods have no error channel: the host turns its
 * own failures into defects.
 */
export class PasskeyStore extends Context.Service<
  PasskeyStore,
  {
    /** The passkey with this credential id, whichever user owns it. */
    readonly findPasskey: (credentialId: string) => Effect.Effect<Option.Option<StoredPasskey>>;
    /** The passkeys of one user, in any order. */
    readonly listPasskeys: (userId: string) => Effect.Effect<ReadonlyArray<StoredPasskey>>;
    /** Duplicate when the credential id is already stored (for any user); nothing is written then. */
    readonly createPasskey: (passkey: StoredPasskey) => Effect.Effect<CreatePasskeyResult>;
    /**
     * Compare-and-set: sets counter = next and lastUsedAt = usedAt only when the stored
     * counter equals expected. True when it did.
     */
    readonly updateCounter: (
      credentialId: string,
      expected: number,
      next: number,
      usedAt: number,
    ) => Effect.Effect<boolean>;
    /**
     * Atomic. NotFound when the user has no passkey with that id; LastPasskey (nothing
     * deleted) when keepLast is set and it is the user's only passkey; otherwise Deleted.
     */
    readonly deletePasskey: (
      userId: string,
      credentialId: string,
      keepLast: boolean,
    ) => Effect.Effect<DeletePasskeyResult>;
    /** The display name of the user, or none when the user does not exist. */
    readonly userName: (userId: string) => Effect.Effect<Option.Option<string>>;
  }
>()('effect-passkeys/PasskeyStore') {}
