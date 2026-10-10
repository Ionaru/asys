// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { compareCodeUnits } from './compare';

describe('compareCodeUnits', () => {
  it('is 0 for equal strings, including the empty string', () => {
    expect(compareCodeUnits('', '')).toBe(0);
    expect(compareCodeUnits('Task', 'Task')).toBe(0);
  });

  it('puts the smaller string first and the larger one last', () => {
    expect(compareCodeUnits('a', 'b')).toBe(-1);
    expect(compareCodeUnits('b', 'a')).toBe(1);
  });

  it('puts a prefix before the longer string', () => {
    expect(compareCodeUnits('ab', 'abc')).toBe(-1);
    expect(compareCodeUnits('abc', 'ab')).toBe(1);
  });

  it('puts upper case before lower case, unlike localeCompare', () => {
    expect(compareCodeUnits('Z', 'a')).toBe(-1);
    expect(compareCodeUnits('a', 'Z')).toBe(1);
  });

  it('orders by code unit, not by code point', () => {
    const astral = '\u{1F600}';
    const bmp = '\uFF61';

    expect(astral.codePointAt(0)).toBeGreaterThan(bmp.codePointAt(0) as number);
    expect(compareCodeUnits(astral, bmp)).toBe(-1);
    expect(compareCodeUnits(bmp, astral)).toBe(1);
  });

  it('sorts a mixed list by code unit', () => {
    const list = ['b', 'a', 'B', '\uFF61', '\u{1F600}', 'A', ''];
    const sorted = ['', 'A', 'B', 'a', 'b', '\u{1F600}', '\uFF61'];

    expect([...list].sort(compareCodeUnits)).toEqual(sorted);
  });
});
