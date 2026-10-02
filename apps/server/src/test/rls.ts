// SPDX-License-Identifier: EUPL-1.2
import { assert } from '@effect/vitest';
import { Cause, Exit } from 'effect';
import { findSqlError } from '../db/sql-error';

/** Fails unless `exit` is a rejection by a row-level security policy (SQLSTATE 42501). */
export const assertRejectedByRls = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isSuccess(exit)) {
    return assert.fail(
      'expected the statement to be rejected by row-level security, but it succeeded',
    );
  }
  const error = Cause.squash(exit.cause);
  const sqlError = findSqlError(error);
  if (!sqlError) {
    return assert.fail(`expected an SqlError, got: ${String(error)}`);
  }
  assert.strictEqual(sqlError.reason._tag, 'AuthorizationError');
  // The SqlError message is generic; the PostgreSQL error is its reason's cause.
  assert.match(String(sqlError.reason.cause), /row-level security/);
};
