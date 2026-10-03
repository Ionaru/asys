// SPDX-License-Identifier: MPL-2.0

import { isLocalDate, isLocalTime } from '@asys/domain';
import { Schema } from 'effect';

/**
 * A lowercase UUID. The lowercase rule is a plain filter, not `Schema.isLowercased()`: a second `pattern`
 * check is emitted as an `allOf` member, which ng-openapi-gen renders as `any` instead of `string`.
 */
export const UuidSchema = Schema.String.check(
  Schema.isUUID(),
  Schema.makeFilter((value: string) => value === value.toLowerCase()),
);

const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Text Postgres can store: no NUL and no unpaired UTF-16 surrogate. */
export const TextSchema = Schema.String.check(
  Schema.makeFilter(
    (value: string) => !value.includes('\u0000') && !UNPAIRED_SURROGATE.test(value),
  ),
);

export const LocalDateSchema = Schema.String.check(Schema.makeFilter(isLocalDate));

export const LocalTimeSchema = Schema.String.check(Schema.makeFilter(isLocalTime));

export const DateSpecSchema = Schema.Struct({
  date: LocalDateSchema,
  time: Schema.optionalKey(LocalTimeSchema),
}).annotate({ identifier: 'DateSpec' });

export const InstantSchema = Schema.Int;
