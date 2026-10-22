// SPDX-License-Identifier: EUPL-1.2
import type { SelectOption } from './select-field';

/** The label of the choice that clears a Task's Area. */
export const NO_AREA_LABEL = 'No Area';

/**
 * The choices of an Area select: No Area (the empty value) first, then the
 * given Areas in the order given. Sorting stays with the caller.
 */
export const areaSelectOptions = (
  areas: readonly { readonly id: string; readonly name: string }[],
): readonly SelectOption[] => [
  { value: '', label: NO_AREA_LABEL },
  ...areas.map((area) => ({ value: area.id, label: area.name })),
];
