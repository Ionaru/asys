// SPDX-License-Identifier: EUPL-1.2
import { Service } from '@angular/core';
import {
  createPasskey,
  passkeysSupported,
  usePasskey,
  type CeremonyResult,
} from '@ionaru/effect-passkeys/client';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

/** The only seam for WebAuthn ceremonies; tests override it. */
@Service()
export class PasskeyCeremony {
  /** Whether this browser can run a passkey ceremony. */
  supported(): boolean {
    return passkeysSupported();
  }

  /** Creates a passkey from server-issued registration options. */
  create(
    options: PublicKeyCredentialCreationOptionsJSON,
  ): Promise<CeremonyResult<RegistrationResponseJSON>> {
    return createPasskey(options);
  }

  /** Signs in with a passkey from server-issued authentication options. */
  use(
    options: PublicKeyCredentialRequestOptionsJSON,
  ): Promise<CeremonyResult<AuthenticationResponseJSON>> {
    return usePasskey(options);
  }
}
