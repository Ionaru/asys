// SPDX-License-Identifier: EUPL-1.2
import { Effect, Layer } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';
import { OtlpSerialization } from 'effect/observability';
import { scrubbingSerialization } from '../telemetry/scrub';
import { telemetryLayerWith } from '../telemetry/layer';

export const COLLECTOR = 'http://collector.test:4318';

export const TRACES_URL = `${COLLECTOR}/v1/traces`;

export const LOGS_URL = `${COLLECTOR}/v1/logs`;

/** One request the capturing client received. */
export interface CapturedRequest {
  readonly url: string;
  readonly body: Uint8Array;
}

export interface OtlpValue {
  readonly stringValue?: string;
  readonly intValue?: string | number;
  readonly boolValue?: boolean;
  readonly doubleValue?: number;
}

export interface OtlpAttribute {
  readonly key: string;
  readonly value: OtlpValue;
}

export interface OtlpEvent {
  readonly name: string;
  readonly attributes: ReadonlyArray<OtlpAttribute>;
}

export interface OtlpSpan {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly name: string;
  readonly attributes: ReadonlyArray<OtlpAttribute>;
  readonly events: ReadonlyArray<OtlpEvent>;
  readonly status: { readonly code: number; readonly message?: string };
}

export interface OtlpLogRecord {
  readonly body?: OtlpValue;
  readonly attributes: ReadonlyArray<OtlpAttribute>;
}

export interface Capture {
  readonly requests: Array<CapturedRequest>;
  /** An `HttpClient` that records every request and answers 200 with an empty body. */
  readonly client: Layer.Layer<HttpClient.HttpClient>;
}

export const makeCapture = (): Capture => {
  const requests: Array<CapturedRequest> = [];
  const client = HttpClient.make((request) => {
    const body = request.body._tag === 'Uint8Array' ? request.body.body : new Uint8Array();
    requests.push({ url: request.url, body });

    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })));
  });

  return { requests, client: Layer.succeed(HttpClient.HttpClient)(client) };
};

/**
 * The telemetry layer as the tests use it: the capturing client, readable JSON and a short
 * export interval. Closing the scope it is built in flushes.
 */
export const telemetryUnderTest = (capture: Capture) =>
  telemetryLayerWith({
    endpoint: COLLECTOR,
    serviceName: 'asys-test',
    exportInterval: '50 millis',
  }).pipe(
    Layer.provide(
      Layer.mergeAll(capture.client, scrubbingSerialization(OtlpSerialization.layerJson)),
    ),
  );

const decoder = new TextDecoder();

const jsonOf = (request: CapturedRequest): unknown => JSON.parse(decoder.decode(request.body));

/** The text of every captured request body, for substring checks. */
export const textOf = (capture: Capture): string =>
  capture.requests.map((request) => decoder.decode(request.body)).join('\n');

interface TraceBody {
  readonly resourceSpans?: ReadonlyArray<{
    readonly scopeSpans: ReadonlyArray<{ readonly spans: ReadonlyArray<OtlpSpan> }>;
  }>;
}

interface LogBody {
  readonly resourceLogs?: ReadonlyArray<{
    readonly scopeLogs: ReadonlyArray<{ readonly logRecords?: ReadonlyArray<OtlpLogRecord> }>;
  }>;
}

/** Every span of every captured trace request. */
export const spansOf = (capture: Capture): ReadonlyArray<OtlpSpan> =>
  capture.requests
    .filter((request) => request.url === TRACES_URL)
    .flatMap((request) =>
      ((jsonOf(request) as TraceBody).resourceSpans ?? []).flatMap((resource) =>
        resource.scopeSpans.flatMap((scope) => scope.spans),
      ),
    );

/** Every log record of every captured log request. */
export const logRecordsOf = (capture: Capture): ReadonlyArray<OtlpLogRecord> =>
  capture.requests
    .filter((request) => request.url === LOGS_URL)
    .flatMap((request) =>
      ((jsonOf(request) as LogBody).resourceLogs ?? []).flatMap((resource) =>
        resource.scopeLogs.flatMap((scope) => scope.logRecords ?? []),
      ),
    );

/** The string value of a span attribute, or the int value as a string. */
export const attributeOf = (
  attributes: ReadonlyArray<OtlpAttribute>,
  key: string,
): string | undefined => {
  const value = attributes.find((attribute) => attribute.key === key)?.value;
  if (value === undefined) return undefined;

  return value.stringValue ?? (value.intValue === undefined ? undefined : String(value.intValue));
};
