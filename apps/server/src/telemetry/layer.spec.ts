// SPDX-License-Identifier: EUPL-1.2
import { randomUUID } from 'node:crypto';
import { assert, describe, it, layer } from '@effect/vitest';
import { Cause, ConfigProvider, Effect, Exit, Layer, Logger, Option } from 'effect';
import { vi } from 'vitest';
import { OtlpSerialization, OtlpTracer } from 'effect/observability';
import { Db, appDatabase } from '../db/database';
import { jobs } from '../db/schema';
import { withOwner } from '../db/with-owner';
import { describeError } from '../logging/describe-error';
import { makeRedactingLogger } from '../logging/logger';
import { JobRegistry } from '../jobs/registry';
import { JobOutcome, runDueJobs } from '../jobs/worker';
import { startServer } from '../test/http';
import {
  attributeOf,
  type Capture,
  LOGS_URL,
  logRecordsOf,
  makeCapture,
  type OtlpSpan,
  spansOf,
  telemetryUnderTest,
  textOf,
  TRACES_URL,
} from '../test/otlp-capture';
import { removeOwner, scopedOwner } from '../test/owners';
import { HASHED, makeStaticRoot } from '../test/static-root';
import { scrubbingSerialization } from './scrub';
import { telemetryConfig, telemetryLayer } from './layer';

// The socket tests open real sockets on port 0 and run against the real database (docker compose).
// Each test builds the telemetry layer in its own scope and reads the capture after it closed.

const TIMEOUT = 30_000;

const SECRET = 'secret-123';

const bandAt = (seconds: number) => new Date(Date.UTC(1900, 0, 1, 0, 0, seconds));

const SENSITIVE_SERVER_KEYS = [
  'url.full',
  'url.path',
  'url.query',
  'client.address',
  'user_agent.original',
];

const fetchFrom = (base: string, path: string, init: RequestInit = {}) =>
  Effect.promise(async () => {
    const response = await fetch(`${base}${path}`, init);
    await response.text();

    return response.status;
  });

/** Lets the server finish its spans before the scope closes. */
const settle = Effect.sleep('300 millis');

const serverSpanFor = (capture: Capture, route: string): OtlpSpan => {
  const span = spansOf(capture).find(
    (candidate) =>
      candidate.name === 'http.server GET' &&
      attributeOf(candidate.attributes, 'http.route') === route,
  );
  if (span === undefined) throw new Error(`No server span for ${route}`);

  return span;
};

