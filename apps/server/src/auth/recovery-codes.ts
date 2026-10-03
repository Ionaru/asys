// SPDX-License-Identifier: EUPL-1.2
import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const CODE_LENGTH = 16;

/** How many recovery codes an owner is given at a time. */
export const RECOVERY_CODE_COUNT = 10;

const encode = (bytes: Uint8Array): string => {
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let out = '';
  for (let index = CODE_LENGTH - 1; index >= 0; index--) {
    out += ALPHABET[Number((bits >> BigInt(index * 5)) & 31n)];
  }
  return out;
};

/**
 * A new recovery code: 10 random bytes (80 bits) in Crockford base32, 16 characters,
 * grouped as XXXX-XXXX-XXXX-XXXX.
 */
export const newRecoveryCode = (): string =>
  (encode(randomBytes(10)).match(/.{4}/g) ?? []).join('-');

/** `RECOVERY_CODE_COUNT` distinct new codes. */
export const newRecoveryCodes = (): ReadonlyArray<string> => {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(newRecoveryCode());
  return [...codes];
};

/**
 * The canonical 16 characters of a typed code, or undefined: upper-cases, removes hyphens and
 * whitespace, reads O as 0 and I and L as 1, then requires exactly 16 characters of the alphabet.
 */
export const normalizeRecoveryCode = (input: string): string | undefined => {
  const code = input.toUpperCase().replace(/[-\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return code.length === CODE_LENGTH && [...code].every((char) => ALPHABET.includes(char))
    ? code
    : undefined;
};
