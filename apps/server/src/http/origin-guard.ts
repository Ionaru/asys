// SPDX-License-Identifier: EUPL-1.2
import { Effect } from 'effect';
import * as ByteSize from 'effect/ByteSize';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The largest request body the server reads, 1 MiB. */
export const MAX_BODY_BYTES = 1_048_576;

/**
 * The server-wide middleware, the API's CSRF defence: any method other than GET, HEAD and
 * OPTIONS must carry an `origin` header equal to `publicOrigin`, else it is answered with an
 * empty 403 and the app never runs. Otherwise the app runs with request bodies capped at 1 MiB.
 */
export const httpMiddleware =
  (publicOrigin: string) =>
  <E, R>(app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (!SAFE_METHODS.has(request.method) && request.headers['origin'] !== publicOrigin) {
        return HttpServerResponse.empty({ status: 403 });
      }
      return yield* Effect.provideService(
        app,
        HttpServerRequest.MaxBodySize,
        ByteSize.bytes(MAX_BODY_BYTES),
      );
    });
