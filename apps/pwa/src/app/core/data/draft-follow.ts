// SPDX-License-Identifier: EUPL-1.2

/** The fields of a draft that follow the store, and how two drafts compare on each. */
export interface DraftFields<D> {
  readonly keys: readonly (keyof D)[];
  readonly same: (key: keyof D, a: D, b: D) => boolean;
}

/** A copy of `own` taking the stored value for each key `useStored` names. */
const mix = <D extends object>(
  fields: DraftFields<D>,
  useStored: (key: keyof D) => boolean,
  own: D,
  stored: D,
): D => {
  const result = { ...own };

  for (const key of fields.keys) {
    if (useStored(key)) {
      result[key] = stored[key];
    }
  }

  return result;
};

/**
 * The baseline and draft after the store changed: a field the person has not changed, or has changed to
 * what the store now holds, takes the stored value; a field they edited keeps their edit.
 */
export const followStore = <D extends object>(
  fields: DraftFields<D>,
  baseline: D,
  draft: D,
  stored: D,
): { readonly baseline: D; readonly draft: D } => {
  const useStored = (key: keyof D): boolean =>
    fields.same(key, draft, baseline) || fields.same(key, draft, stored);

  return {
    baseline: mix(fields, useStored, baseline, stored),
    draft: mix(fields, useStored, draft, stored),
  };
};

/** The draft after a Save applied: a field still as sent takes the stored value, an edited one stays. */
export const settleSaved = <D extends object>(
  fields: DraftFields<D>,
  sent: D,
  draft: D,
  stored: D,
): D => mix(fields, (key) => fields.same(key, draft, sent), draft, stored);
