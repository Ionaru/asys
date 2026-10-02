// SPDX-License-Identifier: EUPL-1.2
import { Cause } from 'effect';
import { isSqlError, type SqlError } from 'effect/sql/SqlError';

/** Drizzle wraps the driver's SqlError, possibly inside a Cause, in its query error. */
export const findSqlError = (error: unknown): SqlError | undefined => {
  if (isSqlError(error)) return error;
  if (Cause.isCause(error)) return findSqlError(Cause.squash(error));
  if (typeof error === 'object' && error !== null && 'cause' in error) {
    return findSqlError(error.cause);
  }
  return undefined;
};

/** The violated constraint's name when `error` holds a unique violation (SQLSTATE 23505). */
export const uniqueViolationConstraint = (error: unknown): string | undefined => {
  const reason = findSqlError(error)?.reason;
  return reason?._tag === 'UniqueViolation' ? reason.constraint : undefined;
};
