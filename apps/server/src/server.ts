// SPDX-License-Identifier: EUPL-1.2
import { createServer } from 'node:http';
import { passkeyRouterConfig } from '@ionaru/effect-passkeys/server';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { ServerConfig } from './config';
import { apiLayer } from './http/app';
import { httpMiddleware } from './http/origin-guard';

/**
 * The HTTP server: the API on a Node server at the configured port, behind the Origin guard
 * and the body size limit. Keeps `HttpServer` in its output so callers can read the address.
 */
export const serverLayer = Layer.unwrap(
  Effect.gen(function* () {
    const { port, publicOrigin } = yield* ServerConfig;
    return Layer.provideMerge(
      HttpRouter.serve(apiLayer, {
        middleware: httpMiddleware(publicOrigin),
        routerConfig: passkeyRouterConfig,
      }),
      NodeHttpServer.layer(createServer, { port }),
    );
  }),
);
