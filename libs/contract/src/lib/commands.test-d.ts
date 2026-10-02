// SPDX-License-Identifier: MPL-2.0

import type { Command } from '@asys/domain';
import { expectTypeOf, test } from 'vitest';
import type { CommandRequest } from './commands';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

test('a command request is a domain Command plus an idempotency key', () => {
  expectTypeOf<DistributiveOmit<CommandRequest, 'idempotencyKey'>>().toEqualTypeOf<Command>();
});
