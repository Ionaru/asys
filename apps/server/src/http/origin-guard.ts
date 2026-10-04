// SPDX-License-Identifier: EUPL-1.2
import { Effect } from 'effect';
import * as ByteSize from 'effect/ByteSize';
import { HttpEffect, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { isApiPath, requestPath } from './paths';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The largest request body the server reads, 1 MiB. */
export const MAX_BODY_BYTES = 1_048_576;

/** The baseline security headers every response carries. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000',
} as const;

/**
 * Sets the `SECURITY_HEADERS` on a response, replacing any existing values. When `path` belongs to
 * the API it also sets `Cache-Control: no-store`; for any other path `Cache-Control` is left as it
 * is. All other headers are kept.
 */
export const withSecurityHeaders = (
  response: HttpServerResponse.HttpServerResponse,
  path: string,
): HttpServerResponse.HttpServerResponse => {
  let result = response;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    result = HttpServerResponse.setHeader(result, name, value);
  }
  return isApiPath(path)
    ? HttpServerResponse.setHeader(result, 'Cache-Control', 'no-store')
    : result;
};

const guarded = <E, R>(
  publicOrigin: string,
  app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  request: HttpServerRequest.HttpServerRequest,
  path: string,
) =>
  Effect.gen(function* () {
    yield* HttpEffect.appendPreResponseHandler((_request, response) =>
      Effect.succeed(withSecurityHeaders(response, path)),
    );
    if (!SAFE_METHODS.has(request.method) && request.headers['origin'] !== publicOrigin) {
      return withSecurityHeaders(HttpServerResponse.empty({ status: 403 }), path);
    }
    return yield* Effect.provideService(
      app,
      HttpServerRequest.MaxBodySize,
      ByteSize.bytes(MAX_BODY_BYTES),
    );
  });

/**
 * The server-wide middleware, the API's CSRF defence: any method other than GET, HEAD and
 * OPTIONS must carry an `origin` header equal to `publicOrigin`, else it is answered with an
 * empty 403 and the app never runs. Otherwise the app runs with request bodies capped at 1 MiB.
 * Every response, the 403 and failure responses included, gets `withSecurityHeaders`: the baseline
 * security headers, and `Cache-Control: no-store` on API paths. A request outside the API runs
 * with tracing disabled, so it produces no span of any name.
 */
export const httpMiddleware =
  (publicOrigin: string) =>
  <E, R>(app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const path = requestPath(request.url);
      const run = guarded(publicOrigin, app, request, path);
      return yield* isApiPath(path) ? run : Effect.withTracerEnabled(run, false);
    });
