// SPDX-License-Identifier: EUPL-1.2
import { assert, layer } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Deferred, Effect, Fiber } from 'effect';
import { lockCounter } from '../changes/change-log';
import { lookupSession } from '../auth/lookups';
import { createSignUpLink } from '../auth/sign-up-links';
import { hashToken } from '../auth/tokens';
import { appDatabase, Db } from '../db/database';
import { sessions } from '../db/schema';
import { withOwner } from '../db/with-owner';
import {
  addPasskeyOverHttp,
  challengeOf,
  cookiePairOf,
  cookieValueOf,
  makeHttp,
  recoveryCodesOf,
  signInOverHttp,
  signUpOverHttp,
  unknownToken,
} from '../test/http';
import { newSoftAuthenticator } from '../test/sign-up';
import { removeOwner } from '../test/owners';

// These tests run against the real database (docker compose) through the web handler, on the
// real clock. Tests never print tokens, cookies or recovery codes, so every check on a value
// that holds one is a boolean.

const TIMEOUT = 30_000;

const SESSION_SET_COOKIE =
  /^__Host-asys_session=[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Lax$/;

layer(appDatabase(), { excludeTestServices: true })('passkey endpoints', (it) => {
  it.effect(
    'refuses a passkey removal from a foreign origin and keeps the passkey',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie, credential } = yield* signUpOverHttp(http);

        const refused = yield* http.send(`/v1/auth/passkeys/${credential.id}`, {
          method: 'DELETE',
          cookie,
          origin: 'https://evil.example',
        });
        assert.strictEqual(refused.status, 403);

        const listed = yield* http.send('/v1/auth/passkeys', { cookie });
        const ids = (listed.json as ReadonlyArray<{ credentialId: string }>).map(
          (passkey) => passkey.credentialId,
        );
        assert.strictEqual(listed.status, 200);
        assert.deepStrictEqual(ids, [credential.id]);
      }),
    TIMEOUT,
  );

  it.effect(
    'signs up with ten recovery codes and one session cookie that works',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const link = yield* createSignUpLink({ expiresInDays: 7 });
        yield* Effect.addFinalizer(() => removeOwner(link.ownerId).pipe(Effect.orDie));
        const authenticator = newSoftAuthenticator();

        const begun = yield* http.send('/v1/auth/register/options', {
          body: { token: link.token, name: 'Ann' },
        });
        assert.strictEqual(begun.status, 200);
        const challenge = challengeOf(begun, 'register/options');
        const { response } = authenticator.register(challenge.options);

        const registered = yield* http.send('/v1/auth/register', {
          body: {
            token: link.token,
            timeZone: 'Europe/Amsterdam',
            challengeId: challenge.challengeId,
            response,
          },
        });
        assert.strictEqual(registered.status, 200);
        assert.strictEqual(recoveryCodesOf(registered).length, 10);
        assert.strictEqual(registered.setCookies.length, 1);
        assert.isTrue(SESSION_SET_COOKIE.test(registered.setCookies[0]));

        const me = yield* http.send('/v1/auth/me', {
          cookie: cookiePairOf(registered.setCookies[0]),
        });
        assert.strictEqual(me.status, 200);
        assert.deepStrictEqual(me.json, { name: 'Ann', recoveryCodesLeft: 10 });
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 410 SignUpLinkInvalid for an unknown sign-up token',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();

        const reply = yield* http.send('/v1/auth/register/options', {
          body: { token: unknownToken(), name: 'Ann' },
        });

        assert.strictEqual(reply.status, 410);
        assert.deepStrictEqual(reply.json, { _tag: 'SignUpLinkInvalid' });
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 400 for an unknown time zone at registration',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const link = yield* createSignUpLink({ expiresInDays: 7 });
        yield* Effect.addFinalizer(() => removeOwner(link.ownerId).pipe(Effect.orDie));
        const authenticator = newSoftAuthenticator();
        const begun = yield* http.send('/v1/auth/register/options', {
          body: { token: link.token, name: 'Ann' },
        });
        const challenge = challengeOf(begun, 'register/options');
        const { response } = authenticator.register(challenge.options);

        const reply = yield* http.send('/v1/auth/register', {
          body: {
            token: link.token,
            timeZone: 'Mars/Base',
            challengeId: challenge.challengeId,
            response,
          },
        });

        assert.strictEqual(reply.status, 400);
        assert.strictEqual(reply.setCookies.length, 0);
      }),
    TIMEOUT,
  );

  it.effect(
    'signs in with a passkey and starts a new session',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie, authenticator, credential } = yield* signUpOverHttp(http, {
          name: 'Ann',
        });

        const signedIn = yield* signInOverHttp(http, authenticator, credential);

        assert.strictEqual(signedIn.status, 200);
        assert.deepStrictEqual(signedIn.json, { name: 'Ann', recoveryCodesLeft: 10 });
        assert.strictEqual(signedIn.setCookies.length, 1);
        assert.isTrue(SESSION_SET_COOKIE.test(signedIn.setCookies[0]));
        assert.isTrue(
          cookieValueOf(cookiePairOf(signedIn.setCookies[0])) !== cookieValueOf(cookie),
        );
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 404 PasskeyUnknownCredential when the assertion names an unknown id',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { authenticator, credential } = yield* signUpOverHttp(http);
        const begun = yield* http.send('/v1/auth/authenticate/options', { body: {} });
        const challenge = challengeOf(begun, 'authenticate/options');
        const response = authenticator.authenticate(challenge.options, credential);
        const unknownId = unknownToken();

        const reply = yield* http.send('/v1/auth/authenticate', {
          body: {
            challengeId: challenge.challengeId,
            response: { ...response, id: unknownId, rawId: unknownId },
          },
        });

        assert.strictEqual(reply.status, 404);
        assert.deepStrictEqual(reply.json, { _tag: 'PasskeyUnknownCredential' });
        assert.strictEqual(reply.setCookies.length, 0);
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 401 PasskeyVerificationFailed for a tampered signature, without a cookie',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { authenticator, credential } = yield* signUpOverHttp(http);

        const reply = yield* signInOverHttp(http, authenticator, credential, { tamper: true });

        assert.strictEqual(reply.status, 401);
        assert.deepStrictEqual(reply.json, { _tag: 'PasskeyVerificationFailed' });
        assert.strictEqual(reply.setCookies.length, 0);
      }),
    TIMEOUT,
  );

  it.effect(
    'adds, lists, signs in with and removes a second passkey',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie, authenticator, credential } = yield* signUpOverHttp(http);

        const added = yield* addPasskeyOverHttp(http, cookie, authenticator);
        assert.strictEqual(added.reply.status, 201);

        const listed = yield* http.send('/v1/auth/passkeys', { cookie });
        const ids = (listed.json as ReadonlyArray<{ credentialId: string }>).map(
          (passkey) => passkey.credentialId,
        );
        assert.strictEqual(listed.status, 200);
        assert.strictEqual(ids.length, 2);
        assert.isTrue(ids.includes(credential.id));
        assert.isTrue(ids.includes(added.credential.id));

        const signedIn = yield* signInOverHttp(http, authenticator, added.credential);
        assert.strictEqual(signedIn.status, 200);
        const secondCookie = cookiePairOf(signedIn.setCookies[0]);

        const removed = yield* http.send(`/v1/auth/passkeys/${added.credential.id}`, {
          method: 'DELETE',
          cookie,
        });
        assert.strictEqual(removed.status, 204);

        const secondAfter = yield* http.send('/v1/auth/me', { cookie: secondCookie });
        assert.strictEqual(secondAfter.status, 401);
        const firstAfter = yield* http.send('/v1/auth/me', { cookie });
        assert.strictEqual(firstAfter.status, 200);

        const last = yield* http.send(`/v1/auth/passkeys/${credential.id}`, {
          method: 'DELETE',
          cookie,
        });
        assert.strictEqual(last.status, 409);
        assert.deepStrictEqual(last.json, { _tag: 'PasskeyLastCredential' });
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 400 for a credential id that is not base64url',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie } = yield* signUpOverHttp(http);

        const reply = yield* http.send('/v1/auth/passkeys/a+b', { method: 'DELETE', cookie });

        assert.strictEqual(reply.status, 400);
      }),
    TIMEOUT,
  );

  it.effect(
    'adds and removes a passkey with a 171 character credential id',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie, authenticator } = yield* signUpOverHttp(http);

        const added = yield* addPasskeyOverHttp(http, cookie, authenticator, {
          credentialIdLength: 128,
        });
        assert.strictEqual(added.credential.id.length, 171);
        assert.strictEqual(added.reply.status, 201);

        const removed = yield* http.send(`/v1/auth/passkeys/${added.credential.id}`, {
          method: 'DELETE',
          cookie,
        });
        assert.strictEqual(removed.status, 204);
      }),
    TIMEOUT,
  );

  it.effect(
    'answers an empty 401 and keeps both passkeys when the session is revoked while the removal waits for the owner lock',
    () =>
      Effect.gen(function* () {
        const http = yield* makeHttp();
        const { cookie, authenticator, credential } = yield* signUpOverHttp(http);
        const added = yield* addPasskeyOverHttp(http, cookie, authenticator);
        assert.strictEqual(added.reply.status, 201);
        const signedIn = yield* signInOverHttp(http, authenticator, added.credential);
        assert.strictEqual(signedIn.status, 200);
        const otherCookie = cookiePairOf(signedIn.setCookies[0]);

        const found = yield* lookupSession(hashToken(cookieValueOf(cookie)));
        if (found === undefined) {
          return yield* Effect.die('The session of the cookie was not found');
        }

        const holding = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const holder = yield* Effect.forkChild(
          withOwner(
            found.ownerId,
            Effect.gen(function* () {
              yield* lockCounter;
              const db = yield* Db;
              yield* db.delete(sessions).where(eq(sessions.id, found.id));
              yield* Deferred.succeed(holding, undefined);
              yield* Deferred.await(release);
            }),
          ),
        );
        yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined));
        yield* Deferred.await(holding);

        const removal = yield* Effect.forkChild(
          http.send(`/v1/auth/passkeys/${added.credential.id}`, { method: 'DELETE', cookie }),
        );
        yield* Effect.sleep('500 millis');
        const waiting = removal.pollUnsafe() === undefined;
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(holder);
        const reply = yield* Fiber.join(removal);

        assert.isTrue(waiting);
        assert.strictEqual(reply.status, 401);
        assert.strictEqual(reply.text, '');

        const listed = yield* http.send('/v1/auth/passkeys', { cookie: otherCookie });
        const ids = (listed.json as ReadonlyArray<{ credentialId: string }>).map(
          (passkey) => passkey.credentialId,
        );
        assert.strictEqual(listed.status, 200);
        assert.strictEqual(ids.length, 2);
        assert.isTrue(ids.includes(credential.id));
        assert.isTrue(ids.includes(added.credential.id));
        const me = yield* http.send('/v1/auth/me', { cookie: otherCookie });
        assert.strictEqual(me.status, 200);
      }),
    15_000,
  );
});
