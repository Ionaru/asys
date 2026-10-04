// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import { PasskeyConfig } from '@ionaru/effect-passkeys/server';
import { ConfigProvider, Effect, Exit, Layer } from 'effect';
import { describeError } from './logging/describe-error';
import { passkeyConfigLayer, ServerConfig } from './config';

const readConfig = (env: Record<string, string>) =>
  Effect.exit(
    ServerConfig.use(Effect.succeed).pipe(
      Effect.provide(
        ServerConfig.layer.pipe(
          Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))),
        ),
      ),
    ),
  );

const GOOD = { ASYS_PUBLIC_ORIGIN: 'https://asys.example.com', ASYS_RP_ID: 'asys.example.com' };

describe('ServerConfig.layer', () => {
  it.effect('reads the origin and relying-party id and defaults the port to 3000', () =>
    Effect.gen(function* () {
      const exit = yield* readConfig(GOOD);

      assert.isTrue(Exit.isSuccess(exit));
      if (Exit.isSuccess(exit)) {
        assert.deepStrictEqual(
          { ...exit.value },
          { port: 3000, publicOrigin: 'https://asys.example.com', rpId: 'asys.example.com' },
        );
      }
    }),
  );

  it.effect('accepts a registrable parent domain as the relying-party id', () =>
    Effect.gen(function* () {
      const exit = yield* readConfig({ ...GOOD, ASYS_RP_ID: 'example.com' });

      assert.isTrue(Exit.isSuccess(exit));
      if (Exit.isSuccess(exit)) {
        assert.strictEqual(exit.value.rpId, 'example.com');
      }
    }),
  );

  it.effect('accepts http on localhost and reads PORT', () =>
    Effect.gen(function* () {
      const exit = yield* readConfig({
        ASYS_PUBLIC_ORIGIN: 'http://localhost:4200',
        ASYS_RP_ID: 'localhost',
        PORT: '8080',
      });

      assert.isTrue(Exit.isSuccess(exit));
      if (Exit.isSuccess(exit)) {
        assert.strictEqual(exit.value.port, 8080);
        assert.strictEqual(exit.value.publicOrigin, 'http://localhost:4200');
      }
    }),
  );

  for (const [name, env] of [
    ['absent', GOOD],
    ['empty', { ...GOOD, ASYS_STATIC_ROOT: '' }],
  ] as const) {
    it.effect(`leaves the staticRoot key out when ASYS_STATIC_ROOT is ${name}`, () =>
      Effect.gen(function* () {
        const exit = yield* readConfig(env);

        assert.isTrue(Exit.isSuccess(exit));
        if (Exit.isSuccess(exit)) {
          assert.deepStrictEqual(
            { ...exit.value },
            { port: 3000, publicOrigin: 'https://asys.example.com', rpId: 'asys.example.com' },
          );
        }
      }),
    );
  }

  it.effect('keeps an absolute ASYS_STATIC_ROOT as given', () =>
    Effect.gen(function* () {
      const exit = yield* readConfig({ ...GOOD, ASYS_STATIC_ROOT: '/app/pwa' });

      assert.isTrue(Exit.isSuccess(exit));
      if (Exit.isSuccess(exit)) {
        assert.strictEqual(exit.value.staticRoot, '/app/pwa');
      }
    }),
  );

  const rejected: ReadonlyArray<{
    readonly name: string;
    readonly env: Record<string, string>;
    readonly variable: string;
    readonly secret: string;
  }> = [
    {
      name: 'an origin with a path',
      env: { ...GOOD, ASYS_PUBLIC_ORIGIN: 'https://asys.example.com/app' },
      variable: 'ASYS_PUBLIC_ORIGIN',
      secret: '/app',
    },
    {
      name: 'an origin with a trailing slash',
      env: { ...GOOD, ASYS_PUBLIC_ORIGIN: 'https://asys.example.com/' },
      variable: 'ASYS_PUBLIC_ORIGIN',
      secret: 'example',
    },
    {
      name: 'a plain http origin that is not localhost',
      env: { ...GOOD, ASYS_PUBLIC_ORIGIN: 'http://asys.example.com' },
      variable: 'ASYS_PUBLIC_ORIGIN',
      secret: 'example',
    },
    {
      name: 'a relying-party id that is unrelated to the origin',
      env: { ...GOOD, ASYS_RP_ID: 'other.com' },
      variable: 'ASYS_RP_ID',
      secret: 'other.com',
    },
    {
      name: 'a relying-party id that is a suffix but not a dot-suffix',
      env: { ...GOOD, ASYS_RP_ID: 'sys.example.com' },
      variable: 'ASYS_RP_ID',
      secret: 'sys.example',
    },
    {
      name: 'a PORT that is not a number',
      env: { ...GOOD, PORT: 'abc' },
      variable: 'PORT',
      secret: 'abc',
    },
    {
      name: 'a missing relying-party id',
      env: { ASYS_PUBLIC_ORIGIN: 'https://asys.example.com' },
      variable: 'ASYS_RP_ID',
      secret: 'example',
    },
    {
      name: 'a relative static root',
      env: { ...GOOD, ASYS_STATIC_ROOT: 'dist/apps/pwa/browser' },
      variable: 'ASYS_STATIC_ROOT',
      secret: 'dist',
    },
  ];

  for (const { name, env, variable, secret } of rejected) {
    it.effect(`fails with a ConfigError naming ${variable} for ${name}`, () =>
      Effect.gen(function* () {
        const exit = yield* readConfig(env);

        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) {
          const described = describeError(exit.cause);
          assert.include(described, 'ConfigError');
          assert.include(described, variable);
          assert.notInclude(described, secret);
        }
      }),
    );
  }
});

describe('passkeyConfigLayer', () => {
  it.effect('derives the passkey settings from the server configuration', () =>
    Effect.gen(function* () {
      const config = yield* PasskeyConfig;

      assert.deepStrictEqual(
        { ...config },
        {
          rpId: 'localhost',
          rpName: 'ASYS',
          origin: 'http://localhost:4200',
          keepLastPasskey: true,
          defaultPasskeyName: 'Passkey',
        },
      );
    }).pipe(
      Effect.provide(
        passkeyConfigLayer.pipe(
          Layer.provide(
            ServerConfig.layerOf({
              port: 0,
              publicOrigin: 'http://localhost:4200',
              rpId: 'localhost',
            }),
          ),
        ),
      ),
    ),
  );
});
