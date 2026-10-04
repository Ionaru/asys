// SPDX-License-Identifier: EUPL-1.2
import { Effect, Layer } from 'effect';
import { OtlpLogger, OtlpResource, OtlpSerialization, OtlpTracer } from 'effect/observability';
import { safeName } from '../logging/describe-error';

type Span = OtlpTracer.TraceData['resourceSpans'][number]['scopeSpans'][number]['spans'][number];

type SpanEvent = Span['events'][number];

type LogRecord = NonNullable<
  OtlpLogger.LogsData['resourceLogs'][number]['scopeLogs'][number]['logRecords']
>[number];

const SPAN_ATTRIBUTES: ReadonlySet<string> = new Set([
  'http.request.method',
  'http.route',
  'http.response.status_code',
  'url.scheme',
  'db.operation.name',
  'db.query.text',
  'db.system.name',
  'db.namespace',
  'server.address',
  'server.port',
  'job.kind',
  'job.outcome',
] as const);

const BARE_EVENTS: ReadonlySet<string> = new Set([
  'db.transaction.commit',
  'db.transaction.savepoint',
  'db.transaction.rollback',
] as const);

const LOG_ATTRIBUTES: ReadonlySet<string> = new Set([
  'http.method',
  'http.status',
  'job.kind',
  'job.outcome',
] as const);

const isPrimitive = (value: OtlpResource.AnyValue): boolean =>
  value.stringValue !== undefined ||
  value.boolValue !== undefined ||
  value.intValue !== undefined ||
  value.doubleValue !== undefined;

const scrubEvent = (event: SpanEvent): SpanEvent | undefined => {
  if (event.name === 'exception') {
    const type = event.attributes.find((attribute) => attribute.key === 'exception.type');
    return {
      ...event,
      attributes: [
        { key: 'exception.type', value: { stringValue: safeName(type?.value.stringValue) } },
      ],
    };
  }
  return BARE_EVENTS.has(event.name) ? { ...event, attributes: [] } : undefined;
};

const scrubSpan = (span: Span): Span => ({
  ...span,
  attributes: span.attributes.filter((attribute) => SPAN_ATTRIBUTES.has(attribute.key)),
  links: [],
  status: { code: span.status.code },
  events: span.events.flatMap((event) => {
    const scrubbed = scrubEvent(event);
    return scrubbed === undefined ? [] : [scrubbed];
  }),
});

const scrubRecord = (record: LogRecord): LogRecord => {
  const { body, ...rest } = record;
  return {
    ...rest,
    ...(body?.stringValue === undefined ? {} : { body }),
    attributes: record.attributes.filter(
      (attribute) => LOG_ATTRIBUTES.has(attribute.key) && isPrimitive(attribute.value),
    ),
  };
};

/**
 * Keeps only allowlisted span attributes, drops links and the status message, reduces
 * exception events to a safe `exception.type` and keeps only the database transaction
 * events. Resource, ids, names and timestamps stay as they are. Never mutates its input.
 */
export const scrubTraces = (data: OtlpTracer.TraceData): OtlpTracer.TraceData => ({
  ...data,
  resourceSpans: data.resourceSpans.map((resourceSpans) => ({
    ...resourceSpans,
    scopeSpans: resourceSpans.scopeSpans.map((scopeSpans) => ({
      ...scopeSpans,
      spans: scopeSpans.spans.map(scrubSpan),
    })),
  })),
});

/**
 * Keeps only string log bodies and allowlisted primitive log attributes. Resource, scope,
 * timestamps, severity and trace ids stay as they are. Never mutates its input.
 */
export const scrubLogs = (data: OtlpLogger.LogsData): OtlpLogger.LogsData => ({
  ...data,
  resourceLogs: data.resourceLogs.map((resourceLogs) => ({
    ...resourceLogs,
    scopeLogs: resourceLogs.scopeLogs.map((scopeLogs) =>
      scopeLogs.logRecords === undefined
        ? scopeLogs
        : { ...scopeLogs, logRecords: scopeLogs.logRecords.map(scrubRecord) },
    ),
  })),
});

/**
 * Wraps an OTLP serialization layer so traces and logs are scrubbed before they are
 * serialized. Metrics pass through unchanged.
 */
export const scrubbingSerialization = (
  inner: Layer.Layer<OtlpSerialization.OtlpSerialization>,
): Layer.Layer<OtlpSerialization.OtlpSerialization> =>
  Layer.effect(OtlpSerialization.OtlpSerialization)(
    Effect.gen(function* () {
      const service = yield* OtlpSerialization.OtlpSerialization;
      return {
        traces: (data) => service.traces(scrubTraces(data)),
        metrics: (data) => service.metrics(data),
        logs: (data) => service.logs(scrubLogs(data)),
      };
    }),
  ).pipe(Layer.provide(inner));
