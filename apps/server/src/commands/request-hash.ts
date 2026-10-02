// SPDX-License-Identifier: EUPL-1.2
import { CommandSchema, type CommandRequest } from '@asys/contract';
import { Schema } from 'effect';
import { createHash } from 'node:crypto';

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeys(record[key]);
    }
    return sorted;
  }
  return value;
};

/** `JSON.stringify` without whitespace, with every object's keys sorted; array order is kept. */
export const canonicalJson = (value: unknown): string => JSON.stringify(sortKeys(value));

/** The lowercase hex SHA-256 of the request's canonical encoded JSON. */
export const requestHash = (request: CommandRequest): string =>
  createHash('sha256')
    .update(canonicalJson(Schema.encodeSync(CommandSchema)(request)))
    .digest('hex');
