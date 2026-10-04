// SPDX-License-Identifier: EUPL-1.2
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';
import { appDatabase } from '../db/database';
import { startServer } from '../test/http';
import { HASHED, INDEX_HTML, makeStaticRoot, MARKER } from '../test/static-root';
import {
  CacheControl,
  CONTENT_SECURITY_POLICY,
  cacheControlFor,
  StaticRootInvalid,
} from './static-files';

// The socket tests open real sockets on port 0 and run against the real database (docker compose).

const TIMEOUT = 30_000;

interface Answer {
  readonly status: number;
  readonly headers: Headers;
  readonly text: string;
}

type Server = Effect.Success<ReturnType<typeof startServer>>;

const get = (
  server: Server,
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
): Effect.Effect<Answer> =>
  Effect.promise(async () => {
    const response = await fetch(`${server.base}${path}`, { method, headers });

    return { status: response.status, headers: response.headers, text: await response.text() };
  });

const HTML = { accept: 'text/html' };

const expectAnswer = (answer: Answer, status: number, cacheControl: CacheControl) => {
  assert.strictEqual(answer.status, status);
  assert.strictEqual(answer.headers.get('cache-control'), cacheControl);
  assert.strictEqual(answer.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
};

const sentLines = (server: Server) =>
  server.lines.filter((line) => line.includes('Sent HTTP response'));

const isMetaLine = (line: string) => /http\.url=\/v1\/meta(\s|$)/.test(line);

const waitFor = (condition: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 40 && !condition(); attempt++) {
      yield* Effect.sleep('50 millis');
    }
  });

describe('cacheControlFor', () => {
  const immutable = [
    '/main-ABCDEFGH.js',
    '/chunk-9NWjWR-i.js',
    '/chunk-Dc_ThKKr.js',
    '/styles-ABCDEFGH.css',
    '/polyfills-ABCDEFGH.js',
    '/media/AtkinsonHyperlegibleNext-Variable-4LEQQAMU.woff2',
  ];

  const noCache = [
    '/',
    '/index.html',
    '/inbox',
    '/ngsw.json',
    '/ngsw-worker.js',
    '/safety-worker.js',
    '/worker-basic.min.js',
    '/manifest.webmanifest',
    '/icons/icon.svg',
    '/chunk-short.js',
    '/chunk-ABCDEFGHI.js',
    '/main-ABCDEFGH.js.map',
    '/media/font-4leqqamu.woff2',
    '/sub/main-ABCDEFGH.js',
  ];

  for (const path of immutable) {
    it(`caches ${path} as immutable`, () => {
      assert.strictEqual(cacheControlFor(path), CacheControl.Immutable);
    });
  }

  for (const path of noCache) {
    it(`does not cache ${path}`, () => {
      assert.strictEqual(cacheControlFor(path), CacheControl.NoCache);
    });
  }

  it('uses the contract header values', () => {
    assert.strictEqual(CacheControl.Immutable, 'public, max-age=31536000, immutable');
    assert.strictEqual(CacheControl.NoCache, 'no-cache');
  });
});

