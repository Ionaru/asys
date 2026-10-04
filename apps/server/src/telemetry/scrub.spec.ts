// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';
import { OtlpLogger, OtlpResource, OtlpSerialization, OtlpTracer } from 'effect/observability';
import { scrubbingSerialization, scrubLogs, scrubTraces } from './scrub';

type Span = OtlpTracer.TraceData['resourceSpans'][number]['scopeSpans'][number]['spans'][number];

type SpanEvent = Span['events'][number];

type LogRecord = NonNullable<
  NonNullable<
    OtlpLogger.LogsData['resourceLogs'][number]['scopeLogs'][number]['logRecords']
  >[number]
>;

type AnyValue = OtlpResource.AnyValue;

type KeyValue = OtlpResource.KeyValue;

const str = (key: string, value: string): KeyValue => ({ key, value: { stringValue: value } });

const int = (key: string, value: number): KeyValue => ({
  key,
  value: { intValue: value } as AnyValue,
});

const resource = {
  attributes: [
    str('service.name', 'asys-server'),
    str('service.version', '1.2.3'),
    str('deployment.environment', 'production'),
  ],
  droppedAttributesCount: 0,
} as unknown as OtlpTracer.TraceData['resourceSpans'][number]['resource'];

const makeSpan = (overrides: Partial<Span>): Span =>
  ({
    traceId: 'trace-1',
    spanId: 'span-1',
    parentSpanId: undefined,
    name: 'http.server GET',
    kind: 2,
    startTimeUnixNano: '1',
    endTimeUnixNano: '2',
    attributes: [],
    droppedAttributesCount: 0,
    events: [],
    droppedEventsCount: 0,
    status: { code: 1 },
    links: [],
    droppedLinksCount: 0,
    ...overrides,
  }) as Span;

const makeTraces = (...spans: Array<Span>): OtlpTracer.TraceData => ({
  resourceSpans: [{ resource, scopeSpans: [{ scope: { name: 'asys' }, spans }] }],
});

const firstSpan = (data: OtlpTracer.TraceData): Span => {
  const span = data.resourceSpans[0]?.scopeSpans[0]?.spans[0];
  assert.isDefined(span);
  return span as Span;
};

const event = (name: string, attributes: Array<KeyValue>): SpanEvent => ({
  name,
  timeUnixNano: '5',
  attributes,
  droppedAttributesCount: 0,
});

const serverSpan = (): Span =>
  makeSpan({
    attributes: [
      str('http.request.method', 'GET'),
      str('http.route', '/v1/meta'),
      int('http.response.status_code', 200),
      str('url.scheme', 'http'),
      str('url.full', 'http://x/v1/meta?token=secret-123'),
      str('url.query', 'token=secret-123'),
      str('client.address', '10.0.0.1'),
      str('user_agent.original', 'Mozilla'),
      str('http.request.header.cookie', 'asys_session=secret-123'),
      str('http.request.header.x-forwarded-for', '1.2.3.4'),
    ],
  });

const makeLogs = (...records: Array<LogRecord>): OtlpLogger.LogsData => ({
  resourceLogs: [
    {
      resource: resource as unknown as NonNullable<
        OtlpLogger.LogsData['resourceLogs'][number]['resource']
      >,
      scopeLogs: [{ scope: { name: 'asys' }, logRecords: records }],
    },
  ],
});

const makeRecord = (overrides: Partial<LogRecord>): LogRecord =>
  ({
    timeUnixNano: '10',
    observedTimeUnixNano: '11',
    severityNumber: 9,
    severityText: 'INFO',
    attributes: [],
    droppedAttributesCount: 0,
    flags: 1,
    ...overrides,
  }) as LogRecord;

const firstRecord = (data: OtlpLogger.LogsData): LogRecord => {
  const record = data.resourceLogs[0]?.scopeLogs[0]?.logRecords?.[0];
  assert.isDefined(record);
  return record as LogRecord;
};

const responseRecord = (): LogRecord =>
  makeRecord({
    body: { stringValue: 'Sent HTTP response' },
    attributes: [
      str('http.method', 'GET'),
      int('http.status', 200),
      str('http.url', '/v1/auth/passkeys/secret-123'),
      str('log.error', 'Error: secret-123\n    at x (/app/main.js:1)'),
      int('fiberId', 7),
      str('logSpan.http.span', '3ms'),
      str('owner.name', 'Anna'),
      {
        key: 'job.kind',
        value: { kvlistValue: { values: [str('nested', 'Anna')] } } as AnyValue,
      },
    ],
  });

