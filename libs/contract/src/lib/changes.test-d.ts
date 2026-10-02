// SPDX-License-Identifier: MPL-2.0

import type { Change } from '@asys/domain';
import { expectTypeOf, test } from 'vitest';
import type { ChangeEntry } from './changes';

test('a change entry is a domain Change plus a seq', () => {
  expectTypeOf<ChangeEntry>().branded.toEqualTypeOf<Change & { readonly seq: number }>();
});
