// SPDX-License-Identifier: MIT

import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { Clock, Effect, Option } from 'effect';
import {
  PasskeyAlreadyRegistered,
  PasskeyChallengeInvalid,
  PasskeyLastCredential,
  PasskeyUnknownCredential,
  PasskeyVerificationFailed,
} from '../api/errors';
import type {
  AuthenticationResponse,
  Passkey,
  PasskeyChallenge,
  RegistrationResponse,
} from '../api/schemas';
import { ChallengePurpose, PasskeyChallenges } from './challenges';
import { PasskeyConfig } from './config';
import {
  CreatePasskeyResult,
  DeletePasskeyResult,
  PasskeyStore,
  type StoredPasskey,
} from './store';
import { PasskeyUnitOfWork } from './unit-of-work';
import {
  generateAuthentication,
  generateRegistration,
  verifyAuthentication,
  verifyRegistration,
} from './webauthn';

const MAX_USER_ID_BYTES = 64;

/** A verified registration: the new account's identity and its first passkey, not yet stored. */
export interface VerifiedRegistration {
  readonly userId: string;
  readonly userName: string;
  readonly passkey: StoredPasskey;
}

/** A passkey that `removePasskey` just deleted. */
export interface RemovedPasskey {
  readonly userId: string;
  readonly credentialId: string;
}

/** The passkey as it is shown to its owner. */
export const toPasskey = (stored: StoredPasskey): Passkey => ({
  credentialId: stored.credentialId,
  name: stored.name,
  createdAt: stored.createdAt,
  lastUsedAt: stored.lastUsedAt,
  backedUp: stored.backedUp,
});

const ensureUserId = (userId: string): Effect.Effect<void> =>
  userId.length === 0 || new TextEncoder().encode(userId).length > MAX_USER_ID_BYTES
    ? Effect.die(new Error(`The user id must be 1 to ${MAX_USER_ID_BYTES} UTF-8 bytes`))
    : Effect.void;

const takeChallenge = (challengeId: string) =>
  Effect.gen(function* () {
    const challenges = yield* PasskeyChallenges;
    return yield* challenges.take(challengeId);
  });

/**
 * Starts the registration of a new user. Dies when the user id is empty or longer than 64
 * UTF-8 bytes, or the user name is blank.
 */
export const beginRegistration = (input: {
  readonly userId: string;
  readonly userName: string;
}): Effect.Effect<PasskeyChallenge, never, PasskeyConfig | PasskeyChallenges> =>
  Effect.gen(function* () {
    yield* ensureUserId(input.userId);
    if (input.userName.trim().length === 0) {
      return yield* Effect.die(new Error('The user name must not be blank'));
    }
    const challenges = yield* PasskeyChallenges;
    const options = yield* generateRegistration({
      userId: input.userId,
      userName: input.userName,
      excludeCredentials: [],
    });
    yield* challenges.put(options.challenge, {
      purpose: ChallengePurpose.Register,
      challenge: options.challenge,
      userId: input.userId,
      userName: input.userName,
    });
    return { challengeId: options.challenge, options };
  });

/** Verifies a registration. Persists nothing: the host stores the first passkey with the new account. */
export const finishRegistration = (input: {
  readonly challengeId: string;
  readonly response: RegistrationResponse;
}): Effect.Effect<
  VerifiedRegistration,
  PasskeyChallengeInvalid | PasskeyVerificationFailed,
  PasskeyConfig | PasskeyChallenges
> =>
  Effect.gen(function* () {
    const config = yield* PasskeyConfig;
    const entry = yield* takeChallenge(input.challengeId);
    if (Option.isNone(entry) || entry.value.purpose !== ChallengePurpose.Register) {
      return yield* Effect.fail(new PasskeyChallengeInvalid());
    }
    const { challenge, userId, userName } = entry.value;
    if (input.response.rawId !== input.response.id) {
      return yield* Effect.fail(new PasskeyVerificationFailed());
    }
    const verified = yield* verifyRegistration(input.response, challenge);
    const now = yield* Clock.currentTimeMillis;
    return {
      userId,
      userName,
      passkey: {
        userId,
        ...verified,
        name: config.defaultPasskeyName,
        createdAt: now,
        lastUsedAt: null,
      },
    };
  });

