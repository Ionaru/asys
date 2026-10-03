// SPDX-License-Identifier: MPL-2.0

import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  HealthSchema,
  NameSchema,
  RecoveryCodeInputSchema,
  SignUpTokenSchema,
  TimeZoneSchema,
} from './auth';

describe('SignUpTokenSchema', () => {
  const decode = Schema.decodeUnknownSync(SignUpTokenSchema);
  const token = 'aB3_-'.repeat(9).slice(0, 43);

  it('accepts 43 base64url characters', () => {
    expect(token).toHaveLength(43);
    expect(decode(token)).toBe(token);
  });

  it.each([
    ['42 characters', token.slice(0, 42)],
    ['44 characters', `${token}a`],
    ['43 characters with a slash', `${token.slice(0, 42)}/`],
  ])('rejects %s', (_name, value) => {
    expect(() => decode(value)).toThrow(Schema.SchemaError);
  });
});

describe('NameSchema', () => {
  const decode = Schema.decodeUnknownSync(NameSchema);

  it('accepts 100 characters', () => {
    const value = 'a'.repeat(100);

    expect(decode(value)).toBe(value);
  });

  it.each([
    ['101 characters', 'a'.repeat(101)],
    ['only whitespace', '   '],
    ['a NUL character', 'a\u0000b'],
    ['a lone surrogate', 'a\uD800b'],
  ])('rejects %s', (_name, value) => {
    expect(() => decode(value)).toThrow(Schema.SchemaError);
  });
});

describe('TimeZoneSchema', () => {
  const decode = Schema.decodeUnknownSync(TimeZoneSchema);

  it('accepts a valid IANA time zone', () => {
    expect(decode('Europe/Amsterdam')).toBe('Europe/Amsterdam');
  });

  it.each([
    ['an unknown zone', 'Mars/Base'],
    ['65 characters', 'a'.repeat(65)],
    ['a NUL character', 'a\u0000b'],
    ['a lone surrogate', 'a\uD800b'],
  ])('rejects %s', (_name, value) => {
    expect(() => decode(value)).toThrow(Schema.SchemaError);
  });
});

describe('RecoveryCodeInputSchema', () => {
  const decode = Schema.decodeUnknownSync(RecoveryCodeInputSchema);

  it('accepts 64 characters', () => {
    const value = 'a'.repeat(64);

    expect(decode(value)).toBe(value);
  });

  it.each([
    ['65 characters', 'a'.repeat(65)],
    ['a NUL character', 'a\u0000b'],
    ['a lone surrogate', 'a\uD800b'],
  ])('rejects %s', (_name, value) => {
    expect(() => decode(value)).toThrow(Schema.SchemaError);
  });
});

describe('HealthSchema', () => {
  const decode = Schema.decodeUnknownSync(HealthSchema);

  it('decodes a healthy report', () => {
    const report = { status: 'ok', oldestDueJobAgeSeconds: 1.5, failingJobs: 0 };

    expect(decode(report)).toEqual(report);
  });

  it('rejects a status other than ok', () => {
    expect(() => decode({ status: 'down', oldestDueJobAgeSeconds: 1.5, failingJobs: 0 })).toThrow(
      Schema.SchemaError,
    );
  });
});