const decodeBody = (body: unknown): string => {
  const typed = body as { _tag: string; body: Uint8Array };
  assert.strictEqual(typed._tag, 'Uint8Array');
  return new TextDecoder().decode(typed.body);
};

describe('scrubTraces', () => {
  it('keeps only the allowlisted attributes of a server span, in order', () => {
    const scrubbed = firstSpan(scrubTraces(makeTraces(serverSpan())));

    assert.deepStrictEqual(scrubbed.attributes, [
      str('http.request.method', 'GET'),
      str('http.route', '/v1/meta'),
      int('http.response.status_code', 200),
      str('url.scheme', 'http'),
    ]);

    const json = JSON.stringify(scrubTraces(makeTraces(serverSpan())));
    for (const secret of ['secret-123', '10.0.0.1', '1.2.3.4', 'Mozilla']) {
      assert.notInclude(json, secret);
    }
  });

  it('keeps all SQL span attributes', () => {
    const attributes = [
      str('db.system.name', 'postgresql'),
      str('db.namespace', 'asys'),
      str('db.operation.name', 'select'),
      str('db.query.text', 'select * from tasks where id = $1'),
      str('server.address', 'localhost'),
      int('server.port', 5432),
    ];

    const scrubbed = firstSpan(scrubTraces(makeTraces(makeSpan({ attributes }))));

    assert.deepStrictEqual(scrubbed.attributes, attributes);
  });

  it('keeps the job attributes', () => {
    const attributes = [str('job.kind', 'prune'), str('job.outcome', 'succeeded')];

    const scrubbed = firstSpan(scrubTraces(makeTraces(makeSpan({ attributes }))));

    assert.deepStrictEqual(scrubbed.attributes, attributes);
  });

  it('drops attributes outside the allowlist, such as response headers and the owner', () => {
    const scrubbed = firstSpan(
      scrubTraces(
        makeTraces(
          makeSpan({
            attributes: [
              str('url.path', '/v1/tasks/secret-123'),
              str('http.response.header.set-cookie', 'asys_session=secret-123'),
              str('owner.id', 'secret-123'),
              str('exception.message', 'secret-123'),
            ],
          }),
        ),
      ),
    );

    assert.deepStrictEqual(scrubbed.attributes, []);
  });

  it('empties the links of a span', () => {
    const span = makeSpan({
      links: [
        {
          traceId: 't',
          spanId: 's',
          attributes: [str('x', 'secret-123')],
          droppedAttributesCount: 0,
        },
      ],
    });

    const scrubbed = firstSpan(scrubTraces(makeTraces(span)));

    assert.deepStrictEqual(scrubbed.links, []);
  });

  it('keeps the status code and drops the status message', () => {
    const span = makeSpan({
      status: { code: 2, message: 'duplicate key value violates ... secret-123' },
    });

    const scrubbed = firstSpan(scrubTraces(makeTraces(span)));

    assert.strictEqual(scrubbed.status.code, 2);
    assert.isTrue(scrubbed.status.message === undefined || scrubbed.status.message === '');
    assert.notInclude(JSON.stringify(scrubbed), 'secret-123');
  });

  it('reduces an exception event to its safe type name', () => {
    const span = makeSpan({
      events: [
        event('exception', [
          str('exception.type', 'HealthUnavailable'),
          str('exception.message', 'secret-123'),
          str('exception.stacktrace', 'at x (/app/main.js:1)'),
        ]),
      ],
    });

    const scrubbed = firstSpan(scrubTraces(makeTraces(span)));

    assert.strictEqual(scrubbed.events.length, 1);
    assert.strictEqual(scrubbed.events[0]?.name, 'exception');
    assert.deepStrictEqual(scrubbed.events[0]?.attributes, [
      { key: 'exception.type', value: { stringValue: 'HealthUnavailable' } },
    ]);
  });

  it('replaces an unsafe exception type by Unknown', () => {
    const span = makeSpan({
      events: [event('exception', [str('exception.type', 'Buy milk for Anna')])],
    });

    const scrubbed = firstSpan(scrubTraces(makeTraces(span)));

    assert.deepStrictEqual(scrubbed.events[0]?.attributes, [
      { key: 'exception.type', value: { stringValue: 'Unknown' } },
    ]);
  });

  it('gives an exception event without a type the type Unknown', () => {
    const span = makeSpan({
      events: [event('exception', [str('exception.message', 'secret-123')])],
    });

    const scrubbed = firstSpan(scrubTraces(makeTraces(span)));

    assert.deepStrictEqual(scrubbed.events[0]?.attributes, [
      { key: 'exception.type', value: { stringValue: 'Unknown' } },
    ]);
    assert.notInclude(JSON.stringify(scrubbed), 'secret-123');
  });

  it('keeps the transaction events without attributes', () => {
    const span = makeSpan({
      events: [
        event('db.transaction.commit', [str('x', 'secret-123')]),
        event('db.transaction.savepoint', [str('x', 'secret-123')]),
        event('db.transaction.rollback', [str('x', 'secret-123')]),
      ],
    });

    const scrubbed = firstSpan(scrubTraces(makeTraces(span)));

    assert.deepStrictEqual(
      scrubbed.events.map((e) => [e.name, e.attributes]),
      [
        ['db.transaction.commit', []],
        ['db.transaction.savepoint', []],
        ['db.transaction.rollback', []],
      ],
    );
  });

  it('drops events with any other name and keeps the order of the rest', () => {
    const span = makeSpan({
      events: [
        event('db.transaction.commit', []),
        event('cache.miss', [str('key', 'secret-123')]),
        event('log', [str('message', 'secret-123')]),
        event('exception', [str('exception.type', 'Error')]),
      ],
    });

    const scrubbed = firstSpan(scrubTraces(makeTraces(span)));

    assert.deepStrictEqual(
      scrubbed.events.map((e) => e.name),
      ['db.transaction.commit', 'exception'],
    );
    assert.deepStrictEqual(scrubbed.events[1]?.attributes, [
      { key: 'exception.type', value: { stringValue: 'Error' } },
    ]);
  });

  it('keeps the span name, ids and kind', () => {
    const scrubbed = firstSpan(scrubTraces(makeTraces(serverSpan())));

    assert.strictEqual(scrubbed.name, 'http.server GET');
    assert.strictEqual(scrubbed.traceId, 'trace-1');
    assert.strictEqual(scrubbed.spanId, 'span-1');
    assert.strictEqual(scrubbed.kind, 2);
  });

  it('leaves the resource attributes untouched', () => {
    const scrubbed = scrubTraces(makeTraces(serverSpan()));

    assert.deepStrictEqual(scrubbed.resourceSpans[0]?.resource, resource);
  });

  it('does not mutate its input', () => {
    const input = makeTraces(
      makeSpan({
        ...serverSpan(),
        status: { code: 2, message: 'secret-123' },
        events: [event('exception', [str('exception.message', 'secret-123')])],
      }),
    );
    const copy = structuredClone(input);

    scrubTraces(input);

    assert.deepStrictEqual(input, copy);
  });
});

