// SPDX-License-Identifier: EUPL-1.2
import { createHash, randomBytes } from 'node:crypto';

/** A new opaque token: 32 random bytes as base64url, 43 characters. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** The SHA-256 of the UTF-8 bytes of a token, as 64 lowercase hex characters. */
export const hashToken = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');
