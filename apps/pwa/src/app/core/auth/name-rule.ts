// SPDX-License-Identifier: EUPL-1.2
import type { ValidationError } from '@angular/forms/signals';

const MAX_NAME_LENGTH = 100;

/** A UTF-16 surrogate without its partner, which the server's TextSchema refuses as it refuses NUL. */
const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** What is wrong with a non-empty name the server would refuse; undefined when it is fine. */
export const nameError = (name: string): ValidationError.WithoutFieldTree | undefined => {
  if (name.length > MAX_NAME_LENGTH) {
    return { kind: 'max_length', message: `Use at most ${MAX_NAME_LENGTH} characters` };
  }

  return name.includes('\u0000') || UNPAIRED_SURROGATE.test(name)
    ? { kind: 'unusual_characters', message: 'Remove the unusual characters' }
    : undefined;
};
