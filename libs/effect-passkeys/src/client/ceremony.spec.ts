// SPDX-License-Identifier: MIT

import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  WebAuthnError,
} from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CeremonyResultTag,
  PasskeyFailure,
  createPasskey,
  passkeysSupported,
  toPasskeyFailure,
  usePasskey,
} from './ceremony';

vi.mock('@simplewebauthn/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startRegistration: vi.fn<typeof import('@simplewebauthn/browser').startRegistration>(),
  startAuthentication: vi.fn<typeof import('@simplewebauthn/browser').startAuthentication>(),
  browserSupportsWebAuthn:
    vi.fn<typeof import('@simplewebauthn/browser').browserSupportsWebAuthn>(),
}));

const creationOptions = {
  challenge: 'c',
  rp: { name: 'ASYS' },
  user: { id: 'u', name: 'n', displayName: 'N' },
  pubKeyCredParams: [],
} as PublicKeyCredentialCreationOptionsJSON;

const requestOptions = { challenge: 'c' } as PublicKeyCredentialRequestOptionsJSON;

const registrationResponse = { id: 'reg' } as RegistrationResponseJSON;

const authenticationResponse = { id: 'auth' } as AuthenticationResponseJSON;

const webAuthnError = (code: string, cause: Error): WebAuthnError =>
  new WebAuthnError({ message: 'm', code: code as never, cause });

const cancelledError = (): WebAuthnError =>
  webAuthnError('ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', new DOMException('m', 'NotAllowedError'));

beforeEach(() => {
  vi.mocked(startRegistration).mockReset();
  vi.mocked(startAuthentication).mockReset();
  vi.mocked(browserSupportsWebAuthn).mockReset();
  vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);
});

describe('passkeysSupported', () => {
  it('returns true when the browser supports WebAuthn', () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);

    expect(passkeysSupported()).toBe(true);
  });

  it('returns false when the browser does not support WebAuthn', () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);

    expect(passkeysSupported()).toBe(false);
  });
});

describe('toPasskeyFailure', () => {
  it.each([
    ['NotAllowedError DOMException', new DOMException('m', 'NotAllowedError')],
    ['AbortError DOMException', new DOMException('m', 'AbortError')],
    ['ceremony aborted code', { code: 'ERROR_CEREMONY_ABORTED' }],
    ['passthrough with NotAllowedError cause', cancelledError()],
  ])('maps %s to Cancelled', (_label, error) => {
    expect(toPasskeyFailure(error)).toBe(PasskeyFailure.Cancelled);
  });

  it('maps passthrough with a SecurityError cause to Failed', () => {
    const error = webAuthnError(
      'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
      new DOMException('m', 'SecurityError'),
    );

    expect(toPasskeyFailure(error)).toBe(PasskeyFailure.Failed);
  });

  it('maps passthrough without a cause name to Failed', () => {
    expect(toPasskeyFailure({ code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY' })).toBe(
      PasskeyFailure.Failed,
    );
  });

  it('maps a previously registered authenticator to AlreadyRegistered', () => {
    expect(toPasskeyFailure({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' })).toBe(
      PasskeyFailure.AlreadyRegistered,
    );
  });

  it.each([
    'ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT',
    'ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT',
    'ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG',
  ])('maps %s to Unsupported', (code) => {
    expect(toPasskeyFailure({ code })).toBe(PasskeyFailure.Unsupported);
  });

  it.each([
    'ERROR_INVALID_DOMAIN',
    'ERROR_INVALID_RP_ID',
    'ERROR_INVALID_USER_ID_LENGTH',
    'ERROR_MALFORMED_PUBKEYCREDPARAMS',
  ])('maps %s to Misconfigured', (code) => {
    expect(toPasskeyFailure({ code })).toBe(PasskeyFailure.Misconfigured);
  });

  it('maps a plain object with a misconfiguration code to Misconfigured', () => {
    expect(toPasskeyFailure({ code: 'ERROR_INVALID_RP_ID' })).toBe(PasskeyFailure.Misconfigured);
  });

  it.each([
    ['general authenticator error', { code: 'ERROR_AUTHENTICATOR_GENERAL_ERROR' }],
    ['a string', 'x'],
    ['undefined', undefined],
    ['null', null],
    ['a plain Error', new Error('x')],
    ['a SecurityError DOMException', new DOMException('m', 'SecurityError')],
    ['an object with a numeric code', { code: 18, name: 'SecurityError' }],
  ])('maps %s to Failed', (_label, error) => {
    expect(toPasskeyFailure(error)).toBe(PasskeyFailure.Failed);
  });

  it('gives name precedence over code', () => {
    expect(
      toPasskeyFailure({
        name: 'NotAllowedError',
        code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
      }),
    ).toBe(PasskeyFailure.Cancelled);
  });
});

describe('createPasskey', () => {
  it('resolves Unsupported without starting when WebAuthn is unsupported', async () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);

    await expect(createPasskey(creationOptions)).resolves.toEqual({
      _tag: CeremonyResultTag.Failed,
      failure: PasskeyFailure.Unsupported,
      cause: undefined,
    });
    expect(startRegistration).not.toHaveBeenCalled();
  });

  it('calls startRegistration with only optionsJSON', async () => {
    vi.mocked(startRegistration).mockResolvedValue(registrationResponse);

    await createPasskey(creationOptions);

    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: creationOptions });
    expect(vi.mocked(startRegistration).mock.calls[0]).toHaveLength(1);
  });

  it('resolves Ok with the same response reference', async () => {
    vi.mocked(startRegistration).mockResolvedValue(registrationResponse);

    const result = await createPasskey(creationOptions);

    expect(result._tag).toBe(CeremonyResultTag.Ok);
    expect(result._tag === CeremonyResultTag.Ok && result.response).toBe(registrationResponse);
  });

  it('maps a cancelled ceremony to Cancelled and keeps the cause', async () => {
    const error = cancelledError();
    vi.mocked(startRegistration).mockRejectedValue(error);

    const result = await createPasskey(creationOptions);

    expect(result).toEqual({
      _tag: CeremonyResultTag.Failed,
      failure: PasskeyFailure.Cancelled,
      cause: error,
    });
    expect(result._tag === CeremonyResultTag.Failed && result.cause).toBe(error);
  });

  it('maps an already registered authenticator to AlreadyRegistered', async () => {
    const error = webAuthnError('ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED', new Error('x'));
    vi.mocked(startRegistration).mockRejectedValue(error);

    const result = await createPasskey(creationOptions);

    expect(result._tag === CeremonyResultTag.Failed && result.failure).toBe(
      PasskeyFailure.AlreadyRegistered,
    );
  });

  it.each([new Error('x'), 'boom'])('resolves Failed for the rejection %s', async (error) => {
    vi.mocked(startRegistration).mockRejectedValue(error);

    const result = await createPasskey(creationOptions);

    expect(result._tag).toBe(CeremonyResultTag.Failed);
    expect(result._tag === CeremonyResultTag.Failed && result.failure).toBe(
      toPasskeyFailure(error),
    );
    expect(result._tag === CeremonyResultTag.Failed && result.cause).toBe(error);
  });
});

