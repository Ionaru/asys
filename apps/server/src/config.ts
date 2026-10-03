// SPDX-License-Identifier: EUPL-1.2
import { PasskeyConfig } from '@ionaru/effect-passkeys/server';
import { Config, Context, Effect, Layer, Schema } from 'effect';

/** The server's settings, read from the environment. */
export interface ServerConfigValues {
  /** The port the HTTP server listens on. */
  readonly port: number;
  /** The exact public origin, for example `https://asys.example.com`. */
  readonly publicOrigin: string;
  /** The WebAuthn relying party id: the origin's host or a parent domain of it. */
  readonly rpId: string;
}

const isPublicOrigin = (value: string): boolean => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.origin === value &&
    (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))
  );
};

const originConfig = Config.schema(
  Schema.String.check(Schema.makeFilter(isPublicOrigin)),
  'ASYS_PUBLIC_ORIGIN',
);

const rpIdConfig = (origin: string) => {
  const hostname = new URL(origin).hostname;
  return Config.schema(
    Schema.String.check(
      Schema.makeFilter(
        (rpId: string) => rpId !== '' && (rpId === hostname || hostname.endsWith(`.${rpId}`)),
      ),
    ),
    'ASYS_RP_ID',
  );
};

const serverConfig = Config.all({
  port: Config.Port('PORT').pipe(Config.withDefault(3000)),
  publicOrigin: originConfig,
}).pipe(
  Config.flatMap(({ port, publicOrigin }) =>
    rpIdConfig(publicOrigin).pipe(Config.map((rpId) => ({ port, publicOrigin, rpId }))),
  ),
);

/** The server's settings. */
export class ServerConfig extends Context.Service<ServerConfig, ServerConfigValues>()(
  'asys/ServerConfig',
) {
  /** Read from PORT (default 3000), ASYS_PUBLIC_ORIGIN and ASYS_RP_ID. */
  static readonly layer: Layer.Layer<ServerConfig, Config.ConfigError> =
    Layer.effect(ServerConfig)(serverConfig);

  /** Fixed values, for tests. */
  static readonly layerOf = (values: ServerConfigValues): Layer.Layer<ServerConfig> =>
    Layer.succeed(ServerConfig)(values);
}

/** The passkey library's settings, derived from ServerConfig. */
export const passkeyConfigLayer: Layer.Layer<PasskeyConfig, never, ServerConfig> = Layer.effect(
  PasskeyConfig,
)(
  ServerConfig.use((config) =>
    Effect.succeed({
      rpId: config.rpId,
      rpName: 'ASYS',
      origin: config.publicOrigin,
      keepLastPasskey: true,
      defaultPasskeyName: 'Passkey',
    }),
  ),
);
