// SPDX-License-Identifier: EUPL-1.2
import { Cause, Logger, References } from 'effect';
import { describeError, describeValue } from './describe-error';

const part = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Cause.isCause(value)) return describeError(value);
  return describeValue(value);
};

const isPrintable = (value: unknown): value is string | number | boolean | null =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

/**
 * A logger that never prints an error's message or stack: drizzle error messages carry query
 * parameters. A line holds the ISO date, the level, the message parts (a Cause or any other
 * value described by identifiers only) and the string, number, boolean and null annotations.
 */
export const makeRedactingLogger = (write: (line: string) => void): Logger.Logger<unknown, void> =>
  Logger.make((options) => {
    const parts: Array<string> = [options.date.toISOString(), options.logLevel];
    const messages: ReadonlyArray<unknown> = Array.isArray(options.message)
      ? options.message
      : [options.message];
    for (const message of messages) parts.push(part(message));
    for (const [key, value] of Object.entries(
      options.fiber.getRef(References.CurrentLogAnnotations),
    )) {
      if (isPrintable(value)) parts.push(`${key}=${String(value)}`);
    }
    if (options.cause.reasons.length > 0) parts.push(describeError(options.cause));
    write(parts.join(' '));
  });

/** The redacting logger, writing to standard error. */
export const redactingLogger = makeRedactingLogger((line) => {
  process.stderr.write(`${line}\n`);
});
