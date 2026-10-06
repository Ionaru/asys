// SPDX-License-Identifier: EUPL-1.2
import { inject, Service } from '@angular/core';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

import { Api } from '../../../generated/api/api';
import { accountMe } from '../../../generated/api/fn/account/account-me';
import { accountRegenerateRecoveryCodes } from '../../../generated/api/fn/account/account-regenerate-recovery-codes';
import { accountSignOut } from '../../../generated/api/fn/account/account-sign-out';
import { authRecover } from '../../../generated/api/fn/auth/auth-recover';
import { passkeysAddOptions } from '../../../generated/api/fn/passkeys/passkeys-add-options';
import { passkeysAdd } from '../../../generated/api/fn/passkeys/passkeys-add';
import { passkeysAuthenticateOptions } from '../../../generated/api/fn/passkeys/passkeys-authenticate-options';
import { passkeysAuthenticate } from '../../../generated/api/fn/passkeys/passkeys-authenticate';
import { passkeysList } from '../../../generated/api/fn/passkeys/passkeys-list';
import { passkeysRegisterOptions } from '../../../generated/api/fn/passkeys/passkeys-register-options';
import { passkeysRegister } from '../../../generated/api/fn/passkeys/passkeys-register';
import { passkeysRemove } from '../../../generated/api/fn/passkeys/passkeys-remove';
import { callApi, HttpOutcomeTag } from './http-outcome';
import { toWire } from './wire';

/** Whether an auth call succeeded. */
export enum AuthResultTag {
  Ok = 'Ok',
  Failed = 'Failed',
}

/** Why an auth call failed, in terms the screens can act on. */
export enum AuthError {
  SignUpLinkInvalid = 'SignUpLinkInvalid',
  ChallengeInvalid = 'ChallengeInvalid',
  VerificationFailed = 'VerificationFailed',
  AlreadyRegistered = 'AlreadyRegistered',
  UnknownCredential = 'UnknownCredential',
  LastPasskey = 'LastPasskey',
  SignInFailed = 'SignInFailed',
  Unauthorized = 'Unauthorized',
  Network = 'Network',
  Unexpected = 'Unexpected',
}

/** The result of an auth call. */
export type AuthResult<T> =
  | { readonly _tag: AuthResultTag.Ok; readonly value: T }
  | { readonly _tag: AuthResultTag.Failed; readonly error: AuthError };

/** A server-issued challenge with the WebAuthn options to run it. */
export interface CeremonyOptions<O> {
  readonly challengeId: string;
  readonly options: O;
}

/** The signed-in Owner. */
export interface Me {
  readonly name: string;
  readonly recoveryCodesLeft: number;
}

/** Freshly issued recovery codes. */
export interface RecoveryCodes {
  readonly recoveryCodes: readonly string[];
}

/** What a successful recovery reports. */
export interface RecoverResult {
  readonly recoveryCodesLeft: number;
}

/** A registered passkey. */
export interface Passkey {
  readonly credentialId: string;
  readonly name: string;
  readonly createdAt: number;
  readonly lastUsedAt: number | null;
  readonly backedUp: boolean;
}

const HTTP_UNAUTHORIZED = 401;

const ERROR_BY_TAG: Readonly<Record<string, AuthError>> = {
  SignUpLinkInvalid: AuthError.SignUpLinkInvalid,
  PasskeyChallengeInvalid: AuthError.ChallengeInvalid,
  PasskeyVerificationFailed: AuthError.VerificationFailed,
  PasskeyAlreadyRegistered: AuthError.AlreadyRegistered,
  PasskeyUnknownCredential: AuthError.UnknownCredential,
  PasskeyLastCredential: AuthError.LastPasskey,
  SignInFailed: AuthError.SignInFailed,
  Unauthorized: AuthError.Unauthorized,
};

const failed = <T>(error: AuthError): AuthResult<T> => ({ _tag: AuthResultTag.Failed, error });

const errorOf = (
  status: number,
  errorTag: string | null,
  bodylessUnauthorized: boolean,
): AuthError => {
  const known = errorTag === null ? undefined : ERROR_BY_TAG[errorTag];

  if (known !== undefined) {
    return known;
  }

  if (status === 0) {
    return AuthError.Network;
  }

  if (bodylessUnauthorized && status === HTTP_UNAUTHORIZED && errorTag === null) {
    return AuthError.Unauthorized;
  }

  return AuthError.Unexpected;
};

