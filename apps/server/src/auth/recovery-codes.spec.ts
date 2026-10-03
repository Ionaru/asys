// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import {
  newRecoveryCode,
  newRecoveryCodes,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-codes';

describe('newRecoveryCode', () => {
  it('gives four groups of four Crockford base32 characters', () => {
    for (let index = 0; index < 50; index += 1) {
      assert.isTrue(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/.test(newRecoveryCode()));
    }
  });
});

describe('newRecoveryCodes', () => {
  it('gives ten distinct codes', () => {
    const codes = newRecoveryCodes();

    assert.strictEqual(RECOVERY_CODE_COUNT, 10);
    assert.strictEqual(codes.length, 10);
    assert.strictEqual(new Set(codes).size, 10);
  });

  it('gives codes that normalise to their own characters without hyphens', () => {
    for (const code of newRecoveryCodes()) {
      assert.isTrue(normalizeRecoveryCode(code) === code.replaceAll('-', ''));
    }
  });
});

describe('normalizeRecoveryCode', () => {
  it('upper-cases and removes hyphens', () => {
    assert.strictEqual(normalizeRecoveryCode('abcd-efgh-jkmn-pqrs'), 'ABCDEFGHJKMNPQRS');
  });

  it('removes surrounding and inner whitespace', () => {
    assert.strictEqual(normalizeRecoveryCode(' ABCD EFGH JKMN PQRS '), 'ABCDEFGHJKMNPQRS');
  });

  it('reads O as 0 and I and L as 1', () => {
    assert.strictEqual(normalizeRecoveryCode('oooo-iiii-llll-0000'), '0000111111110000');
  });

  it('gives undefined for 15 characters', () => {
    assert.isUndefined(normalizeRecoveryCode('ABCD-EFGH-JKMN-PQR'));
  });

  it('gives undefined for a character outside the alphabet', () => {
    assert.isUndefined(normalizeRecoveryCode('ABCD-EFGH-JKMN-PQRU'));
  });

  it('gives undefined for an empty input', () => {
    assert.isUndefined(normalizeRecoveryCode(''));
  });
});
