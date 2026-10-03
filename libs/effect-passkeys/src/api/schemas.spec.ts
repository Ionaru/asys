// SPDX-License-Identifier: MIT

import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  AuthenticationResponseSchema,
  PasskeyChallengeSchema,
  PasskeyNameSchema,
  RegistrationResponseSchema,
} from './schemas';

const registration = {
  id: 'abc-_123',
  rawId: 'abc-_123',
  type: 'public-key',
  response: { clientDataJSON: 'Y2xpZW50', attestationObject: 'YXR0ZXN0' },
};

const authentication = {
  id: 'abc-_123',
  rawId: 'abc-_123',
  type: 'public-key',
  response: { clientDataJSON: 'Y2xpZW50', authenticatorData: 'YXV0aA', signature: 'c2ln' },
};

const decodeRegistration = Schema.decodeUnknownSync(RegistrationResponseSchema);

const decodeAuthentication = Schema.decodeUnknownSync(AuthenticationResponseSchema);

const decodeName = Schema.decodeUnknownSync(PasskeyNameSchema);

describe('RegistrationResponseSchema', () => {
  it('decodes a complete response and strips unknown keys', () => {
    const decoded = decodeRegistration({ ...registration, clientExtensionResults: {} });

    expect(decoded).toEqual(registration);
    expect(decoded).not.toHaveProperty('clientExtensionResults');
  });

  it('rejects a type other than public-key', () => {
    expect(() => decodeRegistration({ ...registration, type: 'x' })).toThrow(Schema.SchemaError);
  });

  it('rejects an id containing +', () => {
    expect(() => decodeRegistration({ ...registration, id: 'ab+c' })).toThrow(Schema.SchemaError);
  });

  it('rejects an id containing =', () => {
    expect(() => decodeRegistration({ ...registration, id: 'abc=' })).toThrow(Schema.SchemaError);
  });

  it('accepts an id of 1366 characters and rejects one of 1367', () => {
    expect(() => decodeRegistration({ ...registration, id: 'a'.repeat(1366) })).not.toThrow(
      Schema.SchemaError,
    );
    expect(() => decodeRegistration({ ...registration, id: 'a'.repeat(1367) })).toThrow(
      Schema.SchemaError,
    );
  });

  it('decodes 8 transports and rejects 9', () => {
    const withTransports = (count: number) => ({
      ...registration,
      response: {
        ...registration.response,
        transports: Array.from({ length: count }, () => 'usb'),
      },
    });

    expect(decodeRegistration(withTransports(8)).response.transports).toHaveLength(8);
    expect(() => decodeRegistration(withTransports(9))).toThrow(Schema.SchemaError);
  });

  it('rejects an empty id', () => {
    expect(() => decodeRegistration({ ...registration, id: '' })).toThrow(Schema.SchemaError);
  });

  it('rejects a missing response.clientDataJSON', () => {
    expect(() =>
      decodeRegistration({ ...registration, response: { attestationObject: 'YXR0ZXN0' } }),
    ).toThrow(Schema.SchemaError);
  });
});

describe('AuthenticationResponseSchema', () => {
  it('decodes without userHandle', () => {
    expect(decodeAuthentication(authentication)).toEqual(authentication);
  });

  it('decodes with userHandle', () => {
    const withHandle = {
      ...authentication,
      response: { ...authentication.response, userHandle: 'dXNlcg' },
    };

    expect(decodeAuthentication(withHandle)).toEqual(withHandle);
  });
});

describe('PasskeyNameSchema', () => {
  it('accepts 100 characters', () => {
    expect(decodeName('a'.repeat(100))).toBe('a'.repeat(100));
  });

  it('rejects 101 characters', () => {
    expect(() => decodeName('a'.repeat(101))).toThrow(Schema.SchemaError);
  });

  it('rejects whitespace only', () => {
    expect(() => decodeName('   ')).toThrow(Schema.SchemaError);
  });

  it('rejects a NUL character', () => {
    expect(() => decodeName('a\u0000b')).toThrow(Schema.SchemaError);
  });

  it('rejects an unpaired surrogate and accepts a valid pair', () => {
    expect(() => decodeName('a\uD800b')).toThrow(Schema.SchemaError);
    expect(decodeName('a\u{1F600}')).toBe('a\u{1F600}');
  });
});

describe('PasskeyChallengeSchema', () => {
  it('drops undefined-valued option keys when encoding to JSON', () => {
    const encoded = Schema.encodeSync(Schema.toCodecJson(PasskeyChallengeSchema))({
      challengeId: 'abc',
      options: { challenge: 'abc', allowCredentials: undefined },
    });

    expect(JSON.stringify(encoded)).toBe('{"challengeId":"abc","options":{"challenge":"abc"}}');
  });
});
