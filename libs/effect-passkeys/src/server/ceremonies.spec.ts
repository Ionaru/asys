// SPDX-License-Identifier: MIT

import { assert, describe, it } from '@effect/vitest';
import { Cause, Data, Effect, Exit, Layer, Result } from 'effect';
import { TestClock } from 'effect/testing';
import type { PasskeyChallenge } from '../api/schemas';
import { makeMemoryPasskeyStore } from '../testing/memory-store';
import { CurrentRun, makeRecordingUnitOfWork } from '../testing/recording-unit-of-work';
import { makeSoftAuthenticator, type SoftRegisterOverrides } from '../testing/soft-authenticator';
import {
  beginAddPasskey,
  beginAuthentication,
  beginRegistration,
  finishAddPasskey,
  finishAuthentication,
  finishRegistration,
  listPasskeys,
  removePasskey,
} from './ceremonies';
import { PasskeyChallenges } from './challenges';
import { PasskeyConfig, type PasskeyConfigValues } from './config';
import type { StoredPasskey } from './store';

const T = 1_000_000;

const origin = 'http://localhost:4200';

const configValues: PasskeyConfigValues = {
  rpId: 'localhost',
  rpName: 'Test',
  origin,
  keepLastPasskey: true,
  defaultPasskeyName: 'Passkey',
};

const base64url = (text: string): string => Buffer.from(text).toString('base64url');

/** What a host's re-check fails with in these tests. */
class Revoked extends Data.TaggedError('Revoked') {}

/** A re-check that records the run it saw and fails with `Revoked`. */
const failingRecheck = (seen: Array<string | undefined>) =>
  Effect.gen(function* () {
    seen.push(yield* CurrentRun);
    return yield* new Revoked();
  });

interface CreationOptions {
  readonly challenge: string;
  readonly rp: { readonly name: string; readonly id: string };
  readonly user: { readonly id: string; readonly name: string; readonly displayName: string };
  readonly pubKeyCredParams: ReadonlyArray<{ readonly alg: number }>;
  readonly authenticatorSelection: {
    readonly residentKey: string;
    readonly userVerification: string;
  };
  readonly attestation: string;
  readonly timeout: number;
  readonly excludeCredentials: ReadonlyArray<{ readonly id: string }>;
}

interface RequestOptions {
  readonly rpId: string;
  readonly userVerification: string;
  readonly timeout: number;
  readonly allowCredentials?: unknown;
}

const creation = (challenge: PasskeyChallenge): CreationOptions =>
  challenge.options as unknown as CreationOptions;

const makeEnv = (config: Partial<PasskeyConfigValues> = {}) => {
  const store = makeMemoryPasskeyStore();
  const unitOfWork = makeRecordingUnitOfWork();
  const layer = Layer.mergeAll(
    PasskeyConfig.layer({ ...configValues, ...config }),
    PasskeyChallenges.memory(),
    store.layer,
    unitOfWork.layer,
  );

  return {
    store,
    unitOfWork,
    layer,
    authenticator: makeSoftAuthenticator({ origin, rpId: 'localhost' }),
  };
};

type Env = ReturnType<typeof makeEnv>;

const storedPasskey = (
  credentialId: string,
  overrides: Partial<StoredPasskey> = {},
): StoredPasskey => ({
  userId: 'user-1',
  credentialId,
  publicKey: 'cHVibGljLWtleQ',
  counter: 0,
  transports: [],
  backedUp: false,
  name: 'Passkey',
  createdAt: T,
  lastUsedAt: null,
  ...overrides,
});

/** The tag of the typed failure of an effect that is expected to fail. */
const failureTag = <A, E extends { readonly _tag: string }, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.flip(effect), (error) => error._tag);

const assertDies = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const exit = yield* Effect.exit(effect);

    assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause) && !Cause.hasFails(exit.cause));
  });

/** A registration ceremony with the soft authenticator, up to (not including) the finish. */
const startRegistration = (
  env: Env,
  overrides?: SoftRegisterOverrides,
  who = { userId: 'user-1', userName: 'Ann' },
) =>
  Effect.gen(function* () {
    const challenge = yield* beginRegistration(who);
    const registered = env.authenticator.register(challenge.options, overrides);

    return { challenge, ...registered };
  });

