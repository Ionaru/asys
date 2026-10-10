// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { isValidTimeZone } from './zoned';

// A valid zone name in a different letter case for each number: the bits of `n` pick the case of the letters.
const caseVariant = (name: string, n: number): string => {
  let letter = 0;
  return [...name]
    .map((char) => {
      if (char.toLowerCase() === char.toUpperCase()) return char;
      const upper = (n >> (letter % 20)) % 2 === 1;
      letter += 1;
      return upper ? char.toUpperCase() : char.toLowerCase();
    })
    .join('');
};

describe('isValidTimeZone after a zone has been seen', () => {
  it.each(['Europe/Amsterdam', 'UTC', 'America/St_Johns'])('keeps accepting %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
    expect(isValidTimeZone(zone)).toBe(true);
    expect(isValidTimeZone(zone)).toBe(true);
  });

  it('still rejects an invalid zone after a valid one has been checked', () => {
    expect(isValidTimeZone('Europe/Amsterdam')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('Europe/Amsterdam')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('rejects an invalid zone every time it is asked', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(isValidTimeZone('Mars/Olympus')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
      expect(isValidTimeZone('+01:00')).toBe(false);
    }
  });

  it('rejects near misses of a zone that has been seen', () => {
    expect(isValidTimeZone('Europe/Amsterdam')).toBe(true);
    expect(isValidTimeZone('Europe/Amsterdam ')).toBe(false);
    expect(isValidTimeZone('Europe/Amsterdam/')).toBe(false);
    expect(isValidTimeZone('Europe')).toBe(false);
    expect(isValidTimeZone('-Europe/Amsterdam')).toBe(false);
  });

  it('accepts the letter-case variants of a zone name, which are all valid', () => {
    expect(isValidTimeZone('europe/amsterdam')).toBe(true);
    expect(isValidTimeZone('EUROPE/AMSTERDAM')).toBe(true);
  });

  it('answers the same for hundreds of distinct valid spellings, then for an invalid one', () => {
    const answers = Array.from({ length: 600 }, (_, n) =>
      isValidTimeZone(caseVariant('Europe/Amsterdam', n)),
    );
    expect(answers.every((answer) => answer)).toBe(true);
    expect(isValidTimeZone('Europe/Amsterdam')).toBe(true);
    expect(isValidTimeZone(caseVariant('Mars/Olympus', 5))).toBe(false);
    expect(isValidTimeZone(caseVariant('Europe/Amsterdam', 601))).toBe(true);
  });

  it('rejects a value that is not a string', () => {
    expect(isValidTimeZone(undefined as unknown as string)).toBe(false);
    expect(isValidTimeZone(5 as unknown as string)).toBe(false);
    expect(isValidTimeZone(null as unknown as string)).toBe(false);
  });
});
