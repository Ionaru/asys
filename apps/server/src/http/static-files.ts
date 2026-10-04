// SPDX-License-Identifier: EUPL-1.2
import { Data, Effect, FileSystem, Layer, Path } from 'effect';
import {
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/http';
import { isApiPath, requestPath } from './paths';

/** The static root has no `index.html` file. Carries no path or value, so nothing reaches the logs. */
export class StaticRootInvalid extends Data.TaggedError('StaticRootInvalid')<
  Record<never, never>
> {}

/** The `Cache-Control` values the static route sends. */
export enum CacheControl {
  Immutable = 'public, max-age=31536000, immutable',
  NoCache = 'no-cache',
}

/** The Content-Security-Policy sent with every static response. */
export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const HASHED_BUNDLE = /^\/(?:main|chunk|polyfills|styles)-[A-Za-z0-9_-]{8}\.(?:js|css)$/;

const HASHED_FONT = /^\/media\/[^/]+-[A-Z0-9]{8}\.woff2$/;

/**
 * The `Cache-Control` for a request path (query already removed): immutable for the
 * content-hashed bundles and fonts the build emits, `no-cache` for everything else.
 */
export const cacheControlFor = (path: string): CacheControl =>
  HASHED_BUNDLE.test(path) || HASHED_FONT.test(path)
    ? CacheControl.Immutable
    : CacheControl.NoCache;

/**
 * Serves the built PWA from `root` on every GET the API does not answer, with an SPA fallback
 * to `index.html`. Fails with `StaticRootInvalid` while the layer is built when `root` has no
 * `index.html` file. Requests for API paths answer an empty 404. Every response carries
 * `Cache-Control` (`no-cache` for every status of 400 or more, so an error never gets the
 * immutable value) and the CSP, and responses below 500 write no request log line.
 */
export const staticFilesLayer = (
  root: string,
): Layer.Layer<
  never,
  StaticRootInvalid,
  HttpRouter.HttpRouter | FileSystem.FileSystem | Path.Path | HttpPlatform.HttpPlatform
> =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const info = yield* fs.stat(path.join(root, 'index.html'));
      if (info.type !== 'File') return yield* Effect.fail(new StaticRootInvalid());
      const serve = yield* HttpStaticServer.make({ root, spa: true });
      yield* router.add(
        'GET',
        '/*',
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const requested = requestPath(request.url);
          const response = yield* (
            isApiPath(requested) ? Effect.succeed(HttpServerResponse.empty({ status: 404 })) : serve
          ).pipe(Effect.catch(HttpServerRespondable.toResponse));
          if (response.status < 500) yield* HttpMiddleware.withLoggerDisabled(Effect.void);
          return response.pipe(
            HttpServerResponse.setHeader(
              'Cache-Control',
              response.status < 400 ? cacheControlFor(requested) : CacheControl.NoCache,
            ),
            HttpServerResponse.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY),
          );
        }),
      );
    }).pipe(Effect.mapError(() => new StaticRootInvalid())),
  );
