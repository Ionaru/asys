/**
 * Trial CLI (ADR 0001): lists the direct members of one Google Group through the
 * Cloud Identity Groups API, after an OAuth installed-app sign-in on a loopback
 * redirect. Reads GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_GROUP_EMAIL,
 * prints the member count and emails, and keeps no tokens.
 *
 * Run from the workspace root:
 *   node --env-file=.env apps/server/src/google/list-group-members.ts
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { runMain } from '@effect/platform-node/NodeRuntime';
import { Config, Console, Data, Effect, Redacted, Schema } from 'effect';
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient';
import * as HttpClient from 'effect/unstable/http/HttpClient';
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest';
import type * as HttpClientResponse from 'effect/unstable/http/HttpClientResponse';

// The narrowest scope that covers groups:lookup and memberships.list.
const scope = 'https://www.googleapis.com/auth/cloud-identity.groups.readonly';
const authorizeUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenUrl = 'https://oauth2.googleapis.com/token';
const cloudIdentity = 'https://cloudidentity.googleapis.com/v1';

class GoogleError extends Data.TaggedError('GoogleError')<{
  readonly step: string;
  readonly detail: string;
}> {}

const TokenResponse = Schema.Struct({ access_token: Schema.String });
const GroupLookup = Schema.Struct({ name: Schema.String });
const MembershipPage = Schema.Struct({
  memberships: Schema.optional(
    Schema.Array(
      Schema.Struct({
        preferredMemberKey: Schema.Struct({ id: Schema.String }),
        type: Schema.optional(Schema.String),
      }),
    ),
  ),
  nextPageToken: Schema.optional(Schema.String),
});

/** Decodes a successful JSON response; otherwise fails with Google's status and body verbatim. */
const decodeJson =
  <S extends Schema.Constraint>(step: string, schema: S) =>
  (response: HttpClientResponse.HttpClientResponse) =>
    Effect.gen(function* () {
      const body = yield* response.text;
      if (response.status < 200 || response.status >= 300) {
        return yield* new GoogleError({
          step,
          detail: `HTTP ${response.status}\n${body}`,
        });
      }
      const json = yield* Effect.try({
        try: () => JSON.parse(body) as unknown,
        catch: () => new GoogleError({ step, detail: `not JSON:\n${body}` }),
      });
      return yield* Schema.decodeUnknownEffect(schema)(json);
    });

const listen = Effect.acquireRelease(
  Effect.callback<Server>((resume) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => resume(Effect.succeed(server)));
  }),
  (server) =>
    Effect.sync(() => {
      server.closeAllConnections();
      server.close();
    }),
);

/** Waits for Google's redirect to the loopback address and returns the authorization code. */
const awaitRedirect = (server: Server, state: string) =>
  Effect.callback<string, GoogleError>((resume) => {
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/') {
        response.writeHead(404).end();
        return;
      }
      response
        .writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        .end('ASYS trial: sign-in received. You can close this tab.');
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (error) {
        resume(Effect.fail(new GoogleError({ step: 'authorize', detail: error })));
      } else if (url.searchParams.get('state') !== state) {
        resume(Effect.fail(new GoogleError({ step: 'authorize', detail: 'state mismatch' })));
      } else if (!code) {
        resume(Effect.fail(new GoogleError({ step: 'authorize', detail: 'no code in redirect' })));
      } else {
        resume(Effect.succeed(code));
      }
    });
  });

const program = Effect.gen(function* () {
  const clientId = yield* Config.String('GOOGLE_CLIENT_ID');
  const clientSecret = yield* Config.Redacted('GOOGLE_CLIENT_SECRET');
  const groupEmail = yield* Config.String('GOOGLE_GROUP_EMAIL');
  const client = yield* HttpClient.HttpClient;

  // PKCE (S256) and state, per Google's OAuth 2.0 for desktop apps.
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');

  const server = yield* listen;
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const authorize = new URL(authorizeUrl);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();
  yield* Console.log(
    `Open this URL in your browser and sign in with your work account:\n\n${authorize.href}\n`,
  );
  const code = yield* awaitRedirect(server, state).pipe(Effect.timeout('5 minutes'));

  const token = yield* client
    .execute(
      HttpClientRequest.post(tokenUrl).pipe(
        HttpClientRequest.bodyUrlParams({
          client_id: clientId,
          client_secret: Redacted.value(clientSecret),
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      ),
    )
    .pipe(Effect.flatMap(decodeJson('token exchange', TokenResponse)));
  const accessToken = Redacted.make(token.access_token);

  const group = yield* client
    .execute(
      HttpClientRequest.get(`${cloudIdentity}/groups:lookup`, {
        urlParams: { 'groupKey.id': groupEmail },
      }).pipe(HttpClientRequest.bearerToken(accessToken)),
    )
    .pipe(Effect.flatMap(decodeJson('groups:lookup', GroupLookup)));

  const members: Array<{ readonly id: string; readonly type?: string }> = [];
  let pageToken: string | undefined;
  do {
    const page = yield* client
      .execute(
        HttpClientRequest.get(`${cloudIdentity}/${group.name}/memberships`, {
          urlParams: { pageSize: '1000', ...(pageToken ? { pageToken } : {}) },
        }).pipe(HttpClientRequest.bearerToken(accessToken)),
      )
      .pipe(Effect.flatMap(decodeJson('memberships.list', MembershipPage)));
    for (const membership of page.memberships ?? []) {
      members.push({ id: membership.preferredMemberKey.id, type: membership.type });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  yield* Console.log(`${groupEmail} has ${members.length} direct members:`);
  for (const member of members) {
    // Nested groups are listed, not expanded.
    const kind = member.type && member.type !== 'USER' ? ` (${member.type})` : '';
    yield* Console.log(`${member.id}${kind}`);
  }
}).pipe(
  Effect.scoped,
  Effect.catchTag('GoogleError', (error) =>
    Console.error(`Google ${error.step} failed:\n${error.detail}`).pipe(
      Effect.andThen(
        Effect.sync(() => {
          process.exitCode = 1;
        }),
      ),
    ),
  ),
  Effect.provide(FetchHttpClient.layer),
);

runMain(program);
