// SPDX-License-Identifier: EUPL-1.2
import { createServer } from 'node:http';
import { passkeyRouterConfig } from '@ionaru/effect-passkeys/server';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Effect, Layer } from 'effect';
import { HttpMiddleware, HttpRouter } from 'effect/http';
import { ServerConfig } from './config';
import { apiLayer } from './http/app';
import { httpMiddleware } from './http/origin-guard';
import { isApiPath, requestPath } from './http/paths';
import { staticFilesLayer } from './http/static-files';

/**
 * The HTTP server: the API on a Node server at the configured port, behind the Origin guard
 * and the body size limit. Only API requests get a trace span. Keeps `HttpServer` in its output
 * so callers can read the address.
 */
export const serverLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { port, publicOrigin, staticRoot } = yield* ServerConfig;
    return Layer.provideMerge(
      HttpRouter.serve(
        staticRoot === undefined
          ? apiLayer
          : Layer.mergeAll(apiLayer, staticFilesLayer(staticRoot)),
        {
          middleware: httpMiddleware(publicOrigin),
          routerConfig: passkeyRouterConfig,
        },
      ).pipe(
        Layer.provide(
          Layer.succeed(HttpMiddleware.TracerDisabledWhen)(
            (request) => !isApiPath(requestPath(request.url)),
          ),
        ),
      ),
      NodeHttpServer.layer(createServer, { port }),
    );
  }),
);
