// SPDX-License-Identifier: MPL-2.0

import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { TextSchema, UuidSchema } from './primitives';

describe('TextSchema', () => {
  const decode = Schema.decodeUnknownSync(TextSchema);

  it('accepts the empty string', () => {
    expect(decode('')).toBe('');
  });

  it('accepts a correctly paired surrogate', () => {
    expect(decode('😀')).toBe('😀');
  });

  it.each([
    ['a NUL character', 'a\u0000b'],
    ['a lone high surrogate', 'a\uD800b'],
    ['a lone low surrogate', '\uDC00'],
    ['a high surrogate at the end', 'a\uD83D'],
  ])('rejects %s', (_name, value) => {
    expect(() => decode(value)).toThrow(Schema.SchemaError);
  });
});

describe('UuidSchema', () => {
  const decode = Schema.decodeUnknownSync(UuidSchema);

  it('accepts a lowercase UUID', () => {
    expect(decode('00000000-0000-4000-8000-000000000001')).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it.each([
    ['not a UUID', 'x'],
    ['uppercase hex', '00000000-0000-4000-8000-00000000000A'],
  ])('rejects %s', (_name, value) => {
    expect(() => decode(value)).toThrow(Schema.SchemaError);
  });
});
