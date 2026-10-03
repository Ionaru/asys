// SPDX-License-Identifier: MIT

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import { Effect } from 'effect';
import { PasskeyVerificationFailed } from '../api/errors';
import type { AuthenticationResponse, PasskeyOptions, RegistrationResponse } from '../api/schemas';
import { PasskeyConfig } from './config';
import type { StoredPasskey } from './store';

const SUPPORTED_ALGORITHM_IDS = [-8, -7, -257];

const TIMEOUT_MS = 300_000;

const MAX_CREDENTIAL_ID_BYTES = 1023;

const KNOWN_TRANSPORTS: ReadonlySet<string> = new Set([
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb',
]);

/** What a verified registration yields: the credential as it should be stored. */
export interface VerifiedCredential {
  readonly credentialId: string;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: ReadonlyArray<string>;
  readonly backedUp: boolean;
}

/** Creation options for a user; the options carry the challenge. */
export const generateRegistration = (input: {
  readonly userId: string;
  readonly userName: string;
  readonly excludeCredentials: ReadonlyArray<{
    readonly id: string;
    readonly transports?: string[];
  }>;
}): Effect.Effect<PasskeyOptions, never, PasskeyConfig> =>
  Effect.gen(function* () {
    const config = yield* PasskeyConfig;
    const options = yield* Effect.promise(() =>
      generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpId,
        userID: isoUint8Array.fromUTF8String(input.userId),
        userName: input.userName,
        userDisplayName: input.userName,
        attestationType: 'none',
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        excludeCredentials: input.excludeCredentials.map((credential) => ({ ...credential })),
        supportedAlgorithmIDs: [...SUPPORTED_ALGORITHM_IDS],
        timeout: TIMEOUT_MS,
      }),
    );
    return { ...options };
  });

/** Request options without an allow list: the authenticator picks a discoverable credential. */
export const generateAuthentication: Effect.Effect<PasskeyOptions, never, PasskeyConfig> =
  Effect.gen(function* () {
    const config = yield* PasskeyConfig;
    const options = yield* Effect.promise(() =>
      generateAuthenticationOptions({
        rpID: config.rpId,
        userVerification: 'required',
        timeout: TIMEOUT_MS,
      }),
    );
    return { ...options };
  });

/** Verifies a registration response. Any throw or unverified result is a PasskeyVerificationFailed. */
export const verifyRegistration = (
  response: RegistrationResponse,
  expectedChallenge: string,
): Effect.Effect<VerifiedCredential, PasskeyVerificationFailed, PasskeyConfig> =>
  Effect.gen(function* () {
    const config = yield* PasskeyConfig;
    const verification = yield* Effect.tryPromise({
      try: () =>
        verifyRegistrationResponse({
          response: {
            ...response,
            response: {
              ...response.response,
              transports:
                response.response.transports === undefined
                  ? undefined
                  : [...response.response.transports],
            },
            clientExtensionResults: {},
          } as Parameters<typeof verifyRegistrationResponse>[0]['response'],
          expectedChallenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
          supportedAlgorithmIDs: [...SUPPORTED_ALGORITHM_IDS],
        }),
      catch: () => new PasskeyVerificationFailed(),
    });
    if (!verification.verified) {
      return yield* Effect.fail(new PasskeyVerificationFailed());
    }
    const { credential, credentialBackedUp } = verification.registrationInfo;
    if (
      credential.id !== response.id ||
      isoBase64URL.toBuffer(credential.id).length > MAX_CREDENTIAL_ID_BYTES
    ) {
      return yield* Effect.fail(new PasskeyVerificationFailed());
    }
    return {
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: (credential.transports ?? []).filter((transport) =>
        KNOWN_TRANSPORTS.has(transport),
      ),
      backedUp: credentialBackedUp,
    };
  });

/** Verifies an authentication response against a stored passkey; yields the new counter. */
export const verifyAuthentication = (
  response: AuthenticationResponse,
  expectedChallenge: string,
  stored: StoredPasskey,
): Effect.Effect<number, PasskeyVerificationFailed, PasskeyConfig> =>
  Effect.gen(function* () {
    const config = yield* PasskeyConfig;
    const verification = yield* Effect.tryPromise({
      try: () =>
        verifyAuthenticationResponse({
          response: { ...response, clientExtensionResults: {} } as Parameters<
            typeof verifyAuthenticationResponse
          >[0]['response'],
          expectedChallenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpId,
          requireUserVerification: true,
          credential: {
            id: stored.credentialId,
            publicKey: isoBase64URL.toBuffer(stored.publicKey),
            counter: stored.counter,
            transports: [...stored.transports],
          },
        }),
      catch: () => new PasskeyVerificationFailed(),
    });
    if (!verification.verified) {
      return yield* Effect.fail(new PasskeyVerificationFailed());
    }
    return verification.authenticationInfo.newCounter;
  });
