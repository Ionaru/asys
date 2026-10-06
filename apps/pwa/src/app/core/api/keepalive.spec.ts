// SPDX-License-Identifier: EUPL-1.2
import {
  HttpClient,
  HttpContext,
  type HttpHandlerFn,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { KEEPALIVE, keepaliveInterceptor } from './keepalive';

describe('keepaliveInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([keepaliveInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    controller.verify();
  });

  it('sends a request marked with KEEPALIVE with keepalive set', () => {
    http
      .post('/v1/commands', { a: 1 }, { context: new HttpContext().set(KEEPALIVE, true) })
      .subscribe();

    const req = controller.expectOne('/v1/commands');

    expect(req.request.keepalive).toBe(true);
    req.flush(null);
  });

  it('sends an unmarked request without keepalive', () => {
    http.post('/v1/commands', { a: 1 }).subscribe();

    const req = controller.expectOne('/v1/commands');

    expect(req.request.keepalive).toBe(false);
    req.flush(null);
  });

  it('sends a request explicitly marked false without keepalive', () => {
    http
      .post('/v1/commands', { a: 1 }, { context: new HttpContext().set(KEEPALIVE, false) })
      .subscribe();

    const req = controller.expectOne('/v1/commands');

    expect(req.request.keepalive).toBe(false);
    req.flush(null);
  });

  it('defaults KEEPALIVE to false', () => {
    expect(new HttpContext().get(KEEPALIVE)).toBe(false);
  });

  it('keeps method, URL, body and headers of a marked request', () => {
    http
      .post(
        '/v1/commands',
        { a: 1 },
        { headers: { 'X-Test': 'yes' }, context: new HttpContext().set(KEEPALIVE, true) },
      )
      .subscribe();

    const req = controller.expectOne('/v1/commands');

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ a: 1 });
    expect(req.request.headers.get('X-Test')).toBe('yes');
    req.flush(null);
  });

  it('forwards an unmarked request as the same object', () => {
    const request = new HttpRequest('GET', '/v1/snapshot');
    const forwarded: HttpRequest<unknown>[] = [];
    const next: HttpHandlerFn = (req) => {
      forwarded.push(req);

      return of();
    };

    TestBed.runInInjectionContext(() => keepaliveInterceptor(request, next)).subscribe();

    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).toBe(request);
  });

  it('forwards a marked request as a clone with keepalive, leaving the original alone', () => {
    const request = new HttpRequest('GET', '/v1/snapshot', {
      context: new HttpContext().set(KEEPALIVE, true),
    });
    const forwarded: HttpRequest<unknown>[] = [];
    const next: HttpHandlerFn = (req) => {
      forwarded.push(req);

      return of();
    };

    TestBed.runInInjectionContext(() => keepaliveInterceptor(request, next)).subscribe();

    expect(forwarded[0].keepalive).toBe(true);
    expect(forwarded[0].url).toBe('/v1/snapshot');
    expect(request.keepalive).toBe(false);
  });
});