/** Registers 'user-1' through the ceremonies and stores the passkey, as a host would. */
const seedPasskey = (
  env: Env,
  overrides: Partial<StoredPasskey> = {},
  who = { userId: 'user-1', userName: 'Ann' },
) =>
  Effect.gen(function* () {
    const { challenge, response, credential } = yield* startRegistration(env, undefined, who);
    const verified = yield* finishRegistration({ challengeId: challenge.challengeId, response });
    const passkey = { ...verified.passkey, ...overrides };
    env.store.passkeys.set(passkey.credentialId, passkey);
    env.store.userNames.set(who.userId, who.userName);

    return { credential, passkey };
  });

const hookCalls = () => {
  const seen: Array<StoredPasskey> = [];
  const hook = (passkey: StoredPasskey) =>
    Effect.gen(function* () {
      seen.push(passkey);
      const run = yield* CurrentRun;

      return { run, result: 'hook-result' };
    });

  return { seen, hook };
};

describe('beginRegistration', () => {
  it.effect(
    'generates options with the fixed settings and a challenge id equal to the challenge',
    () =>
      Effect.gen(function* () {
        const challenge = yield* beginRegistration({ userId: 'user-1', userName: 'Ann' });
        const options = creation(challenge);

        assert.strictEqual(challenge.challengeId, options.challenge);
        assert.strictEqual(options.user.id, base64url('user-1'));
        assert.strictEqual(options.user.name, 'Ann');
        assert.strictEqual(options.user.displayName, 'Ann');
        assert.deepStrictEqual(options.rp, { name: 'Test', id: 'localhost' });
        assert.deepStrictEqual(
          options.pubKeyCredParams.map((param) => param.alg),
          [-8, -7, -257],
        );
        assert.strictEqual(options.authenticatorSelection.residentKey, 'required');
        assert.strictEqual(options.authenticatorSelection.userVerification, 'required');
        assert.strictEqual(options.attestation, 'none');
        assert.strictEqual(options.timeout, 300_000);
        assert.deepStrictEqual(options.excludeCredentials, []);
      }).pipe(Effect.provide(makeEnv().layer)),
  );

  it.effect('dies for a user id of 65 bytes', () =>
    assertDies(beginRegistration({ userId: 'a'.repeat(65), userName: 'Ann' })).pipe(
      Effect.provide(makeEnv().layer),
    ),
  );

  it.effect('dies for an empty user id', () =>
    assertDies(beginRegistration({ userId: '', userName: 'Ann' })).pipe(
      Effect.provide(makeEnv().layer),
    ),
  );

  it.effect('dies for a blank user name', () =>
    assertDies(beginRegistration({ userId: 'user-1', userName: '   ' })).pipe(
      Effect.provide(makeEnv().layer),
    ),
  );
});

