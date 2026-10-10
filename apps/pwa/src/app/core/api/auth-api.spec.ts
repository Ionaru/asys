// SPDX-License-Identifier: EUPL-1.2
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

import { provideApiConfiguration } from '../../../generated/api/api-configuration';
import { AuthApi, AuthError, AuthResultTag, type AuthResult } from './auth-api';

const registrationResponse: RegistrationResponseJSON = {
  id: 'cred-1',
  rawId: 'cred-1',
  type: 'public-key',
  clientExtensionResults: {},
  response: { clientDataJSON: 'cd', attestationObject: 'ao' },
};

const authenticationResponse: AuthenticationResponseJSON = {
  id: 'cred-1',
  rawId: 'cred-1',
  type: 'public-key',
  clientExtensionResults: {},
  response: { clientDataJSON: 'cd', authenticatorData: 'ad', signature: 'sig' },
};

const creationOptions = { challenge: 'abc', rp: { name: 'ASYS' } };

const requestOptions = { challenge: 'xyz', rpId: 'example.test' };

const passkey = {
  credentialId: 'cred-1',
  name: 'Laptop',
  createdAt: 100,
  lastUsedAt: null,
  backedUp: true,
};

const ok = <T>(value: T): AuthResult<T> => ({ _tag: AuthResultTag.Ok, value });

const failed = (error: AuthError): AuthResult<never> => ({ _tag: AuthResultTag.Failed, error });

interface Call {
  readonly name: string;
  readonly run: (api: AuthApi) => Promise<AuthResult<unknown>>;
  readonly method: string;
  readonly url: string;
  /** Text-body operations are flushed with JSON strings. */
  readonly text: boolean;
}

const calls: readonly Call[] = [
  {
    name: 'registerOptions',
    run: (api) => api.registerOptions('tok', 'Ada'),
    method: 'POST',
    url: '/v1/auth/register/options',
    text: false,
  },
  {
    name: 'register',
    run: (api) => api.register('tok', 'Europe/Amsterdam', 'ch-1', registrationResponse),
    method: 'POST',
    url: '/v1/auth/register',
    text: false,
  },
  {
    name: 'authenticateOptions',
    run: (api) => api.authenticateOptions(),
    method: 'POST',
    url: '/v1/auth/authenticate/options',
    text: false,
  },
  {
    name: 'authenticate',
    run: (api) => api.authenticate('ch-1', authenticationResponse),
    method: 'POST',
    url: '/v1/auth/authenticate',
    text: false,
  },
  {
    name: 'recover',
    run: (api) => api.recover('code-1'),
    method: 'POST',
    url: '/v1/auth/recover',
    text: false,
  },
  {
    name: 'me',
    run: (api) => api.me(),
    method: 'GET',
    url: '/v1/auth/me',
    text: false,
  },
  {
    name: 'signOut',
    run: (api) => api.signOut(),
    method: 'POST',
    url: '/v1/auth/signout',
    text: true,
  },
  {
    name: 'regenerateRecoveryCodes',
    run: (api) => api.regenerateRecoveryCodes(),
    method: 'POST',
    url: '/v1/auth/recovery-codes',
    text: false,
  },
  {
    name: 'passkeys',
    run: (api) => api.passkeys(),
    method: 'GET',
    url: '/v1/auth/passkeys',
    text: false,
  },
  {
    name: 'addOptions',
    run: (api) => api.addOptions(),
    method: 'POST',
    url: '/v1/auth/passkeys/options',
    text: false,
  },
  {
    name: 'addPasskey',
    run: (api) => api.addPasskey('ch-1', registrationResponse),
    method: 'POST',
    url: '/v1/auth/passkeys',
    text: false,
  },
  {
    name: 'removePasskey',
    run: (api) => api.removePasskey('cred-1'),
    method: 'DELETE',
    url: '/v1/auth/passkeys/cred-1',
    text: true,
  },
];