layer(appDatabase(), { excludeTestServices: true })('static files over a socket', (it) => {
  it.effect(
    'serves the app shell for the root and for client routes, uncached',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        for (const path of ['/', '/inbox', '/inbox?x=1', '/v1x']) {
          const answer = yield* get(server, path, HTML);
          expectAnswer(answer, 200, CacheControl.NoCache);
          assert.strictEqual(answer.text, INDEX_HTML);
        }
      }),
    TIMEOUT,
  );

  it.effect(
    'serves worker, manifest and icon files uncached with their own content',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        for (const path of [
          '/ngsw.json?ngsw-cache-bust=0.1',
          '/ngsw-worker.js',
          '/icons/icon.svg',
        ]) {
          const answer = yield* get(server, path);
          expectAnswer(answer, 200, CacheControl.NoCache);
          assert.notStrictEqual(answer.text, INDEX_HTML);
        }

        const manifest = yield* get(server, '/manifest.webmanifest');
        expectAnswer(manifest, 200, CacheControl.NoCache);
        assert.isTrue(
          (manifest.headers.get('content-type') ?? '').startsWith('application/manifest+json'),
        );
      }),
    TIMEOUT,
  );

  it.effect(
    'serves hashed files as immutable, with and without a query',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        for (const path of [...HASHED, '/main-ABCDEFGH.js?v=1']) {
          const answer = yield* get(server, path);
          expectAnswer(answer, 200, CacheControl.Immutable);
          assert.notStrictEqual(answer.text, INDEX_HTML);
        }
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 304 for a matching ETag and keeps the Cache-Control of the 200',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        for (const [path, cacheControl] of [
          ['/', CacheControl.NoCache],
          ['/main-ABCDEFGH.js', CacheControl.Immutable],
        ] as const) {
          const first = yield* get(server, path);
          const etag = first.headers.get('etag');
          assert.isNotNull(etag);

          const again = yield* get(server, path, { 'if-none-match': etag ?? '' });
          expectAnswer(again, 304, cacheControl);
        }
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 404 for a missing asset, an unknown file and a non-HTML client route',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        const short = yield* get(server, '/chunk-short.js');
        expectAnswer(short, 404, CacheControl.NoCache);

        const missing = yield* get(server, '/missing.js');
        assert.strictEqual(missing.status, 404);

        const json = yield* get(server, '/inbox', { accept: 'application/json' });
        assert.strictEqual(json.status, 404);
      }),
    TIMEOUT,
  );

  it.effect(
    'does not mark a missing hashed file as immutable, while an existing one stays immutable',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        const missing = yield* get(server, '/main-ZZZZZZZZ.js');
        expectAnswer(missing, 404, CacheControl.NoCache);

        const existing = yield* get(server, '/main-ABCDEFGH.js');
        expectAnswer(existing, 200, CacheControl.Immutable);
      }),
    TIMEOUT,
  );

  it.effect(
    'keeps serving after a hashed file cannot be read',
    () =>
      Effect.gen(function* () {
        if (process.getuid?.() === 0) return;
        const root = yield* makeStaticRoot;
        const file = join(root, 'chunk-9NWjWR-i.js');
        yield* Effect.acquireRelease(
          Effect.sync(() => chmodSync(file, 0o000)),
          () => Effect.sync(() => chmodSync(file, 0o644)),
        );
        const server = yield* startServer({ staticRoot: root });

        // The file is opened while the body streams, so the request may fail at the connection.
        const broken = yield* get(server, '/chunk-9NWjWR-i.js').pipe(Effect.exit);
        if (Exit.isSuccess(broken)) {
          assert.isAtLeast(broken.value.status, 400);
          assert.strictEqual(broken.value.headers.get('cache-control'), CacheControl.NoCache);
        }

        const sibling = yield* get(server, '/chunk-Dc_ThKKr.js');
        expectAnswer(sibling, 200, CacheControl.Immutable);

        const health = yield* get(server, '/health');
        assert.strictEqual(health.status, 200);
      }),
    TIMEOUT,
  );

  it.effect(
    'keeps /v1 for the API: an empty 404 for unknown paths, the API for known ones',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        for (const path of ['/v1', '/v1?x=1', '/v1/nope', '/V1/nope']) {
          const answer = yield* get(server, path, HTML);
          assert.strictEqual(answer.status, 404);
          assert.strictEqual(answer.text, '');
          assert.strictEqual(
            answer.headers.get('content-security-policy'),
            CONTENT_SECURITY_POLICY,
          );
        }

        const meta = yield* get(server, '/v1/meta');
        assert.strictEqual(meta.status, 401);

        const health = yield* get(server, '/health');
        assert.strictEqual(health.status, 200);
        assert.include(health.text, '"status":"ok"');
        assert.notInclude(health.text, MARKER);
      }),
    TIMEOUT,
  );

  it.effect(
    'answers HEAD / with an empty body',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });

        const answer = yield* get(server, '/', HTML, 'HEAD');

        assert.strictEqual(answer.status, 200);
        assert.strictEqual(answer.text, '');
      }),
    TIMEOUT,
  );

  it.effect(
    'writes no request log line for static answers while /v1/meta still logs',
    () =>
      Effect.gen(function* () {
        const root = yield* makeStaticRoot;
        const server = yield* startServer({ staticRoot: root });
        const etag = (yield* get(server, '/')).headers.get('etag') ?? '';

        yield* get(server, '/', HTML);
        yield* get(server, '/inbox', HTML);
        yield* get(server, '/main-ABCDEFGH.js');
        yield* get(server, '/', { 'if-none-match': etag });
        yield* get(server, '/missing.js');
        yield* get(server, '/v1/nope', HTML);
        yield* get(server, '/', HTML, 'HEAD');
        yield* get(server, '/v1/meta');
        yield* waitFor(() => sentLines(server).some(isMetaLine));

        assert.isTrue(sentLines(server).some(isMetaLine));
        assert.deepStrictEqual(
          sentLines(server).filter((line) => !isMetaLine(line)),
          [],
        );
      }),
    TIMEOUT,
  );

  it.effect(
    'answers 404 for / when the server has no static root',
    () =>
      Effect.gen(function* () {
        const server = yield* startServer();

        const answer = yield* get(server, '/', HTML);

        assert.strictEqual(answer.status, 404);
      }),
    TIMEOUT,
  );

  it.effect(
    'fails to start when the static root has no index.html',
    () =>
      Effect.gen(function* () {
        const root = yield* Effect.acquireRelease(
          Effect.sync(() => mkdtempSync(join(tmpdir(), 'asys-static-empty-'))),
          (directory) => Effect.sync(() => rmSync(directory, { recursive: true, force: true })),
        );

        const error = yield* Effect.flip(startServer({ staticRoot: root }));

        assert.instanceOf(error, StaticRootInvalid);
      }),
    TIMEOUT,
  );
});
