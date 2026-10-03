// SPDX-License-Identifier: EUPL-1.2
import { Effect, Layer, Fiber } from 'effect';
import { TestClock } from 'effect/testing';
import {
  beginRegistration,
  finishRegistration,
  PasskeyChallenges,
  PasskeyConfig,
  type StoredPasskey,
} from '@ionaru/effect-passkeys/server';
import {
  makeSoftAuthenticator,
  type SoftAuthenticator,
  type SoftCredential,
} from '@ionaru/effect-passkeys/testing';
import { createSignUpLink } from '../auth/sign-up-links';
import { signUp, signUpBegin } from '../auth/sign-up';
import type { passkeys } from '../db/schema';
import { removeOwner } from './owners';

export const SOFT_ORIGIN = 'http://localhost:4200';

export const SOFT_RP_ID = 'localhost';

/** The passkey settings and an in-memory challenge store the sign-up ceremonies run with. */
export const passkeyTestLayer = Layer.mergeAll(
  PasskeyConfig.layer({
    rpId: SOFT_RP_ID,
    rpName: 'ASYS',
    origin: SOFT_ORIGIN,
    keepLastPasskey: true,
    defaultPasskeyName: 'Passkey',
  }),
  PasskeyChallenges.memory(),
);

/** A fresh software authenticator for the test origin. */
export const newSoftAuthenticator = (): SoftAuthenticator =>
  makeSoftAuthenticator({ origin: SOFT_ORIGIN, rpId: SOFT_RP_ID });

/** The library's registration ceremony with a software authenticator, up to a verified registration. */
export const softRegistration = (
  authenticator: SoftAuthenticator,
  who: { readonly userId: string; readonly userName: string },
) =>
  Effect.gen(function* () {
    const challenge = yield* beginRegistration(who);
    const { response, credential } = authenticator.register(challenge.options);
    const registration = yield* finishRegistration({
      challengeId: challenge.challengeId,
      response,
    });

    return { registration, credential };
  });

/** A stored `passkeys` row as the library's `StoredPasskey`. */
export const storedPasskeyOf = (row: typeof passkeys.$inferSelect): StoredPasskey => ({
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

/** Whether a fiber is still running after half a second of real time. */
export const stillRunningAfterHalfSecond = (fiber: Fiber.Fiber<unknown, unknown>) =>
  TestClock.withLive(Effect.sleep('500 millis')).pipe(
    Effect.map(() => fiber.pollUnsafe() === undefined),
  );

/**
 * Signs a new user up through the whole flow: a Sign-up link, the begin step, a registration
 * with a software authenticator and the sign-up itself. The owner is removed when the scope closes.
 */
export const signUpUser = (options: { readonly name?: string; readonly timeZone?: string } = {}) =>
  Effect.gen(function* () {
    const authenticator = newSoftAuthenticator();
    const link = yield* createSignUpLink({ expiresInDays: 7 });
    const { ownerId } = link;
    yield* Effect.addFinalizer(() => removeOwner(ownerId).pipe(Effect.orDie));

    const begun = yield* signUpBegin({ token: link.token, name: options.name ?? 'Test user' });
    const { registration, credential } = yield* softRegistration(authenticator, begun);
    const signedUp = yield* signUp(registration, {
      token: link.token,
      timeZone: options.timeZone ?? 'Europe/Amsterdam',
    });

    return {
      ownerId,
      session: { token: signedUp.session.token, sessionId: signedUp.session.sessionId },
      recoveryCodes: signedUp.recoveryCodes,
      passkey: registration.passkey,
      credential: credential satisfies SoftCredential,
      authenticator,
    };
  });