layer(appDatabase(), { excludeTestServices: true })('telemetry over a socket', (it) => {
  it.effect(
    'exports one server span for an API request, without the URL, client or headers',
    () =>
      Effect.gen(function* () {
        const capture = makeCapture();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const server = yield* startServer({ around: telemetryUnderTest(capture) });
            const status = yield* fetchFrom(server.base, '/v1/meta', {
              headers: { 'user-agent': 'secret-agent-77', cookie: 'asys_session=secret-cookie-88' },
            });
            assert.strictEqual(status, 401);
            yield* settle;
          }),
        );

        const spans = spansOf(capture).filter((span) => span.name.startsWith('http.server'));
        assert.strictEqual(spans.length, 1);
        const span = spans[0];
        assert.strictEqual(span.name, 'http.server GET');
        assert.strictEqual(attributeOf(span.attributes, 'http.route'), '/v1/meta');
        assert.strictEqual(attributeOf(span.attributes, 'http.response.status_code'), '401');
        for (const attribute of span.attributes) {
          assert.notInclude(SENSITIVE_SERVER_KEYS, attribute.key);
          assert.isFalse(attribute.key.startsWith('http.request.header.'), attribute.key);
        }

        const text = textOf(capture);
        assert.notInclude(text, 'secret-agent-77');
        assert.notInclude(text, 'secret-cookie-88');
        assert.notInclude(text, '127.0.0.1');
      }),
    TIMEOUT,
  );

  it.effect(
    'exports a server span for a request whose path differs in case',
    () =>
      Effect.gen(function* () {
        const capture = makeCapture();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const server = yield* startServer({ around: telemetryUnderTest(capture) });
            assert.strictEqual(yield* fetchFrom(server.base, '/V1/meta'), 401);
            yield* settle;
          }),
        );

        const spans = spansOf(capture).filter((span) => span.name === 'http.server GET');
        assert.strictEqual(spans.length, 1);
        assert.strictEqual(attributeOf(spans[0].attributes, 'http.response.status_code'), '401');
      }),
    TIMEOUT,
  );

  it.effect(
    'never exports a query string',
    () =>
      Effect.gen(function* () {
        const capture = makeCapture();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const server = yield* startServer({ around: telemetryUnderTest(capture) });
            yield* fetchFrom(server.base, `/v1/meta?x=${SECRET}`);
            yield* settle;
          }),
        );

        assert.isDefined(serverSpanFor(capture, '/v1/meta'));
        assert.notInclude(textOf(capture), SECRET);
      }),
    TIMEOUT,
  );

  it.effect(
    'exports no span for the health probe or a static file, SQL spans included',
    () =>
      Effect.gen(function* () {
        const capture = makeCapture();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const root = yield* makeStaticRoot;
            const server = yield* startServer({
              staticRoot: root,
              around: telemetryUnderTest(capture),
            });
            assert.strictEqual(yield* fetchFrom(server.base, '/health'), 200);
            assert.strictEqual(yield* fetchFrom(server.base, HASHED[0]), 200);
            assert.strictEqual(yield* fetchFrom(server.base, '/v1/meta'), 401);
            yield* settle;
          }),
        );

        const meta = serverSpanFor(capture, '/v1/meta');
        // PgDrizzle.make is the database layer being built when the server starts, not a request.
        const spans = spansOf(capture).filter((span) => span.name !== 'PgDrizzle.make');
        assert.isAbove(spans.length, 0);
        for (const span of spans) {
          assert.strictEqual(span.traceId, meta.traceId, span.name);
        }
      }),
    TIMEOUT,
  );

  it.effect(
    'exports only the exception type of a failing API request',
    () =>
      Effect.gen(function* () {
        const capture = makeCapture();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const server = yield* startServer({ around: telemetryUnderTest(capture) });
            yield* fetchFrom(server.base, '/v1/meta');
            yield* fetchFrom(server.base, '/v1/auth/register/options', {
              method: 'POST',
              headers: { origin: 'http://localhost:4200', 'content-type': 'application/json' },
              body: `{"secret":"${SECRET}"`,
            });
            yield* settle;
          }),
        );

        const spans = spansOf(capture);
        assert.isTrue(
          spans.some((span) => span.status.code === 2),
          'no /v1 request produced a failed span',
        );
        const events = spans.flatMap((span) => span.events.filter((e) => e.name === 'exception'));
        assert.isAbove(events.length, 0);
        for (const event of events) {
          assert.deepStrictEqual(
            event.attributes.map((attribute) => attribute.key),
            ['exception.type'],
          );
          assert.match(
            attributeOf(event.attributes, 'exception.type') ?? '',
            /^[A-Za-z0-9_.-]{1,64}$/,
          );
        }
        for (const span of spans) {
          assert.isUndefined(span.status.message, span.name);
        }

        const text = textOf(capture);
        assert.notInclude(text, 'exception.message');
        assert.notInclude(text, 'exception.stacktrace');
        assert.notInclude(text, SECRET);
        assert.isDefined(serverSpanFor(capture, '/v1/meta'));
      }),
    TIMEOUT,
  );

  it.effect(
    'sends every request to the traces or logs endpoint only',
    () =>
      Effect.gen(function* () {
        const capture = makeCapture();
        yield* Effect.scoped(
          Effect.gen(function* () {
            const server = yield* startServer({ around: telemetryUnderTest(capture) });
            yield* fetchFrom(server.base, '/v1/meta');
            yield* settle;
          }),
        );

        assert.isAbove(spansOf(capture).length, 0);
        assert.isAbove(capture.requests.length, 0);
        for (const request of capture.requests) {
          assert.include([TRACES_URL, LOGS_URL], request.url);
        }
      }),
    TIMEOUT,
  );
});

