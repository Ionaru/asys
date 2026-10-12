// SPDX-License-Identifier: EUPL-1.2
import type {
  ChangeEntity,
  ChangeOp,
  Palette,
  Privacy,
  TaskKind,
  TaskStatus,
  Voice,
} from '@asys/domain';
import { expectTypeOf, test } from 'vitest';
import { changeEntity, changeOp, palette, privacy, taskKind, taskStatus, voice } from './schema';

// Type tests are only type-checked, never run.

test('the database enum values are the values of the domain enums', () => {
  expectTypeOf<(typeof taskKind.enumValues)[number]>().toEqualTypeOf<`${TaskKind}`>();
  expectTypeOf<(typeof taskStatus.enumValues)[number]>().toEqualTypeOf<`${TaskStatus}`>();
  expectTypeOf<(typeof voice.enumValues)[number]>().toEqualTypeOf<`${Voice}`>();
  expectTypeOf<(typeof privacy.enumValues)[number]>().toEqualTypeOf<`${Privacy}`>();
  expectTypeOf<(typeof palette.enumValues)[number]>().toEqualTypeOf<`${Palette}`>();
  expectTypeOf<(typeof changeEntity.enumValues)[number]>().toEqualTypeOf<`${ChangeEntity}`>();
  expectTypeOf<(typeof changeOp.enumValues)[number]>().toEqualTypeOf<`${ChangeOp}`>();
});