/** The passkey and account endpoints. Never rejects, keeps and logs nothing. */
@Service()
export class AuthApi {
  private readonly api = inject(Api);

  /** `POST /v1/auth/register/options`. */
  registerOptions(
    token: string,
    name: string,
  ): Promise<AuthResult<CeremonyOptions<PublicKeyCredentialCreationOptionsJSON>>> {
    return this.run(this.api.invoke(passkeysRegisterOptions, { body: { token, name } }));
  }

  /** `POST /v1/auth/register`. */
  register(
    token: string,
    timeZone: string,
    challengeId: string,
    response: RegistrationResponseJSON,
  ): Promise<AuthResult<RecoveryCodes>> {
    return this.run(
      this.api.invoke(passkeysRegister, {
        body: { token, timeZone, challengeId, response: toWire(response) },
      }),
    );
  }

  /** `POST /v1/auth/authenticate/options`. */
  authenticateOptions(): Promise<
    AuthResult<CeremonyOptions<PublicKeyCredentialRequestOptionsJSON>>
  > {
    return this.run(this.api.invoke(passkeysAuthenticateOptions));
  }

  /** `POST /v1/auth/authenticate`. */
  authenticate(challengeId: string, response: AuthenticationResponseJSON): Promise<AuthResult<Me>> {
    return this.run(
      this.api.invoke(passkeysAuthenticate, { body: { challengeId, response: toWire(response) } }),
    );
  }

  /** `POST /v1/auth/recover`. */
  recover(code: string): Promise<AuthResult<RecoverResult>> {
    return this.run(this.api.invoke(authRecover, { body: { code } }));
  }

  /** `GET /v1/auth/me`. */
  me(): Promise<AuthResult<Me>> {
    return this.run(this.api.invoke(accountMe));
  }

  /** `POST /v1/auth/signout`. */
  signOut(): Promise<AuthResult<void>> {
    return this.runVoid(this.api.invoke(accountSignOut));
  }

  /** `POST /v1/auth/recovery-codes`. */
  regenerateRecoveryCodes(): Promise<AuthResult<RecoveryCodes>> {
    return this.run(this.api.invoke(accountRegenerateRecoveryCodes));
  }

  /** `GET /v1/auth/passkeys`. */
  passkeys(): Promise<AuthResult<readonly Passkey[]>> {
    return this.run(this.api.invoke(passkeysList));
  }

  /** `POST /v1/auth/passkeys/options`. */
  addOptions(): Promise<AuthResult<CeremonyOptions<PublicKeyCredentialCreationOptionsJSON>>> {
    return this.run(this.api.invoke(passkeysAddOptions));
  }

  /** `POST /v1/auth/passkeys`. */
  addPasskey(
    challengeId: string,
    response: RegistrationResponseJSON,
    name?: string,
  ): Promise<AuthResult<Passkey>> {
    return this.run(
      this.api.invoke(passkeysAdd, {
        body: { challengeId, response: toWire(response), ...(name === undefined ? {} : { name }) },
      }),
      true,
    );
  }

  /** `DELETE /v1/auth/passkeys/<credentialId>`. */
  removePasskey(credentialId: string): Promise<AuthResult<void>> {
    return this.runVoid(this.api.invoke(passkeysRemove, { credentialId }), true);
  }

  private async run<T>(call: Promise<T>, bodylessUnauthorized = false): Promise<AuthResult<T>> {
    const outcome = await callApi(call);

    if (outcome._tag === HttpOutcomeTag.Ok) {
      return { _tag: AuthResultTag.Ok, value: outcome.value };
    }

    return failed(errorOf(outcome.status, outcome.errorTag, bodylessUnauthorized));
  }

  /** The generated void calls keep the text body of the response, so the value is dropped here. */
  private runVoid(call: Promise<void>, bodylessUnauthorized = false): Promise<AuthResult<void>> {
    return this.run(
      call.then(() => undefined),
      bodylessUnauthorized,
    );
  }
}
