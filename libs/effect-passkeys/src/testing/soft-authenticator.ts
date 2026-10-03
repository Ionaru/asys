// SPDX-License-Identifier: MIT

import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import type { AuthenticationResponse, PasskeyOptions, RegistrationResponse } from '../api/schemas';

export interface SoftCredential {
  /** Base64url credential id. */
  readonly id: string;
  /** Base64url user handle from the creation options' `user.id`. */
  readonly userHandle: string;
  /** The authenticator's current signature counter. */
  counter: number;
}

export interface SoftRegisterOverrides {
  readonly origin?: string;
  readonly rpId?: string;
  readonly challenge?: string;
  /** Default UP | UV | AT = 0x45; BE = 0x08, BS = 0x10. */
  readonly flags?: number;
  /** COSE algorithm written into the key, default -7 (ES256). */
  readonly alg?: number;
  /** In bytes, default 16. */
  readonly credentialIdLength?: number;
  /** Written into `response.transports`; left out when not given. */
  readonly transports?: ReadonlyArray<string>;
}

export interface SoftAuthenticateOverrides {
  readonly origin?: string;
  readonly rpId?: string;
  readonly challenge?: string;
  /** Default UP | UV = 0x05. */
  readonly flags?: number;
  /** Default: the credential's counter + 1. The credential keeps the counter that was signed. */
  readonly counter?: number;
  /** Default: the credential's user handle; null leaves it out. */
  readonly userHandle?: string | null;
  /** Overrides `response.id` only; `rawId` stays the credential's. */
  readonly id?: string;
  /** Flips a byte of the signature. */
  readonly tamper?: boolean;
}

export interface SoftAuthenticator {
  readonly register: (
    options: PasskeyOptions,
    overrides?: SoftRegisterOverrides,
  ) => { readonly response: RegistrationResponse; readonly credential: SoftCredential };
  readonly authenticate: (
    options: PasskeyOptions,
    credential: SoftCredential,
    overrides?: SoftAuthenticateOverrides,
  ) => AuthenticationResponse;
}

const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_AT = 0x40;

const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

const sha256 = (data: Uint8Array | string): Buffer => createHash('sha256').update(data).digest();

const cborHead = (major: number, value: number): Buffer => {
  if (value < 24) {
    return Buffer.from([(major << 5) | value]);
  }
  if (value < 256) {
    return Buffer.from([(major << 5) | 24, value]);
  }
  return Buffer.from([(major << 5) | 25, value >> 8, value & 255]);
};

const cborInt = (value: number): Buffer =>
  value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);

const cborBytes = (bytes: Buffer): Buffer => Buffer.concat([cborHead(2, bytes.length), bytes]);

const cborText = (text: string): Buffer => {
  const bytes = Buffer.from(text);
  return Buffer.concat([cborHead(3, bytes.length), bytes]);
};

const cborMap = (pairs: ReadonlyArray<readonly [Buffer, Buffer]>): Buffer =>
  Buffer.concat([cborHead(5, pairs.length), ...pairs.flat()]);

const uint32 = (value: number): Buffer => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
};

const coseKey = (jwk: { x?: string; y?: string }, alg: number): Buffer =>
  cborMap([
    [cborInt(1), cborInt(2)],
    [cborInt(3), cborInt(alg)],
    [cborInt(-1), cborInt(1)],
    [cborInt(-2), cborBytes(Buffer.from(jwk.x ?? '', 'base64url'))],
    [cborInt(-3), cborBytes(Buffer.from(jwk.y ?? '', 'base64url'))],
  ]);

interface CreationOptionsShape {
  readonly user: { readonly id: string };
}

/** A software authenticator that builds real, verifiable ES256 WebAuthn responses. */
export const makeSoftAuthenticator = (defaults: {
  readonly origin: string;
  readonly rpId: string;
}): SoftAuthenticator => {
  const keys = new Map<string, KeyObject>();

  const register: SoftAuthenticator['register'] = (options, overrides = {}) => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const credentialId = randomBytes(overrides.credentialIdLength ?? 16);
    const id = base64url(credentialId);
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(credentialId.length);

    const authData = Buffer.concat([
      sha256(overrides.rpId ?? defaults.rpId),
      Buffer.from([overrides.flags ?? FLAG_UP | FLAG_UV | FLAG_AT]),
      uint32(0),
      Buffer.alloc(16),
      idLength,
      credentialId,
      coseKey(publicKey.export({ format: 'jwk' }), overrides.alg ?? -7),
    ]);
    const attestationObject = cborMap([
      [cborText('fmt'), cborText('none')],
      [cborText('attStmt'), cborMap([])],
      [cborText('authData'), cborBytes(authData)],
    ]);
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.create',
        challenge: overrides.challenge ?? options.challenge,
        origin: overrides.origin ?? defaults.origin,
        crossOrigin: false,
      }),
    );

    keys.set(id, privateKey);

    return {
      response: {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: base64url(clientDataJSON),
          attestationObject: base64url(attestationObject),
          ...(overrides.transports === undefined ? {} : { transports: overrides.transports }),
        },
      } as RegistrationResponse,
      credential: {
        id,
        userHandle: (options as unknown as CreationOptionsShape).user.id,
        counter: 0,
      },
    };
  };

  const authenticate: SoftAuthenticator['authenticate'] = (options, credential, overrides = {}) => {
    const privateKey = keys.get(credential.id);
    if (privateKey === undefined) {
      throw new Error('The soft authenticator did not create this credential');
    }
    const counter = overrides.counter ?? credential.counter + 1;
    credential.counter = counter;

    const authData = Buffer.concat([
      sha256(overrides.rpId ?? defaults.rpId),
      Buffer.from([overrides.flags ?? FLAG_UP | FLAG_UV]),
      uint32(counter),
    ]);
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: overrides.challenge ?? options.challenge,
        origin: overrides.origin ?? defaults.origin,
        crossOrigin: false,
      }),
    );
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientDataJSON)]), privateKey);
    if (overrides.tamper === true) {
      signature[signature.length - 1] ^= 0x01;
    }
    const userHandle =
      overrides.userHandle === undefined ? credential.userHandle : overrides.userHandle;

    return {
      id: overrides.id ?? credential.id,
      rawId: credential.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: base64url(clientDataJSON),
        authenticatorData: base64url(authData),
        signature: base64url(signature),
        ...(userHandle === null ? {} : { userHandle }),
      },
    } as AuthenticationResponse;
  };

  return { register, authenticate };
};