describe('scrubLogs', () => {
  it('keeps a string body and only the allowlisted primitive attributes', () => {
    const scrubbed = firstRecord(scrubLogs(makeLogs(responseRecord())));

    assert.deepStrictEqual(scrubbed.body, { stringValue: 'Sent HTTP response' });
    assert.deepStrictEqual(scrubbed.attributes, [
      str('http.method', 'GET'),
      int('http.status', 200),
    ]);

    const json = JSON.stringify(scrubLogs(makeLogs(responseRecord())));
    assert.notInclude(json, 'secret-123');
    assert.notInclude(json, 'Anna');
  });

  it('drops an allowlisted attribute whose value is an array', () => {
    const record = makeRecord({
      attributes: [
        {
          key: 'job.outcome',
          value: { arrayValue: { values: [{ stringValue: 'Anna' }] } } as AnyValue,
        },
        str('job.kind', 'prune'),
      ],
    });

    const scrubbed = firstRecord(scrubLogs(makeLogs(record)));

    assert.deepStrictEqual(scrubbed.attributes, [str('job.kind', 'prune')]);
  });

  it('keeps the boolean and double values of allowlisted attributes', () => {
    const attributes: Array<KeyValue> = [
      { key: 'job.outcome', value: { boolValue: true } as AnyValue },
      { key: 'http.status', value: { doubleValue: 1.5 } as AnyValue },
    ];

    const scrubbed = firstRecord(scrubLogs(makeLogs(makeRecord({ attributes }))));

    assert.deepStrictEqual(scrubbed.attributes, attributes);
  });

  it('removes a body that is a kvlist or an array', () => {
    const kvlist = makeRecord({
      body: { kvlistValue: { values: [str('a', 'Anna')] } } as AnyValue,
    });
    const array = makeRecord({
      body: { arrayValue: { values: [{ stringValue: 'Anna' }] } } as AnyValue,
    });

    for (const record of [kvlist, array]) {
      const scrubbed = firstRecord(scrubLogs(makeLogs(record)));

      assert.isUndefined(scrubbed.body);
      assert.notInclude(JSON.stringify(scrubbed), 'Anna');
    }
  });

  it('keeps the trace id, span id, severity and timestamps', () => {
    const record = makeRecord({
      traceId: 'trace-1',
      spanId: 'span-1',
      body: { stringValue: 'hello' },
    });

    const scrubbed = firstRecord(scrubLogs(makeLogs(record)));

    assert.strictEqual(scrubbed.traceId, 'trace-1');
    assert.strictEqual(scrubbed.spanId, 'span-1');
    assert.strictEqual(scrubbed.severityNumber, 9);
    assert.strictEqual(scrubbed.severityText, 'INFO');
    assert.strictEqual(scrubbed.timeUnixNano, '10');
    assert.strictEqual(scrubbed.observedTimeUnixNano, '11');
  });

  it('leaves absent logRecords absent', () => {
    const data: OtlpLogger.LogsData = {
      resourceLogs: [{ scopeLogs: [{ scope: { name: 'asys' } }] }],
    };

    const scrubbed = scrubLogs(data);

    assert.isUndefined(scrubbed.resourceLogs[0]?.scopeLogs[0]?.logRecords);
  });

  it('leaves the resource attributes untouched', () => {
    const scrubbed = scrubLogs(makeLogs(responseRecord()));

    assert.deepStrictEqual(scrubbed.resourceLogs[0]?.resource, resource);
  });

  it('does not mutate its input', () => {
    const input = makeLogs(responseRecord());
    const copy = structuredClone(input);

    scrubLogs(input);

    assert.deepStrictEqual(input, copy);
  });
});

