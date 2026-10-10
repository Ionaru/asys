// SPDX-License-Identifier: EUPL-1.2

import { compareCodeUnits } from '@asys/domain';

/** Orders Areas by name, then by id, for every list and choice of Areas. */
export const byAreaName = (
  a: { readonly name: string; readonly id: string },
  b: { readonly name: string; readonly id: string },
): number => compareCodeUnits(a.name, b.name) || compareCodeUnits(a.id, b.id);
