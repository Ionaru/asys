// SPDX-License-Identifier: EUPL-1.2

// Code-unit order on purpose: localeCompare would differ per runtime locale.
const compareCodeUnits = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Orders Areas by name, then by id, for every list and choice of Areas. */
export const byAreaName = (
  a: { readonly name: string; readonly id: string },
  b: { readonly name: string; readonly id: string },
): number => compareCodeUnits(a.name, b.name) || compareCodeUnits(a.id, b.id);
