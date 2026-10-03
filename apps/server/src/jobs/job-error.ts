// SPDX-License-Identifier: EUPL-1.2
import { Cause, Data } from 'effect';
import { findSqlError } from '../db/sql-error';

/** The failure of a claimed job whose kind has no registered handler. */
export class UnknownJobKind extends Data.TaggedError('UnknownJobKind')<{
  readonly kind: string;
}> {}

const SAFE_NAME = /^[A-Za-z0-9_.-]{1,64}$/;

const SQLSTATE = /^[0-9A-Z]{5}$/;

const CONSTRAINT = /^[A-Za-z0-9_]{1,63}$/;

const safeName = (value: unknown): string =>
  typeof value === 'string' && SAFE_NAME.test(value) ? value : 'Unknown';

const keep = (value: unknown, pattern: RegExp): string | undefined =>
  typeof value === 'string' && pattern.test(value) ? value : undefined;

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;

const describeValue = (value: unknown): string => {
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
  if (typeof tag === 'string') return safeName(tag);
  if (value instanceof Error) return safeName(value.name);
  return 'Unknown';
};

/**
 * Describes a job's failure for `jobs.last_error` without ever reading a message, detail
 * or where field: drizzle's error messages carry query parameters and handler messages may
 * carry user text. Gives `Interrupted` for an interrupt-only cause, otherwise `Fail: ` (a
 * typed failure) or `Die: ` followed by the error's tag or name, or for an SQL error its
 * reason tag, SQLSTATE and constraint. Anything that is not a plain identifier becomes `Unknown`.
 */
export const describeJobError = (cause: Cause.Cause<unknown>): string => {
  if (Cause.hasInterruptsOnly(cause)) return 'Interrupted';
  const prefix = Cause.hasFails(cause) ? 'Fail: ' : 'Die: ';
  return prefix + describeValue(Cause.squash(cause));
};