const errorTable: readonly (readonly [string, number, AuthError])[] = [
  ['SignUpLinkInvalid', 403, AuthError.SignUpLinkInvalid],
  ['PasskeyChallengeInvalid', 400, AuthError.ChallengeInvalid],
  ['PasskeyVerificationFailed', 400, AuthError.VerificationFailed],
  ['PasskeyAlreadyRegistered', 409, AuthError.AlreadyRegistered],
  ['PasskeyUnknownCredential', 404, AuthError.UnknownCredential],
  ['PasskeyLastCredential', 409, AuthError.LastPasskey],
  ['SignInFailed', 401, AuthError.SignInFailed],
  ['Unauthorized', 401, AuthError.Unauthorized],
];

describe('AuthApi', () => {
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const flushError = (call: Call, status: number, body: object | null): void => {
    const req = http.expectOne({ method: call.method, url: call.url });
    const payload = call.text ? (body === null ? '' : JSON.stringify(body)) : body;

    req.flush(payload, { status, statusText: 'Error' });
  };

  describe('requests and Ok values', () => {
    it('registerOptions posts token and name and returns the ceremony options', async () => {
      const result = api.registerOptions('tok', 'Ada');

      const req = http.expectOne({ method: 'POST', url: '/v1/auth/register/options' });
      expect(req.request.body).toEqual({ token: 'tok', name: 'Ada' });
      req.flush({ challengeId: 'ch-1', options: creationOptions } as object | null);

      expect(await result).toEqual(
        ok({
          challengeId: 'ch-1',
          options: creationOptions as unknown as PublicKeyCredentialCreationOptionsJSON,
        }),
      );
    });

    it('register posts token, timeZone, challengeId and response and returns the codes', async () => {
      const result = api.register('tok', 'Europe/Amsterdam', 'ch-1', registrationResponse);

      const req = http.expectOne({ method: 'POST', url: '/v1/auth/register' });
      expect(req.request.body).toEqual({
        token: 'tok',
        timeZone: 'Europe/Amsterdam',
        challengeId: 'ch-1',
        response: registrationResponse,
      });
      req.flush({ recoveryCodes: ['a', 'b'] } as object | null);

      expect(await result).toEqual(ok({ recoveryCodes: ['a', 'b'] }));
    });

    it('authenticateOptions posts without a body and returns the ceremony options', async () => {
      const result = api.authenticateOptions();

      const req = http.expectOne({ method: 'POST', url: '/v1/auth/authenticate/options' });
      expect(req.request.body).toBeNull();
      req.flush({ challengeId: 'ch-2', options: requestOptions } as object | null);

      expect(await result).toEqual(
        ok({
          challengeId: 'ch-2',
          options: requestOptions as unknown as PublicKeyCredentialRequestOptionsJSON,
        }),
      );
    });

    it('authenticate posts challengeId and response and returns Me', async () => {
      const result = api.authenticate('ch-2', authenticationResponse);

      const req = http.expectOne({ method: 'POST', url: '/v1/auth/authenticate' });
      expect(req.request.body).toEqual({
        challengeId: 'ch-2',
        response: authenticationResponse,
      });
      req.flush({ name: 'Ada', recoveryCodesLeft: 4 } as object | null);

      expect(await result).toEqual(ok({ name: 'Ada', recoveryCodesLeft: 4 }));
    });

    it('recover posts the code and returns the codes left', async () => {
      const result = api.recover('code-1');

      const req = http.expectOne({ method: 'POST', url: '/v1/auth/recover' });
      expect(req.request.body).toEqual({ code: 'code-1' });
      req.flush({ recoveryCodesLeft: 3 } as object | null);

      expect(await result).toEqual(ok({ recoveryCodesLeft: 3 }));
    });

    it('me gets /v1/auth/me', async () => {
      const result = api.me();

      http
        .expectOne({ method: 'GET', url: '/v1/auth/me' })
        .flush({ name: 'Ada', recoveryCodesLeft: 4 } as object | null);

      expect(await result).toEqual(ok({ name: 'Ada', recoveryCodesLeft: 4 }));
    });

    it('signOut posts and returns undefined on 204', async () => {
      const result = api.signOut();

      http
        .expectOne({ method: 'POST', url: '/v1/auth/signout' })
        .flush('', { status: 204, statusText: 'No Content' });

      expect(await result).toEqual(ok(undefined));
    });

    it('regenerateRecoveryCodes posts and returns the codes', async () => {
      const result = api.regenerateRecoveryCodes();

      http
        .expectOne({ method: 'POST', url: '/v1/auth/recovery-codes' })
        .flush({ recoveryCodes: ['x', 'y', 'z'] } as object | null);

      expect(await result).toEqual(ok({ recoveryCodes: ['x', 'y', 'z'] }));
    });

    it('passkeys gets the list', async () => {
      const result = api.passkeys();

      http
        .expectOne({ method: 'GET', url: '/v1/auth/passkeys' })
        .flush([passkey, { ...passkey, credentialId: 'cred-2', lastUsedAt: 50 }]);

      expect(await result).toEqual(
        ok([passkey, { ...passkey, credentialId: 'cred-2', lastUsedAt: 50 }]),
      );
    });

    it('addOptions posts and returns the ceremony options', async () => {
      const result = api.addOptions();

      http
        .expectOne({ method: 'POST', url: '/v1/auth/passkeys/options' })
        .flush({ challengeId: 'ch-3', options: creationOptions } as object | null);

      expect(await result).toEqual(
        ok({
          challengeId: 'ch-3',
          options: creationOptions as unknown as PublicKeyCredentialCreationOptionsJSON,
        }),
      );
    });

    it('addPasskey sends the name when given and returns the Passkey from a 201', async () => {
      const result = api.addPasskey('ch-3', registrationResponse, 'Phone');

      const req = http.expectOne({ method: 'POST', url: '/v1/auth/passkeys' });
      expect(req.request.body).toEqual({
        challengeId: 'ch-3',
        response: registrationResponse,
        name: 'Phone',
      });
      req.flush({ ...passkey, name: 'Phone' } as object | null, {
        status: 201,
        statusText: 'Created',
      });

      expect(await result).toEqual(ok({ ...passkey, name: 'Phone' }));
    });

    it('addPasskey omits the name key when none is given', async () => {
      const result = api.addPasskey('ch-3', registrationResponse);

      const req = http.expectOne({ method: 'POST', url: '/v1/auth/passkeys' });
      expect(req.request.body).toEqual({ challengeId: 'ch-3', response: registrationResponse });
      expect(Object.keys(req.request.body as object)).not.toContain('name');
      req.flush(passkey as object | null, { status: 201, statusText: 'Created' });

      expect(await result).toEqual(ok(passkey));
    });

    it('removePasskey deletes the credential and returns undefined on 204', async () => {
      const result = api.removePasskey('cred-1');

      http
        .expectOne({ method: 'DELETE', url: '/v1/auth/passkeys/cred-1' })
        .flush('', { status: 204, statusText: 'No Content' });

      expect(await result).toEqual(ok(undefined));
    });
  });

  describe('error mapping', () => {
    for (const call of calls) {
      describe(call.name, () => {
        it.each(errorTable)('maps %s to the matching AuthError', async (tag, status, error) => {
          const result = call.run(api);

          flushError(call, status, { _tag: tag });

          expect(await result).toEqual(failed(error));
        });

        it('maps a network failure to Network', async () => {
          const result = call.run(api);

          http
            .expectOne({ method: call.method, url: call.url })
            .error(new ProgressEvent('error'), { status: 0 });

          expect(await result).toEqual(failed(AuthError.Network));
        });

        it.each([
          ['a body-less 400', 400, null],
          ['a body-less 401', 401, null],
          ['a body-less 403', 403, null],
          ['a 500', 500, null],
          ['a 500 with an unknown tag', 500, { _tag: 'Boom' }],
          ['a 409 with an unknown tag', 409, { _tag: 'Boom' }],
        ])('maps %s to Unexpected', async (_name, status, body) => {
          const result = call.run(api);

          flushError(call, status, body);

          expect(await result).toEqual(failed(AuthError.Unexpected));
        });

        it('never rejects', async () => {
          const result = call.run(api);

          http
            .expectOne({ method: call.method, url: call.url })
            .error(new ProgressEvent('error'), { status: 0 });

          await expect(result).resolves.toMatchObject({ _tag: AuthResultTag.Failed });
        });
      });
    }
  });

  describe('text-body operations', () => {
    it('signOut maps a JSON-string Unauthorized body', async () => {
      const result = api.signOut();

      http
        .expectOne({ method: 'POST', url: '/v1/auth/signout' })
        .flush('{"_tag":"Unauthorized"}', { status: 401, statusText: 'Unauthorized' });

      expect(await result).toEqual(failed(AuthError.Unauthorized));
    });

    it('removePasskey maps PasskeyLastCredential from a JSON string to LastPasskey', async () => {
      const result = api.removePasskey('cred-1');

      http
        .expectOne({ method: 'DELETE', url: '/v1/auth/passkeys/cred-1' })
        .flush('{"_tag":"PasskeyLastCredential"}', { status: 409, statusText: 'Conflict' });

      expect(await result).toEqual(failed(AuthError.LastPasskey));
    });

    it('removePasskey maps PasskeyUnknownCredential to UnknownCredential', async () => {
      const result = api.removePasskey('cred-1');

      http
        .expectOne({ method: 'DELETE', url: '/v1/auth/passkeys/cred-1' })
        .flush('{"_tag":"PasskeyUnknownCredential"}', { status: 404, statusText: 'Not Found' });

      expect(await result).toEqual(failed(AuthError.UnknownCredential));
    });

    it('signOut returns undefined whatever text body a 200 carries', async () => {
      const result = api.signOut();

      http
        .expectOne({ method: 'POST', url: '/v1/auth/signout' })
        .flush('OK', { status: 200, statusText: 'OK' });

      expect(await result).toStrictEqual(ok(undefined));
    });

    it('removePasskey returns undefined whatever text body a 200 carries', async () => {
      const result = api.removePasskey('cred-1');

      http
        .expectOne({ method: 'DELETE', url: '/v1/auth/passkeys/cred-1' })
        .flush('OK', { status: 200, statusText: 'OK' });

      expect(await result).toStrictEqual(ok(undefined));
    });
  });

  it('does not map on status alone: a 401 with another tag is not Unauthorized', async () => {
    const result = api.me();

    http
      .expectOne({ method: 'GET', url: '/v1/auth/me' })
      .flush({ _tag: 'Boom' } as object | null, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toEqual(failed(AuthError.Unexpected));
  });

  it('keeps no state: a failure does not affect the next call', async () => {
    const first = api.me();
    http.expectOne('/v1/auth/me').flush(null, { status: 500, statusText: 'Error' });
    await first;

    const second = api.me();
    http.expectOne('/v1/auth/me').flush({ name: 'Ada', recoveryCodesLeft: 4 } as object | null);

    expect(await second).toEqual(ok({ name: 'Ada', recoveryCodesLeft: 4 }));
  });
});

describe('AuthApi with a root URL', () => {
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideApiConfiguration('https://api.example.test'),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('me gets the URL under the configured root', async () => {
    const result = api.me();

    http
      .expectOne({ method: 'GET', url: 'https://api.example.test/v1/auth/me' })
      .flush({ name: 'Ada', recoveryCodesLeft: 4 } as object | null);

    expect(await result).toEqual(ok({ name: 'Ada', recoveryCodesLeft: 4 }));
  });

  it('removePasskey deletes under the configured root', async () => {
    const result = api.removePasskey('cred-1');

    http
      .expectOne({ method: 'DELETE', url: 'https://api.example.test/v1/auth/passkeys/cred-1' })
      .flush('', { status: 204, statusText: 'No Content' });

    expect(await result).toStrictEqual(ok(undefined));
  });
});