/** Starts a sign-in with a discoverable passkey. */
export const beginAuthentication = (): Effect.Effect<
  PasskeyChallenge,
  never,
  PasskeyConfig | PasskeyChallenges
> =>
  Effect.gen(function* () {
    const challenges = yield* PasskeyChallenges;
    const options = yield* generateAuthentication;
    yield* challenges.put(options.challenge, {
      purpose: ChallengePurpose.Authenticate,
      challenge: options.challenge,
    });
    return { challengeId: options.challenge, options };
  });

/**
 * Verifies a sign-in. The counter update and `onAuthenticated` run in one unit of work for
 * the passkey's user; the hook's result or failure is returned.
 */
export const finishAuthentication = <A, E, R>(
  input: { readonly challengeId: string; readonly response: AuthenticationResponse },
  onAuthenticated: (passkey: StoredPasskey) => Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | PasskeyChallengeInvalid | PasskeyVerificationFailed | PasskeyUnknownCredential,
  R | PasskeyConfig | PasskeyChallenges | PasskeyStore | PasskeyUnitOfWork
> =>
  Effect.gen(function* () {
    const store = yield* PasskeyStore;
    const unitOfWork = yield* PasskeyUnitOfWork;
    const entry = yield* takeChallenge(input.challengeId);
    if (Option.isNone(entry) || entry.value.purpose !== ChallengePurpose.Authenticate) {
      return yield* Effect.fail(new PasskeyChallengeInvalid());
    }
    const { response } = input;
    if (response.rawId !== response.id) {
      return yield* Effect.fail(new PasskeyVerificationFailed());
    }
    const found = yield* store.findPasskey(response.id);
    if (Option.isNone(found)) {
      return yield* Effect.fail(new PasskeyUnknownCredential());
    }
    const stored = found.value;
    const userHandle = response.response.userHandle;
    if (userHandle !== undefined && userHandle !== isoBase64URL.fromUTF8String(stored.userId)) {
      return yield* Effect.fail(new PasskeyVerificationFailed());
    }
    const newCounter = yield* verifyAuthentication(response, entry.value.challenge, stored);
    const now = yield* Clock.currentTimeMillis;
    return yield* unitOfWork.run(
      stored.userId,
      Effect.gen(function* () {
        const updated = yield* store.updateCounter(
          stored.credentialId,
          stored.counter,
          newCounter,
          now,
        );
        if (!updated) {
          return yield* Effect.fail(new PasskeyVerificationFailed());
        }
        return yield* onAuthenticated({ ...stored, counter: newCounter, lastUsedAt: now });
      }),
    );
  });

/** Starts the registration of one more passkey for a signed-in user. Dies when the user is unknown. */
export const beginAddPasskey = (
  userId: string,
): Effect.Effect<PasskeyChallenge, never, PasskeyConfig | PasskeyChallenges | PasskeyStore> =>
  Effect.gen(function* () {
    const store = yield* PasskeyStore;
    const challenges = yield* PasskeyChallenges;
    const userName = yield* store.userName(userId);
    if (Option.isNone(userName)) {
      return yield* Effect.die(new Error('The user does not exist'));
    }
    const existing = yield* store.listPasskeys(userId);
    const options = yield* generateRegistration({
      userId,
      userName: userName.value,
      excludeCredentials: existing.map((passkey) => ({
        id: passkey.credentialId,
        transports: [...passkey.transports],
      })),
    });
    yield* challenges.put(options.challenge, {
      purpose: ChallengePurpose.Add,
      challenge: options.challenge,
      userId,
    });
    return { challengeId: options.challenge, options };
  });

/**
 * Verifies the registration of one more passkey and stores it. `recheck` runs first inside
 * the unit of work, before the passkey is stored, so its failure stores nothing and is
 * returned unchanged.
 */
export const finishAddPasskey = <E = never, R = never>(
  userId: string,
  input: {
    readonly challengeId: string;
    readonly response: RegistrationResponse;
    readonly name?: string;
  },
  recheck: Effect.Effect<void, E, R> = Effect.void,
): Effect.Effect<
  Passkey,
  PasskeyChallengeInvalid | PasskeyVerificationFailed | PasskeyAlreadyRegistered | E,
  R | PasskeyConfig | PasskeyChallenges | PasskeyStore | PasskeyUnitOfWork
> =>
  Effect.gen(function* () {
    const config = yield* PasskeyConfig;
    const store = yield* PasskeyStore;
    const unitOfWork = yield* PasskeyUnitOfWork;
    const entry = yield* takeChallenge(input.challengeId);
    if (
      Option.isNone(entry) ||
      entry.value.purpose !== ChallengePurpose.Add ||
      entry.value.userId !== userId
    ) {
      return yield* Effect.fail(new PasskeyChallengeInvalid());
    }
    if (input.response.rawId !== input.response.id) {
      return yield* Effect.fail(new PasskeyVerificationFailed());
    }
    const verified = yield* verifyRegistration(input.response, entry.value.challenge);
    const now = yield* Clock.currentTimeMillis;
    const passkey: StoredPasskey = {
      userId,
      ...verified,
      name: input.name?.trim() ?? config.defaultPasskeyName,
      createdAt: now,
      lastUsedAt: null,
    };
    const created = yield* unitOfWork.run(
      userId,
      Effect.andThen(recheck, store.createPasskey(passkey)),
    );
    if (created === CreatePasskeyResult.Duplicate) {
      return yield* Effect.fail(new PasskeyAlreadyRegistered());
    }
    return toPasskey(passkey);
  });

/** The user's passkeys, oldest first, ties broken by credential id. */
export const listPasskeys = (
  userId: string,
): Effect.Effect<ReadonlyArray<Passkey>, never, PasskeyStore> =>
  Effect.gen(function* () {
    const store = yield* PasskeyStore;
    const stored = yield* store.listPasskeys(userId);
    return [...stored]
      .sort(
        (a, b) =>
          a.createdAt - b.createdAt ||
          (a.credentialId < b.credentialId ? -1 : a.credentialId > b.credentialId ? 1 : 0),
      )
      .map(toPasskey);
  });

/**
 * Removes one of the user's passkeys. `recheck` runs first inside the unit of work, so its
 * failure removes nothing and is returned unchanged. `onRemoved` runs inside the same unit of
 * work, after the deletion.
 */
export const removePasskey = <R = never, E = never, R2 = never>(
  userId: string,
  credentialId: string,
  onRemoved?: (removed: RemovedPasskey) => Effect.Effect<void, never, R>,
  recheck: Effect.Effect<void, E, R2> = Effect.void,
): Effect.Effect<
  void,
  PasskeyUnknownCredential | PasskeyLastCredential | E,
  R | R2 | PasskeyConfig | PasskeyStore | PasskeyUnitOfWork
> =>
  Effect.gen(function* () {
    const config = yield* PasskeyConfig;
    const store = yield* PasskeyStore;
    const unitOfWork = yield* PasskeyUnitOfWork;
    yield* unitOfWork.run(
      userId,
      Effect.gen(function* () {
        yield* recheck;
        const result = yield* store.deletePasskey(userId, credentialId, config.keepLastPasskey);
        if (result === DeletePasskeyResult.NotFound) {
          return yield* Effect.fail(new PasskeyUnknownCredential());
        }
        if (result === DeletePasskeyResult.LastPasskey) {
          return yield* Effect.fail(new PasskeyLastCredential());
        }
        if (onRemoved !== undefined) {
          yield* onRemoved({ userId, credentialId });
        }
      }),
    );
  });
