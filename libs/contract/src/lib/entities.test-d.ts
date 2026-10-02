// SPDX-License-Identifier: MPL-2.0

import type {
  ActiveHours,
  Area,
  BlockerLink,
  DateSpec,
  ReviewItem,
  Settings,
  Task,
} from '@asys/domain';
import { expectTypeOf, test } from 'vitest';
import {
  ActiveHoursSchema,
  AreaSchema,
  BlockerLinkSchema,
  ReviewItemSchema,
  SettingsSchema,
  TaskSchema,
} from './entities';
import type { DateSpecSchema } from './primitives';

test('schema types equal the domain types', () => {
  expectTypeOf<typeof BlockerLinkSchema.Type>().toEqualTypeOf<BlockerLink>();
  expectTypeOf<typeof ActiveHoursSchema.Type>().toEqualTypeOf<ActiveHours>();
  expectTypeOf<typeof AreaSchema.Type>().toEqualTypeOf<Area>();
  expectTypeOf<typeof ReviewItemSchema.Type>().toEqualTypeOf<ReviewItem>();
  expectTypeOf<typeof SettingsSchema.Type>().toEqualTypeOf<Settings>();
  expectTypeOf<typeof DateSpecSchema.Type>().toEqualTypeOf<DateSpec>();
});

test('the Task schema type equals the domain Task (branded, as bare enum fields defeat plain equality)', () => {
  expectTypeOf<typeof TaskSchema.Type>().branded.toEqualTypeOf<Task>();
});
