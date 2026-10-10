// SPDX-License-Identifier: EUPL-1.2
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Session } from './session';
import { unauthorizedInterceptor } from './unauthorized.interceptor';

describe('unauthorizedInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let signedOut: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    signedOut = vi.fn<() => void>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: Session, useValue: { signedOut } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
  });

  const fail = async (
    method: string,
    url: string,
    status: number,
    body: object | string | null,
  ): Promise<unknown> => {
    const result = new Promise<unknown>((resolve) => {
      http.request(method, url).subscribe({
        next: () => resolve(undefined),
        error: (error: unknown) => resolve(error),
      });
    });

    controller.expectOne({ method, url }).flush(body, { status, statusText: 'Error' });

    return result;
  };

  it('signs out on a 401 with the Unauthorized tag', async () => {
    await fail('GET', '/v1/auth/me', 401, { _tag: 'Unauthorized' } as object | null);

    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it('signs out on a 401 whose text body is a JSON string with the Unauthorized tag', async () => {
    await fail('POST', '/v1/auth/signout', 401, JSON.stringify({ _tag: 'Unauthorized' }));

    expect(signedOut).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['SignInFailed', 'POST', '/v1/auth/authenticate'],
    ['PasskeyVerificationFailed', 'POST', '/v1/auth/passkeys'],
  ])('leaves the session alone on a 401 tagged %s', async (tag, method, url) => {
    await fail(method, url, 401, { _tag: tag } as object | null);

    expect(signedOut).not.toHaveBeenCalled();
  });

  it('leaves the session alone on a body-less 401 of another request', async () => {
    await fail('GET', '/v1/auth/me', 401, null);

    expect(signedOut).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', '/v1/auth/passkeys'],
    ['DELETE', '/v1/auth/passkeys/cred-1'],
  ])('leaves the session alone on a body-less 401 of %s %s', async (method, url) => {
    await fail(method, url, 401, null);

    expect(signedOut).not.toHaveBeenCalled();
  });

  it.each([400, 403, 404, 409, 500])('leaves the session alone on a %i', async (status) => {
    await fail('POST', '/v1/auth/passkeys', status, null);
    await fail('GET', '/v1/auth/me', status, { _tag: 'Unauthorized' } as object | null);

    expect(signedOut).not.toHaveBeenCalled();
  });

  it('leaves the session alone on a status-0 failure', async () => {
    const result = new Promise<unknown>((resolve) => {
      http.get('/v1/auth/me').subscribe({ error: (error: unknown) => resolve(error) });
    });

    controller.expectOne('/v1/auth/me').error(new ProgressEvent('error'), { status: 0 });
    await result;

    expect(signedOut).not.toHaveBeenCalled();
  });

  it('leaves the session alone on success', async () => {
    const result = new Promise<unknown>((resolve) => {
      http.get('/v1/auth/me').subscribe((value) => resolve(value));
    });

    controller.expectOne('/v1/auth/me').flush({ name: 'Ada' } as object | null);

    expect(await result).toEqual({ name: 'Ada' });
    expect(signedOut).not.toHaveBeenCalled();
  });

  it.each([
    ['a signing-out 401', 401, { _tag: 'Unauthorized' }],
    ['a different 401', 401, { _tag: 'SignInFailed' }],
    ['a 500', 500, null],
  ])('rethrows the same error object for %s', async (_name, status, body) => {
    const error = await fail('GET', '/v1/auth/me', status, body as object | null);

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(status);
    expect((error as HttpErrorResponse).error).toEqual(body);
  });

  it('delivers the same error object to every subscriber chain unchanged', async () => {
    const seen: unknown[] = [];
    const result = new Promise<void>((resolve) => {
      http.get('/v1/auth/me').subscribe({
        error: (error: unknown) => {
          seen.push(error);
          resolve();
        },
      });
    });

    controller.expectOne('/v1/auth/me').flush({ _tag: 'Unauthorized' } as object | null, {
      status: 401,
      statusText: 'Unauthorized',
    });
    await result;

    expect(seen).toHaveLength(1);
    expect((seen[0] as HttpErrorResponse).url).toBe('/v1/auth/me');
  });
});
