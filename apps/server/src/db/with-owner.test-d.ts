import { Effect } from 'effect';
import { expectTypeOf, test } from 'vitest';
import { Db } from './database';
import { withOwner } from './with-owner';

// Guards ADR 0009: with skipLibCheck, an effect version whose module paths no
// longer match Drizzle's type imports silently turns these error types into any.
// SqlError is matched by its tag rather than imported, so this file compiles
// unchanged against any effect version.
// Type tests are only type-checked, never run, so these need no implementation.
declare const errorTypeOf: <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => ReturnType<typeof expectTypeOf<E>>;
declare const sqlErrorIn: <A, E, R>(
  effect: Effect.Effect<A, E, R>,
) => ReturnType<typeof expectTypeOf<Extract<E, { readonly _tag: 'SqlError' }>>>;

const transaction = Effect.gen(function* () {
  const db = yield* Db;
  return yield* db.transaction(() => Effect.succeed(1));
});

const ownedTransaction = withOwner('owner', Effect.succeed(1));

test('g: the error type of db.transaction is not any and includes SqlError', () => {
  errorTypeOf(transaction).not.toBeAny();
  sqlErrorIn(transaction).not.toBeNever();
});

test('g: the error type of withOwner is not any and includes SqlError', () => {
  errorTypeOf(ownedTransaction).not.toBeAny();
  sqlErrorIn(ownedTransaction).not.toBeNever();
});
