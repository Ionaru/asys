// SPDX-License-Identifier: EUPL-1.2
import { Cause } from 'effect';
import { findSqlError } from '../db/sql-error';

/** The identifier shape that is safe to export: letters, digits, underscore, dot and dash, at most 64 characters. */
export const SAFE_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

const SQLSTATE = /^[0-9A-Z]{5}$/;

const CONSTRAINT = /^[A-Za-z0-9_]{1,63}$/;

const CONFIG_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;

/** The value when it is a string matching `SAFE_NAME`, otherwise `Unknown`. */
export const safeName = (value: unknown): string =>
  typeof value === 'string' && SAFE_NAME.test(value) ? value : 'Unknown';

const keep = (value: unknown, pattern: RegExp): string | undefined =>
  typeof value === 'string' && pattern.test(value) ? value : undefined;

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;

/** The variable names a ConfigError's schema issue points at, never the values. */
const configNames = (error: unknown): ReadonlyArray<string> => {
  const path = field(field(field(error, 'cause'), 'issue'), 'path');
  return Array.isArray(path)
    ? path.filter((part): part is string => typeof part === 'string' && CONFIG_NAME.test(part))
    : [];
};

/**
 * Describes one failure or defect value by identifiers only: an SQL error by its reason
 * tag, SQLSTATE and constraint, a ConfigError by the variables it names, anything else by
 * its `_tag` or class name, and `Unknown` when nothing safe is left.
 */
export const describeValue = (value: unknown): string => {
  const sqlError = findSqlError(value);
  if (sqlError !== undefined) {
    const reason = sqlError.reason;
    const cause: unknown = (reason as { readonly cause?: unknown }).cause;
    const constraint =
      reason._tag === 'UniqueViolation' ? reason.constraint : field(cause, 'constraint');
    return [
      'SqlError',
      safeName(reason._tag),
      keep(field(cause, 'code'), SQLSTATE),
      keep(constraint, CONSTRAINT),
    ]
      .filter((part) => part !== undefined)
      .join(' ');
  }
  const tag = field(value, '_tag');
  if (tag === 'ConfigError') return ['ConfigError', ...configNames(value)].join(' ');
  if (typeof tag === 'string') return safeName(tag);
  if (value instanceof Error) return safeName(value.name);
  return 'Unknown';
};

/**
 * Describes a failure for logs and `jobs.last_error` without ever reading a message, detail
 * or where field: drizzle's error messages carry query parameters, and handler messages may
 * carry user text. Gives `Interrupted` for an interrupt-only cause, otherwise `Fail: ` (a
 * typed failure) or `Die: ` followed by `describeValue` of the squashed error.
 */
export const describeError = (cause: Cause.Cause<unknown>): string => {
  if (Cause.hasInterruptsOnly(cause)) return 'Interrupted';
  const prefix = Cause.hasFails(cause) ? 'Fail: ' : 'Die: ';
  return prefix + describeValue(Cause.squash(cause));
};
