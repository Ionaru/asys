// SPDX-License-Identifier: EUPL-1.2
import { assert, layer } from '@effect/vitest';
import { Effect } from 'effect';
import { appDatabase, Db, ownerDatabase } from '../db/database';
import { sessions } from '../db/schema';
import { withOwner } from '../db/with-owner';
import {
  cookiePairOf,
  cookieValueOf,
  makeHttp,
  recoveryCodesOf,
  signInOverHttp,
  signUpOverHttp,
} from '../test/http';

// These tests run against the real database (docker compose) through the web handler, on the
// real clock. Tests never print tokens, cookies or recovery codes, so every check on a value
// that holds one is a boolean.

const TIMEOUT = 30_000;

const DAY_MS = 86_400_000;

const EXPIRED_COOKIE =
  '__Host-asys_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax';

/** Moves the expiry of every session of the owner, as the table owner. */
const expireIn = (ownerId: string, days: number) =>
  withOwner(
    ownerId,
    Effect.gen(function* () {
      const db = yield* Db;
      yield* db.update(sessions).set({ expiresAt: new Date(Date.now() + days * DAY_MS) });
    }),
  ).pipe(Effect.provide(ownerDatabase()));

layer(appDatabase(), { excludeTestServices: true })('account endpoints', (it) => {
  it.effect(
    'refuses a sign-out from a foreign origin and keeps the session',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);

        const refused = yield* http.send('/v1/auth/signout', {
          method: 'POST',
          cookie,
          origin: 'https://evil.example',
        });
        assert.strictEqual(refused.status, 403);

        const me = yield* http.send('/v1/auth/me', { cookie });
        assert.strictEqual(me.status, 200);
      }),
    TIMEOUT,
  );

  it.effect(
    'signs in with the second recovery code and ends the other sessions',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie, recoveryCodes } = yield* signUpOverHttp(http);
        assert.strictEqual(recoveryCodes.length, 10);

        const recovered = yield* http.send('/v1/auth/recover', {
          body: { code: recoveryCodes[1] },
        });
        assert.strictEqual(recovered.status, 200);
        assert.deepStrictEqual(recovered.json, { recoveryCodesLeft: 9 });
        assert.strictEqual(recovered.setCookies.length, 1);
        const newCookie = cookiePairOf(recovered.setCookies[0]);

        const oldSession = yield* http.send('/v1/auth/me', { cookie });
        assert.strictEqual(oldSession.status, 401);
        const newSession = yield* http.send('/v1/auth/me', { cookie: newCookie });
        assert.strictEqual(newSession.status, 200);
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 401 SignInFailed for a bad recovery code',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        yield* signUpOverHttp(http);

        const reply = yield* http.send('/v1/auth/recover', {
          body: { code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' },
        });

        assert.strictEqual(reply.status, 401);
        assert.deepStrictEqual(reply.json, { _tag: 'SignInFailed' });
        assert.strictEqual(reply.setCookies.length, 0);
      }),
    TIMEOUT,
  );

  it.effect(
    'renews a session with less than 29 days left with the same token and a fresh Max-Age',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { ownerId, cookie } = yield* signUpOverHttp(http);

        const fresh = yield* http.send('/v1/meta', { cookie });
        assert.strictEqual(fresh.status, 200);
        assert.strictEqual(fresh.setCookies.length, 0);

        yield* expireIn(ownerId, 28);
        const renewed = yield* http.send('/v1/meta', { cookie });

        assert.strictEqual(renewed.status, 200);
        assert.strictEqual(renewed.setCookies.length, 1);
        const header = renewed.setCookies[0];
        assert.isTrue(cookieValueOf(cookiePairOf(header)) === cookieValueOf(cookie));
        assert.isTrue(header.includes('Max-Age=2592000'));
      }),
    TIMEOUT,
  );

  it.effect(
    'signs out with an expired cookie and ends the session',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);

        const reply = yield* http.send('/v1/auth/signout', { method: 'POST', cookie });

        assert.strictEqual(reply.status, 204);
        assert.isTrue(reply.setCookies.length === 1);
        assert.isTrue(reply.setCookies[0] === EXPIRED_COOKIE);

        const after = yield* http.send('/v1/auth/me', { cookie });
        assert.strictEqual(after.status, 401);
      }),
    TIMEOUT,
  );

  it.effect(
    'regenerates ten recovery codes and ends the other sessions',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie, authenticator, credential } = yield* signUpOverHttp(http);
        const second = yield* signInOverHttp(http, authenticator, credential);
        assert.strictEqual(second.status, 200);
        const secondCookie = cookiePairOf(second.setCookies[0]);

        const regenerated = yield* http.send('/v1/auth/recovery-codes', {
          method: 'POST',
          cookie,
        });
        const fresh = recoveryCodesOf(regenerated);
        assert.strictEqual(regenerated.status, 200);
        assert.strictEqual(fresh.length, 10);

        const secondAfter = yield* http.send('/v1/auth/me', { cookie: secondCookie });
        assert.strictEqual(secondAfter.status, 401);
        const firstAfter = yield* http.send('/v1/auth/me', { cookie });
        assert.strictEqual(firstAfter.status, 200);
      }),
    TIMEOUT,
  );
});