layer(Layer.mergeAll(appDatabase(), JobRegistry.layer), { excludeTestServices: true })(
  'telemetry of logs and jobs',
  (it) => {
    it.effect(
      'exports a log record with the redacted message only',
      () =>
        Effect.gen(function* () {
          const capture = makeCapture();
          yield* Effect.logWarning(
            'Probe',
            Cause.die(new Error(`insert into x values (${SECRET})`)),
          ).pipe(
            Effect.annotateLogs('annotated', 'secret-annotation-9'),
            Effect.provide(telemetryUnderTest(capture)),
          );

          const records = logRecordsOf(capture).filter(
            (record) => record.body?.stringValue === 'Probe Die: Error',
          );
          assert.strictEqual(records.length, 1);
          for (const attribute of records[0].attributes) {
            assert.notStrictEqual(attribute.key, 'log.error');
            assert.notStrictEqual(attribute.key, 'fiberId');
            assert.isFalse(attribute.key.startsWith('logSpan.'), attribute.key);
          }

          const text = textOf(capture);
          assert.notInclude(text, SECRET);
          assert.notInclude(text, 'secret-annotation-9');
          assert.notInclude(text, 'insert into');
        }),
      TIMEOUT,
    );

    it.effect(
      'exports a job.run span with its SQL spans below it and no claim poll span',
      () =>
        Effect.gen(function* () {
          const capture = makeCapture();
          const owner = yield* scopedOwner();
          const registry = yield* JobRegistry;
          const kind = `test-${randomUUID()}`;
          yield* registry.register(kind, () => Effect.void);
          const id = randomUUID();
          const db = yield* Db;
          yield* withOwner(
            owner,
            db.insert(jobs).values({ ownerId: owner, id, kind, payload: {}, runAt: bandAt(0) }),
          );

          const runs = yield* runDueJobs({ max: 100 }).pipe(
            Effect.provide(telemetryUnderTest(capture)),
          );
          assert.strictEqual(runs.find((run) => run.id === id)?.outcome, JobOutcome.Succeeded);

          const spans = spansOf(capture);
          const jobSpan = spans.find(
            (span) => span.name === 'job.run' && attributeOf(span.attributes, 'job.kind') === kind,
          );
          assert.isDefined(jobSpan);
          if (jobSpan === undefined) return;
          assert.strictEqual(attributeOf(jobSpan.attributes, 'job.outcome'), 'succeeded');
          for (const span of spans.filter((candidate) => candidate.name === 'job.run')) {
            for (const attribute of span.attributes) {
              assert.notInclude(JSON.stringify(attribute.value), owner);
              assert.notInclude(JSON.stringify(attribute.value), id);
            }
          }
          const text = textOf(capture);
          assert.notInclude(text, owner);
          assert.notInclude(text, id);

          const children = spans.filter((span) => span.parentSpanId === jobSpan.spanId);
          assert.isAbove(children.length, 0);
          assert.isTrue(
            children.some((span) => attributeOf(span.attributes, 'db.system.name') !== undefined),
            'no SQL span below job.run',
          );

          for (const span of spans) {
            assert.notInclude(attributeOf(span.attributes, 'db.query.text') ?? '', 'claim_jobs');
          }
        }),
      TIMEOUT,
    );

    it.effect(
      'keeps the id of an aborted job out of the exported log and the span, but on the stderr line',
      () =>
        Effect.gen(function* () {
          const capture = makeCapture();
          const lines: Array<string> = [];
          const stderr = Logger.layer([makeRedactingLogger((line) => lines.push(line))]);
          const owner = randomUUID();
          yield* Effect.gen(function* () {
            const registry = yield* JobRegistry;
            const kind = `test-${randomUUID()}`;
            yield* registry.register(kind, () => Effect.void);
            const id = randomUUID();
            const db = yield* Db;
            // An owner without a counter row makes the run abort.
            yield* withOwner(
              owner,
              db.insert(jobs).values({ ownerId: owner, id, kind, payload: {}, runAt: bandAt(0) }),
            );

            const runs = yield* runDueJobs({ max: 100 }).pipe(
              Effect.provide(telemetryUnderTest(capture).pipe(Layer.provide(stderr))),
            );
            assert.strictEqual(runs.find((run) => run.id === id)?.outcome, JobOutcome.Aborted);

            const aborted = spansOf(capture).filter(
              (span) =>
                span.name === 'job.run' &&
                attributeOf(span.attributes, 'job.outcome') === 'aborted',
            );
            assert.isAbove(aborted.length, 0);

            const records = logRecordsOf(capture).filter((record) =>
              (record.body?.stringValue ?? '').startsWith('Job aborted:'),
            );
            assert.strictEqual(records.length, 1);
            for (const attribute of records[0].attributes) {
              assert.notStrictEqual(attribute.key, 'job.id');
            }
            assert.notInclude(textOf(capture), id);
            assert.notInclude(textOf(capture), owner);

            const line = lines.find((candidate) => candidate.includes('Job aborted:'));
            assert.isDefined(line);
            assert.include(line ?? '', `job.id=${id}`);
          }).pipe(Effect.ensuring(removeOwner(owner).pipe(Effect.orDie)));
        }),
      TIMEOUT,
    );
  },
);

