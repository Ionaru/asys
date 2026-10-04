// SPDX-License-Identifier: EUPL-1.2
import { Cause, Config, Duration, Effect, Layer, Logger, Option, Schema } from 'effect';
import { FetchHttpClient, HttpClient } from 'effect/http';
import { OtlpExporter, OtlpLogger, OtlpSerialization, OtlpTracer } from 'effect/observability';
import { redactedMessage } from '../logging/logger';
import { scrubbingSerialization } from './scrub';

/** Where and as whom the process exports its telemetry. */
export interface TelemetryOptions {
  /** The collector's base URL without a trailing slash, for example `http://signoz-ingester:4318`. */
  readonly endpoint: string;
  /** The `service.name` resource attribute. */
  readonly serviceName: string;
  /** How often batches are exported. Absent means the exporter's default. */
  readonly exportInterval?: Duration.Input;
}

/**
 * Exports traces to `<endpoint>/v1/traces` and logs to `<endpoint>/v1/logs` over one shared
 * exporter registry, so closing the scope flushes both. The log records carry only the redacted
 * message of the stderr logger, never a cause, and are added on top of the loggers already
 * installed. No metrics are built and spans do not become log records.
 */
export const telemetryLayerWith = (
  options: TelemetryOptions,
): Layer.Layer<
  OtlpExporter.Flusher,
  never,
  HttpClient.HttpClient | OtlpSerialization.OtlpSerialization
> => {
  const resource = { serviceName: options.serviceName };
  const tracer = OtlpTracer.layer({
    url: `${options.endpoint}/v1/traces`,
    resource,
    exportInterval: options.exportInterval,
  });
  const logger = Logger.layer(
    [
      OtlpLogger.make({
        url: `${options.endpoint}/v1/logs`,
        resource,
        exportInterval: options.exportInterval,
      }).pipe(
        Effect.map((inner) =>
          Logger.make<unknown, void>((logOptions) =>
            inner.log({
              ...logOptions,
              message: [redactedMessage(logOptions)],
              cause: Cause.empty,
            }),
          ),
        ),
      ),
    ],
    { mergeWithExisting: true },
  );
  return Layer.mergeAll(tracer, logger).pipe(Layer.provideMerge(OtlpExporter.layerFlusher));
};

const isHttpUrl = (value: string): boolean => {
  if (!URL.canParse(value)) return false;
  const { protocol } = new URL(value);
  return protocol === 'http:' || protocol === 'https:';
};

const endpointConfig = Config.schema(
  Schema.String.check(Schema.makeFilter(isHttpUrl)),
  'OTEL_EXPORTER_OTLP_ENDPOINT',
);

/**
 * The telemetry settings: `OTEL_EXPORTER_OTLP_ENDPOINT` (an absolute http or https URL, trailing
 * slashes removed) and `OTEL_SERVICE_NAME` (default `asys`). An absent, empty or blank endpoint
 * means no telemetry. An invalid endpoint fails with an error that names the variable, not the value.
 */
export const telemetryConfig: Config.Config<Option.Option<TelemetryOptions>> = Config.String(
  'OTEL_EXPORTER_OTLP_ENDPOINT',
).pipe(
  Config.withDefault(''),
  Config.flatMap((raw) =>
    raw.trim() === ''
      ? Config.succeed(Option.none<TelemetryOptions>())
      : Config.all({
          endpoint: endpointConfig,
          serviceName: Config.String('OTEL_SERVICE_NAME').pipe(Config.withDefault('asys')),
        }).pipe(
          Config.map(({ endpoint, serviceName }) =>
            Option.some<TelemetryOptions>({
              endpoint: endpoint.trim().replace(/\/+$/, ''),
              serviceName,
            }),
          ),
        ),
  ),
);

/**
 * Exports traces and logs to the collector named by `telemetryConfig` through the allowlist
 * scrubber, and logs the collector's origin once at startup. Without an endpoint it does nothing.
 */
export const telemetryLayer: Layer.Layer<never, Config.ConfigError> = Layer.unwrap(
  Effect.gen(function* () {
    const options = yield* telemetryConfig;
    if (Option.isNone(options)) return Layer.empty;
    yield* Effect.logInfo(`Exporting traces and logs to ${new URL(options.value.endpoint).origin}`);
    return telemetryLayerWith(options.value).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(scrubbingSerialization(OtlpSerialization.layerProtobuf)),
    );
  }),
);
