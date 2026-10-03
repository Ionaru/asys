// SPDX-License-Identifier: MIT

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

export enum PasskeyFailure {
  Cancelled = 'cancelled',
  AlreadyRegistered = 'already_registered',
  Unsupported = 'unsupported',
  Misconfigured = 'misconfigured',
  Failed = 'failed',
}

export enum CeremonyResultTag {
  Ok = 'Ok',
  Failed = 'Failed',
}

export type CeremonyResult<T> =
  | { readonly _tag: CeremonyResultTag.Ok; readonly response: T }
  | {
      readonly _tag: CeremonyResultTag.Failed;
      readonly failure: PasskeyFailure;
      readonly cause: unknown;
    };

const cancelledNames: ReadonlySet<string> = new Set(['NotAllowedError', 'AbortError']);

const unsupportedCodes: ReadonlySet<string> = new Set([
  'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT',
  'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT',
  'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG',
]);

const misconfiguredCodes: ReadonlySet<string> = new Set([
  'ERROR_INVALID_DOMAIN',
  'ERROR_INVALID_RP_ID',
  'ERROR_INVALID_USER_ID_LENGTH',
  'ERROR_MALFORMED_PUBKEYCREDPARAMS',
]);

// A raw DOMException has a numeric legacy `code` (0, 11, 18 ...), so only a string counts.
const readString = (value: unknown, key: string): string | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const field = (value as Record<string, unknown>)[key];

  return typeof field === 'string' ? field : undefined;
};

export const toPasskeyFailure = (error: unknown): PasskeyFailure => {
  const code = readString(error, 'code');
  const name = readString(error, 'name');

  if (name !== undefined && cancelledNames.has(name)) {
    return PasskeyFailure.Cancelled;
  }

  if (code === 'ERROR_CEREMONY_ABORTED') {
    return PasskeyFailure.Cancelled;
  }

  if (code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY') {
    const causeName = readString((error as { cause?: unknown }).cause, 'name');

    return causeName === 'NotAllowedError' ? PasskeyFailure.Cancelled : PasskeyFailure.Failed;
  }

  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return PasskeyFailure.AlreadyRegistered;
  }

  if (code !== undefined && unsupportedCodes.has(code)) {
    return PasskeyFailure.Unsupported;
  }

  if (code !== undefined && misconfiguredCodes.has(code)) {
    return PasskeyFailure.Misconfigured;
  }

  return PasskeyFailure.Failed;
};

export const passkeysSupported = (): boolean => browserSupportsWebAuthn();

const failed = <T>(failure: PasskeyFailure, cause: unknown): CeremonyResult<T> => ({
  _tag: CeremonyResultTag.Failed,
  failure,
  cause,
});

export const createPasskey = async (
  optionsJSON: PublicKeyCredentialCreationOptionsJSON,
): Promise<CeremonyResult<RegistrationResponseJSON>> => {
  if (!passkeysSupported()) {
    return failed(PasskeyFailure.Unsupported, undefined);
  }

  try {
    return { _tag: CeremonyResultTag.Ok, response: await startRegistration({ optionsJSON }) };
  } catch (error) {
    return failed(toPasskeyFailure(error), error);
  }
};

export const usePasskey = async (
  optionsJSON: PublicKeyCredentialRequestOptionsJSON,
): Promise<CeremonyResult<AuthenticationResponseJSON>> => {
  if (!passkeysSupported()) {
    return failed(PasskeyFailure.Unsupported, undefined);
  }

  try {
    return { _tag: CeremonyResultTag.Ok, response: await startAuthentication({ optionsJSON }) };
  } catch (error) {
    return failed(toPasskeyFailure(error), error);
  }
};