describe('the scrubbing protobuf serialization', () => {
  it.effect('encodes a trace holding secrets without them', () =>
    Effect.gen(function* () {
      const serialization = yield* OtlpSerialization.OtlpSerialization.pipe(
        Effect.provide(scrubbingSerialization(OtlpSerialization.layerProtobuf)),
      );
      const data = {
        resourceSpans: [
          {
            resource: { attributes: [], droppedAttributesCount: 0 },
            scopeSpans: [
              {
                scope: { name: 'asys' },
                spans: [
                  {
                    traceId: '0af7651916cd43dd8448eb211c80319c',
                    spanId: 'b7ad6b7169203331',
                    parentSpanId: undefined,
                    name: 'http.server GET',
                    kind: 2,
                    startTimeUnixNano: '1',
                    endTimeUnixNano: '2',
                    attributes: [
                      { key: 'http.route', value: { stringValue: '/v1/meta' } },
                      { key: 'url.query', value: { stringValue: `x=${SECRET}` } },
                    ],
                    droppedAttributesCount: 0,
                    events: [
                      {
                        name: 'exception',
                        timeUnixNano: '1',
                        attributes: [
                          { key: 'exception.type', value: { stringValue: 'Error' } },
                          { key: 'exception.message', value: { stringValue: SECRET } },
                        ],
                        droppedAttributesCount: 0,
                      },
                    ],
                    droppedEventsCount: 0,
                    status: { code: 2, message: SECRET },
                    links: [],
                    droppedLinksCount: 0,
                  },
                ],
              },
            ],
          },
        ],
      } as unknown as OtlpTracer.TraceData;

      const body = serialization.traces(data);
      assert.strictEqual(body._tag, 'Uint8Array');
      if (body._tag !== 'Uint8Array') return;
      const text = Buffer.from(body.body).toString('latin1');
      assert.notInclude(text, SECRET);
      assert.include(text, 'http.route');
    }),
  );
});

const readTelemetry = (env: Record<string, string>) =>
  Effect.exit(telemetryConfig.parse(ConfigProvider.fromEnvRecord(env)));

describe('telemetryConfig', () => {
  for (const [name, env] of [
    ['absent', {}],
    ['empty', { OTEL_EXPORTER_OTLP_ENDPOINT: '' }],
    ['whitespace', { OTEL_EXPORTER_OTLP_ENDPOINT: '   ' }],
  ] as const) {
    it.effect(`is none when the endpoint is ${name}`, () =>
      Effect.gen(function* () {
        const exit = yield* readTelemetry(env);

        assert.deepStrictEqual(exit, Exit.succeed(Option.none()));
      }),
    );
  }

  it.effect('removes a trailing slash and defaults the service name to asys', () =>
    Effect.gen(function* () {
      const exit = yield* readTelemetry({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://signoz-ingester:4318/',
      });

      assert.deepStrictEqual(
        exit,
        Exit.succeed(Option.some({ endpoint: 'http://signoz-ingester:4318', serviceName: 'asys' })),
      );
    }),
  );

  it.effect('reads the service name', () =>
    Effect.gen(function* () {
      const exit = yield* readTelemetry({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x:4318',
        OTEL_SERVICE_NAME: 'asys-test',
      });

      assert.deepStrictEqual(
        exit,
        Exit.succeed(Option.some({ endpoint: 'http://x:4318', serviceName: 'asys-test' })),
      );
    }),
  );

  for (const value of ['not a url', 'ftp://x']) {
    it.effect(`fails with a ConfigError naming the variable for ${value}`, () =>
      Effect.gen(function* () {
        const exit = yield* readTelemetry({ OTEL_EXPORTER_OTLP_ENDPOINT: value });

        assert.isTrue(Exit.isFailure(exit));
        if (Exit.isFailure(exit)) {
          const described = describeError(exit.cause);
          assert.include(described, 'ConfigError');
          assert.include(described, 'OTEL_EXPORTER_OTLP_ENDPOINT');
          assert.notInclude(described, value);
        }
      }),
    );
  }
});

describe('telemetryLayer', () => {
  const COLLECTOR_ORIGIN_LINE =
    /^\S+ Info Exporting traces and logs to http:\/\/collector\.test:4318$/;

  /** Builds the layer under the given environment and closes it, with the HTTP client stubbed. */
  const buildLayer = (env: Record<string, string>) =>
    Effect.gen(function* () {
      const lines: Array<string> = [];
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() => Promise.resolve(new Response(null, { status: 200 })));
      yield* Effect.scoped(Layer.build(telemetryLayer)).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(env))),
        Effect.provide(Logger.layer([makeRedactingLogger((line) => lines.push(line))])),
        Effect.ensuring(Effect.sync(() => fetchSpy.mockRestore())),
      );

      return { lines, exports: fetchSpy.mock.calls.length };
    });

  it.live('writes no Exporting line and exports nothing without an endpoint', () =>
    Effect.gen(function* () {
      const { lines, exports } = yield* buildLayer({});

      assert.deepStrictEqual(
        lines.filter((line) => line.includes('Exporting')),
        [],
      );
      assert.strictEqual(exports, 0);
    }),
  );

  it.live('logs only the collector origin, once, when an endpoint is configured', () =>
    Effect.gen(function* () {
      const { lines } = yield* buildLayer({
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://user:${SECRET}@collector.test:4318/otlp/`,
      });

      const exporting = lines.filter((line) => line.includes('Exporting'));
      assert.strictEqual(exporting.length, 1);
      assert.match(exporting[0], COLLECTOR_ORIGIN_LINE);
      for (const line of lines) {
        assert.notInclude(line, SECRET);
        assert.notInclude(line, '/otlp');
      }
    }),
  );
});