describe('usePasskey', () => {
  it('resolves Unsupported without starting when WebAuthn is unsupported', async () => {
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);

    await expect(usePasskey(requestOptions)).resolves.toEqual({
      _tag: CeremonyResultTag.Failed,
      failure: PasskeyFailure.Unsupported,
      cause: undefined,
    });
    expect(startAuthentication).not.toHaveBeenCalled();
  });

  it('calls startAuthentication with only optionsJSON', async () => {
    vi.mocked(startAuthentication).mockResolvedValue(authenticationResponse);

    await usePasskey(requestOptions);

    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: requestOptions });
    expect(vi.mocked(startAuthentication).mock.calls[0]).toHaveLength(1);
  });

  it('resolves Ok with the same response reference', async () => {
    vi.mocked(startAuthentication).mockResolvedValue(authenticationResponse);

    const result = await usePasskey(requestOptions);

    expect(result._tag).toBe(CeremonyResultTag.Ok);
    expect(result._tag === CeremonyResultTag.Ok && result.response).toBe(authenticationResponse);
  });

  it('maps a cancelled ceremony to Cancelled and keeps the cause', async () => {
    const error = cancelledError();
    vi.mocked(startAuthentication).mockRejectedValue(error);

    const result = await usePasskey(requestOptions);

    expect(result).toEqual({
      _tag: CeremonyResultTag.Failed,
      failure: PasskeyFailure.Cancelled,
      cause: error,
    });
    expect(result._tag === CeremonyResultTag.Failed && result.cause).toBe(error);
  });

  it.each([new Error('x'), 'boom'])('resolves Failed for the rejection %s', async (error) => {
    vi.mocked(startAuthentication).mockRejectedValue(error);

    const result = await usePasskey(requestOptions);

    expect(result._tag).toBe(CeremonyResultTag.Failed);
    expect(result._tag === CeremonyResultTag.Failed && result.failure).toBe(
      toPasskeyFailure(error),
    );
    expect(result._tag === CeremonyResultTag.Failed && result.cause).toBe(error);
  });
});