describe('scrubbingSerialization', () => {
  it.effect('scrubs the traces before serializing them', () =>
    Effect.gen(function* () {
      const service = yield* OtlpSerialization.OtlpSerialization;

      const text = decodeBody(service.traces(makeTraces(serverSpan())));

      assert.notInclude(text, 'secret-123');
      assert.include(text, 'http.route');
      assert.doesNotThrow(() => JSON.parse(text));
    }).pipe(Effect.provide(scrubbingSerialization(OtlpSerialization.layerJson))),
  );

  it.effect('scrubs the logs before serializing them', () =>
    Effect.gen(function* () {
      const service = yield* OtlpSerialization.OtlpSerialization;

      const text = decodeBody(service.logs(makeLogs(responseRecord())));

      assert.notInclude(text, 'secret-123');
      assert.include(text, 'Sent HTTP response');
    }).pipe(Effect.provide(scrubbingSerialization(OtlpSerialization.layerJson))),
  );

  it.effect('passes metrics through to the inner serialization', () =>
    Effect.gen(function* () {
      const scrubbing = yield* Effect.gen(function* () {
        return yield* OtlpSerialization.OtlpSerialization;
      }).pipe(Effect.provide(scrubbingSerialization(OtlpSerialization.layerJson)));
      const plain = yield* Effect.gen(function* () {
        return yield* OtlpSerialization.OtlpSerialization;
      }).pipe(Effect.provide(OtlpSerialization.layerJson));
      const metrics = { resourceMetrics: [] } as unknown as Parameters<typeof plain.metrics>[0];

      assert.strictEqual(
        decodeBody(scrubbing.metrics(metrics)),
        decodeBody(plain.metrics(metrics)),
      );
    }),
  );
});