describe('finishRegistration', () => {
  it.effect('returns the verified user and passkey without storing anything', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const { challenge, response, credential } = yield* startRegistration(env);

      const verified = yield* finishRegistration({ challengeId: challenge.challengeId, response });

      assert.strictEqual(verified.userId, 'user-1');
      assert.strictEqual(verified.userName, 'Ann');
      assert.strictEqual(verified.passkey.userId, 'user-1');
      assert.strictEqual(verified.passkey.credentialId, credential.id);
      assert.strictEqual(verified.passkey.counter, 0);
      assert.deepStrictEqual(verified.passkey.transports, []);
      assert.isFalse(verified.passkey.backedUp);
      assert.strictEqual(verified.passkey.name, 'Passkey');
      assert.strictEqual(verified.passkey.createdAt, T);
      assert.isNull(verified.passkey.lastUsedAt);
      assert.isString(verified.passkey.publicKey);
      assert.deepStrictEqual(env.store.calls, []);
      assert.strictEqual(env.store.passkeys.size, 0);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('reports a backed up passkey when the BE and BS flags are set', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { challenge, response } = yield* startRegistration(env, { flags: 0x45 | 0x08 | 0x10 });

      const verified = yield* finishRegistration({ challengeId: challenge.challengeId, response });

      assert.isTrue(verified.passkey.backedUp);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('rejects the same challenge a second time', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { challenge, response } = yield* startRegistration(env);
      yield* finishRegistration({ challengeId: challenge.challengeId, response });

      const tag = yield* failureTag(
        finishRegistration({ challengeId: challenge.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyChallengeInvalid');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('rejects an unknown challenge id', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { response } = yield* startRegistration(env);

      const tag = yield* failureTag(finishRegistration({ challengeId: 'unknown', response }));

      assert.strictEqual(tag, 'PasskeyChallengeInvalid');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('rejects the id of an authentication challenge', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { response } = yield* startRegistration(env);
      const authentication = yield* beginAuthentication();

      const tag = yield* failureTag(
        finishRegistration({ challengeId: authentication.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyChallengeInvalid');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('rejects a challenge after 5 minutes', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const { challenge, response } = yield* startRegistration(env);
      yield* TestClock.adjust('5 minutes');

      const tag = yield* failureTag(
        finishRegistration({ challengeId: challenge.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyChallengeInvalid');
    }).pipe(Effect.provide(env.layer));
  });

  const failing: ReadonlyArray<readonly [string, SoftRegisterOverrides]> = [
    ['an origin other than the configured one', { origin: 'https://evil.example' }],
    ['a response without user verification', { flags: 0x41 }],
    ['a relying party id other than the configured one', { rpId: 'example.com' }],
    ['an algorithm outside the supported ones', { alg: -36 }],
    ['a post-quantum algorithm', { alg: -48 }],
  ];

  for (const [label, overrides] of failing) {
    it.effect(`fails verification for ${label}`, () => {
      const env = makeEnv();

      return Effect.gen(function* () {
        const { challenge, response } = yield* startRegistration(env, overrides);

        const tag = yield* failureTag(
          finishRegistration({ challengeId: challenge.challengeId, response }),
        );

        assert.strictEqual(tag, 'PasskeyVerificationFailed');
      }).pipe(Effect.provide(env.layer));
    });
  }

  it.effect('fails verification when rawId differs from id', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { challenge, response } = yield* startRegistration(env);

      const tag = yield* failureTag(
        finishRegistration({
          challengeId: challenge.challengeId,
          response: { ...response, rawId: base64url('another') },
        }),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
    }).pipe(Effect.provide(env.layer));
  });
  it.effect('rejects the id of an Add challenge', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const add = yield* beginAddPasskey('user-1');
      const { response } = env.authenticator.register(add.options);

      const tag = yield* failureTag(finishRegistration({ challengeId: add.challengeId, response }));

      assert.strictEqual(tag, 'PasskeyChallengeInvalid');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification when id and rawId are both replaced by another id', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { challenge, response } = yield* startRegistration(env);
      const other = base64url('another-credential-id');

      const tag = yield* failureTag(
        finishRegistration({
          challengeId: challenge.challengeId,
          response: { ...response, id: other, rawId: other },
        }),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.deepStrictEqual(env.store.calls, []);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification for a credential id of 1024 bytes', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { challenge, response } = yield* startRegistration(env, { credentialIdLength: 1024 });

      const tag = yield* failureTag(
        finishRegistration({ challengeId: challenge.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.strictEqual(env.store.passkeys.size, 0);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('accepts a credential id of 1023 bytes', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { challenge, response, credential } = yield* startRegistration(env, {
        credentialIdLength: 1023,
      });

      const verified = yield* finishRegistration({ challengeId: challenge.challengeId, response });

      assert.strictEqual(verified.passkey.credentialId, credential.id);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('keeps only the known transports in their original order', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { challenge, response } = yield* startRegistration(env, {
        transports: ['usb', 'bogus', 'internal'],
      });

      const verified = yield* finishRegistration({ challengeId: challenge.challengeId, response });

      assert.deepStrictEqual(verified.passkey.transports, ['usb', 'internal']);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('accepts user ids of 64 bytes', () =>
    Effect.gen(function* () {
      for (const userId of ['a'.repeat(64), 'é'.repeat(32)]) {
        const challenge = yield* beginRegistration({ userId, userName: 'Ann' });

        assert.strictEqual(challenge.challengeId, creation(challenge).challenge);
      }
    }).pipe(Effect.provide(makeEnv().layer)),
  );

  it.effect('dies for a user id of 66 bytes', () =>
    assertDies(beginRegistration({ userId: 'é'.repeat(33), userName: 'Ann' })).pipe(
      Effect.provide(makeEnv().layer),
    ),
  );
});

describe('beginAuthentication', () => {
  it.effect('generates options requiring user verification without allowed credentials', () =>
    Effect.gen(function* () {
      const challenge = yield* beginAuthentication();
      const options = challenge.options as unknown as RequestOptions;

      assert.strictEqual(options.rpId, 'localhost');
      assert.strictEqual(options.userVerification, 'required');
      assert.strictEqual(options.timeout, 300_000);
      assert.isUndefined(options.allowCredentials);
    }).pipe(Effect.provide(makeEnv().layer)),
  );
});

describe('finishAuthentication', () => {
  it.effect('updates the counter inside a run for the user and returns the hook result', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      yield* TestClock.setTime(T);
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential, {
        counter: 1,
      });
      const { seen, hook } = hookCalls();

      const result = yield* finishAuthentication(
        { challengeId: challenge.challengeId, response },
        hook,
      );

      assert.strictEqual(seen.length, 1);
      assert.strictEqual(seen[0]?.counter, 1);
      assert.strictEqual(seen[0]?.lastUsedAt, T);
      assert.strictEqual(seen[0]?.userId, 'user-1');
      assert.deepStrictEqual(result, { run: 'user-1', result: 'hook-result' });
      assert.strictEqual(env.store.passkeys.get(credential.id)?.counter, 1);
      assert.deepStrictEqual(env.unitOfWork.runs, ['user-1']);
      assert.strictEqual(
        env.store.calls.find((call) => call.method === 'updateCounter')?.run,
        'user-1',
      );
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails with an unknown credential when no passkey has the credential id', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const other = base64url('other-credential');
      const response = {
        ...env.authenticator.authenticate(challenge.options, credential),
        id: other,
        rawId: other,
      };
      const { seen, hook } = hookCalls();

      const tag = yield* failureTag(
        finishAuthentication({ challengeId: challenge.challengeId, response }, hook),
      );

      assert.strictEqual(tag, 'PasskeyUnknownCredential');
      assert.deepStrictEqual(seen, []);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification when rawId differs from id', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential, {
        id: base64url('other-credential'),
      });

      const tag = yield* failureTag(
        finishAuthentication({ challengeId: challenge.challengeId, response }, hookCalls().hook),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('rejects an unknown challenge, a used one and a registration one', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential);
      const registration = yield* beginRegistration({ userId: 'user-1', userName: 'Ann' });

      assert.strictEqual(
        yield* failureTag(
          finishAuthentication({ challengeId: 'unknown', response }, hookCalls().hook),
        ),
        'PasskeyChallengeInvalid',
      );
      assert.strictEqual(
        yield* failureTag(
          finishAuthentication(
            { challengeId: registration.challengeId, response },
            hookCalls().hook,
          ),
        ),
        'PasskeyChallengeInvalid',
      );

      yield* finishAuthentication(
        { challengeId: challenge.challengeId, response },
        hookCalls().hook,
      );

      assert.strictEqual(
        yield* failureTag(
          finishAuthentication({ challengeId: challenge.challengeId, response }, hookCalls().hook),
        ),
        'PasskeyChallengeInvalid',
      );
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification for the user handle of another user', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential, {
        userHandle: base64url('user-2'),
      });
      const { seen, hook } = hookCalls();

      const tag = yield* failureTag(
        finishAuthentication({ challengeId: challenge.challengeId, response }, hook),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.deepStrictEqual(seen, []);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('succeeds without a user handle', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential, {
        userHandle: null,
      });
      const { seen, hook } = hookCalls();

      yield* finishAuthentication({ challengeId: challenge.challengeId, response }, hook);

      assert.strictEqual(seen.length, 1);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification for a tampered signature and changes nothing', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential, {
        tamper: true,
      });
      const { seen, hook } = hookCalls();

      const tag = yield* failureTag(
        finishAuthentication({ challengeId: challenge.challengeId, response }, hook),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.strictEqual(env.store.passkeys.get(credential.id)?.counter, 0);
      assert.deepStrictEqual(seen, []);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification when the reported counter equals the stored counter of 5', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env, { counter: 5 });
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential, {
        counter: 5,
      });
      const { seen, hook } = hookCalls();

      const tag = yield* failureTag(
        finishAuthentication({ challengeId: challenge.challengeId, response }, hook),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.deepStrictEqual(seen, []);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification when the counter update is refused', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      env.store.failCounterUpdates = true;
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential);
      const { seen, hook } = hookCalls();

      const tag = yield* failureTag(
        finishAuthentication({ challengeId: challenge.challengeId, response }, hook),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.deepStrictEqual(seen, []);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails with the error of a failing hook', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential);

      const error = yield* Effect.flip(
        finishAuthentication({ challengeId: challenge.challengeId, response }, () =>
          Effect.fail({ _tag: 'HookFailed' as const }),
        ),
      );

      assert.deepStrictEqual(error, { _tag: 'HookFailed' });
    }).pipe(Effect.provide(env.layer));
  });
  const negatives: ReadonlyArray<readonly [string, 'flags' | 'origin' | 'rpId']> = [
    ['without user verification', 'flags'],
    ['from another origin', 'origin'],
    ['for another relying party id', 'rpId'],
  ];

  for (const [label, kind] of negatives) {
    it.effect(`fails verification for an assertion ${label}`, () => {
      const env = makeEnv();
      const overrides =
        kind === 'flags'
          ? { flags: 0x01 }
          : kind === 'origin'
            ? { origin: 'https://evil.example' }
            : { rpId: 'example.com' };

      return Effect.gen(function* () {
        const { credential } = yield* seedPasskey(env);
        const challenge = yield* beginAuthentication();
        const response = env.authenticator.authenticate(challenge.options, credential, overrides);
        const { seen, hook } = hookCalls();

        const tag = yield* failureTag(
          finishAuthentication({ challengeId: challenge.challengeId, response }, hook),
        );

        assert.strictEqual(tag, 'PasskeyVerificationFailed');
        assert.strictEqual(env.store.passkeys.get(credential.id)?.counter, 0);
        assert.deepStrictEqual(seen, []);
      }).pipe(Effect.provide(env.layer));
    });
  }

  it.effect('fails verification for an assertion over another challenge', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const challenge = yield* beginAuthentication();
      const another = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential, {
        challenge: another.options.challenge,
      });
      const { seen, hook } = hookCalls();

      const tag = yield* failureTag(
        finishAuthentication({ challengeId: challenge.challengeId, response }, hook),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.strictEqual(env.store.passkeys.get(credential.id)?.counter, 0);
      assert.deepStrictEqual(seen, []);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('accepts counter 6 for a stored counter of 5 and stores it', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env, { counter: 5 });
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential, {
        counter: 6,
      });

      yield* finishAuthentication(
        { challengeId: challenge.challengeId, response },
        hookCalls().hook,
      );

      assert.strictEqual(env.store.passkeys.get(credential.id)?.counter, 6);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('lets exactly one of two concurrent assertions with the same counter win', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);
      const first = yield* beginAuthentication();
      const second = yield* beginAuthentication();
      const firstResponse = env.authenticator.authenticate(first.options, credential, {
        counter: 1,
      });
      const secondResponse = env.authenticator.authenticate(second.options, credential, {
        counter: 1,
      });
      const { seen, hook } = hookCalls();

      const results = yield* Effect.all(
        [
          finishAuthentication({ challengeId: first.challengeId, response: firstResponse }, hook),
          finishAuthentication({ challengeId: second.challengeId, response: secondResponse }, hook),
        ],
        { concurrency: 2, mode: 'result' },
      );

      const failures = results.filter(Result.isFailure);

      assert.strictEqual(results.filter(Result.isSuccess).length, 1);
      assert.strictEqual(failures.length, 1);
      assert.strictEqual(failures[0]?.failure._tag, 'PasskeyVerificationFailed');
      assert.strictEqual(seen.length, 1);
      assert.strictEqual(env.store.passkeys.get(credential.id)?.counter, 1);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('signs in a user whose id has multibyte characters', () => {
    const env = makeEnv();
    const who = { userId: 'é'.repeat(10), userName: 'Eve' };

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env, {}, who);
      const challenge = yield* beginAuthentication();
      const response = env.authenticator.authenticate(challenge.options, credential);
      const { seen, hook } = hookCalls();

      yield* finishAuthentication({ challengeId: challenge.challengeId, response }, hook);

      assert.strictEqual(seen[0]?.userId, who.userId);
    }).pipe(Effect.provide(env.layer));
  });
});

describe('beginAddPasskey', () => {
  it.effect('excludes the existing credentials and names the user', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { credential } = yield* seedPasskey(env);

      const challenge = yield* beginAddPasskey('user-1');
      const options = creation(challenge);

      assert.deepStrictEqual(
        options.excludeCredentials.map((entry) => entry.id),
        [credential.id],
      );
      assert.strictEqual(options.user.name, 'Ann');
      assert.strictEqual(options.user.id, base64url('user-1'));
      assert.strictEqual(challenge.challengeId, options.challenge);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('dies for an unknown user', () =>
    assertDies(beginAddPasskey('nobody')).pipe(Effect.provide(makeEnv().layer)),
  );
});

describe('finishAddPasskey', () => {
  it.effect('rejects the Add challenge of another user', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response } = env.authenticator.register(challenge.options);

      const tag = yield* failureTag(
        finishAddPasskey('user-2', { challengeId: challenge.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyChallengeInvalid');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('rejects a Register challenge', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      const { challenge, response } = yield* startRegistration(env);

      const tag = yield* failureTag(
        finishAddPasskey('user-1', { challengeId: challenge.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyChallengeInvalid');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails with already registered for a credential id that is stored', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response, credential } = env.authenticator.register(challenge.options);
      env.store.passkeys.set(credential.id, storedPasskey(credential.id, { userId: 'user-2' }));

      const tag = yield* failureTag(
        finishAddPasskey('user-1', { challengeId: challenge.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyAlreadyRegistered');
      assert.strictEqual(env.store.passkeys.get(credential.id)?.userId, 'user-2');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification for an origin other than the configured one', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response } = env.authenticator.register(challenge.options, {
        origin: 'https://evil.example',
      });

      const tag = yield* failureTag(
        finishAddPasskey('user-1', { challengeId: challenge.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('stores the passkey under the trimmed name inside a run for the user', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      yield* TestClock.setTime(T);
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response, credential } = env.authenticator.register(challenge.options);

      const passkey = yield* finishAddPasskey('user-1', {
        challengeId: challenge.challengeId,
        response,
        name: '  Laptop ',
      });

      assert.deepStrictEqual(passkey, {
        credentialId: credential.id,
        name: 'Laptop',
        createdAt: T,
        lastUsedAt: null,
        backedUp: false,
      });
      assert.strictEqual(env.store.passkeys.get(credential.id)?.name, 'Laptop');
      assert.strictEqual(env.store.passkeys.get(credential.id)?.userId, 'user-1');
      assert.strictEqual(
        env.store.calls.find((call) => call.method === 'createPasskey')?.run,
        'user-1',
      );
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('runs the recheck inside the run of the user and stores nothing when it fails', () => {
    const env = makeEnv();
    const seen: Array<string | undefined> = [];

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response, credential } = env.authenticator.register(challenge.options);

      const tag = yield* failureTag(
        finishAddPasskey(
          'user-1',
          { challengeId: challenge.challengeId, response },
          failingRecheck(seen),
        ),
      );

      assert.strictEqual(tag, 'Revoked');
      assert.deepStrictEqual(seen, ['user-1']);
      assert.deepStrictEqual(env.unitOfWork.runs, ['user-1']);
      assert.isFalse(env.store.passkeys.has(credential.id));
      assert.isUndefined(env.store.calls.find((call) => call.method === 'createPasskey'));
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('runs a recheck that passes before it stores the passkey', () => {
    const env = makeEnv();
    const storedBefore: Array<boolean> = [];

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response, credential } = env.authenticator.register(challenge.options);

      const passkey = yield* finishAddPasskey(
        'user-1',
        { challengeId: challenge.challengeId, response },
        Effect.sync(() => {
          storedBefore.push(env.store.passkeys.has(credential.id));
        }),
      );

      assert.deepStrictEqual(storedBefore, [false]);
      assert.strictEqual(passkey.credentialId, credential.id);
      assert.isTrue(env.store.passkeys.has(credential.id));
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('uses the default name when none is given', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response } = env.authenticator.register(challenge.options);

      const passkey = yield* finishAddPasskey('user-1', {
        challengeId: challenge.challengeId,
        response,
      });

      assert.strictEqual(passkey.name, 'Passkey');
    }).pipe(Effect.provide(env.layer));
  });
  it.effect('fails verification when rawId differs from id and creates nothing', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response } = env.authenticator.register(challenge.options);

      const tag = yield* failureTag(
        finishAddPasskey('user-1', {
          challengeId: challenge.challengeId,
          response: { ...response, rawId: base64url('another') },
        }),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.isUndefined(env.store.calls.find((call) => call.method === 'createPasskey'));
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification when id and rawId are both replaced by another id', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response } = env.authenticator.register(challenge.options);
      const other = base64url('another-credential-id');

      const tag = yield* failureTag(
        finishAddPasskey('user-1', {
          challengeId: challenge.challengeId,
          response: { ...response, id: other, rawId: other },
        }),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.strictEqual(env.store.passkeys.size, 0);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('fails verification for a credential id of 1024 bytes and stores nothing', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response } = env.authenticator.register(challenge.options, {
        credentialIdLength: 1024,
      });

      const tag = yield* failureTag(
        finishAddPasskey('user-1', { challengeId: challenge.challengeId, response }),
      );

      assert.strictEqual(tag, 'PasskeyVerificationFailed');
      assert.strictEqual(env.store.passkeys.size, 0);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('accepts a credential id of 1023 bytes', () => {
    const env = makeEnv();

    return Effect.gen(function* () {
      env.store.userNames.set('user-1', 'Ann');
      const challenge = yield* beginAddPasskey('user-1');
      const { response, credential } = env.authenticator.register(challenge.options, {
        credentialIdLength: 1023,
      });

      const passkey = yield* finishAddPasskey('user-1', {
        challengeId: challenge.challengeId,
        response,
      });

      assert.strictEqual(passkey.credentialId, credential.id);
    }).pipe(Effect.provide(env.layer));
  });
});

describe('listPasskeys', () => {
  it.effect('lists only the user passkeys ordered by creation time, then credential id', () => {
    const env = makeEnv();
    env.store.passkeys.set('b', storedPasskey('b', { createdAt: 20 }));
    env.store.passkeys.set('z', storedPasskey('z', { createdAt: 10 }));
    env.store.passkeys.set('a', storedPasskey('a', { createdAt: 20 }));
    env.store.passkeys.set('x', storedPasskey('x', { userId: 'user-2', createdAt: 1 }));

    return Effect.gen(function* () {
      const passkeys = yield* listPasskeys('user-1');

      assert.deepStrictEqual(
        passkeys.map((passkey) => passkey.credentialId),
        ['z', 'a', 'b'],
      );
      assert.deepStrictEqual(passkeys[0], {
        credentialId: 'z',
        name: 'Passkey',
        createdAt: 10,
        lastUsedAt: null,
        backedUp: false,
      });
    }).pipe(Effect.provide(env.layer));
  });
});

describe('removePasskey', () => {
  it.effect('fails with an unknown credential for an id the user does not have', () => {
    const env = makeEnv();
    env.store.passkeys.set('a', storedPasskey('a'));
    env.store.passkeys.set('b', storedPasskey('b'));

    return Effect.gen(function* () {
      assert.strictEqual(
        yield* failureTag(removePasskey('user-1', 'missing')),
        'PasskeyUnknownCredential',
      );
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('refuses to remove the only passkey when the last one is kept', () => {
    const env = makeEnv();
    env.store.passkeys.set('a', storedPasskey('a'));

    return Effect.gen(function* () {
      const tag = yield* failureTag(removePasskey('user-1', 'a'));

      assert.strictEqual(tag, 'PasskeyLastCredential');
      assert.isTrue(env.store.passkeys.has('a'));
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('removes the only passkey when the last one need not be kept', () => {
    const env = makeEnv({ keepLastPasskey: false });
    env.store.passkeys.set('a', storedPasskey('a'));

    return Effect.gen(function* () {
      yield* removePasskey('user-1', 'a');

      assert.isFalse(env.store.passkeys.has('a'));
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('calls onRemoved inside the run of the user after removing', () => {
    const env = makeEnv();
    env.store.passkeys.set('a', storedPasskey('a'));
    env.store.passkeys.set('b', storedPasskey('b'));
    const removed: Array<{ userId: string; credentialId: string; run: string | undefined }> = [];

    return Effect.gen(function* () {
      yield* removePasskey('user-1', 'a', (info) =>
        Effect.gen(function* () {
          removed.push({ ...info, run: yield* CurrentRun });
        }),
      );

      assert.deepStrictEqual(removed, [{ userId: 'user-1', credentialId: 'a', run: 'user-1' }]);
      assert.isFalse(env.store.passkeys.has('a'));
      assert.deepStrictEqual(env.unitOfWork.runs, ['user-1']);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('runs the recheck inside the run of the user and removes nothing when it fails', () => {
    const env = makeEnv();
    env.store.passkeys.set('a', storedPasskey('a'));
    env.store.passkeys.set('b', storedPasskey('b'));
    const seen: Array<string | undefined> = [];
    let called = false;

    return Effect.gen(function* () {
      const tag = yield* failureTag(
        removePasskey(
          'user-1',
          'a',
          () =>
            Effect.sync(() => {
              called = true;
            }),
          failingRecheck(seen),
        ),
      );

      assert.strictEqual(tag, 'Revoked');
      assert.deepStrictEqual(seen, ['user-1']);
      assert.deepStrictEqual(env.unitOfWork.runs, ['user-1']);
      assert.isTrue(env.store.passkeys.has('a'));
      assert.isFalse(called);
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('runs a recheck that passes before it removes the passkey', () => {
    const env = makeEnv();
    env.store.passkeys.set('a', storedPasskey('a'));
    env.store.passkeys.set('b', storedPasskey('b'));
    const presentBefore: Array<boolean> = [];

    return Effect.gen(function* () {
      yield* removePasskey(
        'user-1',
        'a',
        undefined,
        Effect.sync(() => {
          presentBefore.push(env.store.passkeys.has('a'));
        }),
      );

      assert.deepStrictEqual(presentBefore, [true]);
      assert.isFalse(env.store.passkeys.has('a'));
    }).pipe(Effect.provide(env.layer));
  });

  it.effect('does not call onRemoved when nothing was removed', () => {
    const env = makeEnv();
    env.store.passkeys.set('a', storedPasskey('a'));
    let called = false;

    return Effect.gen(function* () {
      yield* Effect.exit(
        removePasskey('user-1', 'a', () =>
          Effect.sync(() => {
            called = true;
          }),
        ),
      );

      assert.isFalse(called);
    }).pipe(Effect.provide(env.layer));
  });
  it.effect('fails with an unknown credential for the passkey of another user', () => {
    const env = makeEnv();
    env.store.passkeys.set('a', storedPasskey('a'));
    env.store.passkeys.set('b', storedPasskey('b'));

    return Effect.gen(function* () {
      const tag = yield* failureTag(removePasskey('user-2', 'a'));

      assert.strictEqual(tag, 'PasskeyUnknownCredential');
      assert.isTrue(env.store.passkeys.has('a'));
    }).pipe(Effect.provide(env.layer));
  });
});
