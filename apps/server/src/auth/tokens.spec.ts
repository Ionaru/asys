// SPDX-License-Identifier: EUPL-1.2
import { assert, describe, it } from '@effect/vitest';
import { hashToken, newToken } from './tokens';

describe('hashToken', () => {
  it('gives the lowercase hex SHA-256 of the value', () => {
    assert.strictEqual(
      hashToken('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('newToken', () => {
  it('gives 43 base64url characters', () => {
    assert.isTrue(/^[A-Za-z0-9_-]{43}$/.test(newToken()));
  });

  it('gives distinct tokens', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => newToken()));

    assert.strictEqual(tokens.size, 1000);
  });
});
