// SPDX-License-Identifier: EUPL-1.2
import { Data } from 'effect';

/** The failure of a claimed job whose kind has no registered handler. */
export class UnknownJobKind extends Data.TaggedError('UnknownJobKind')<{
  readonly kind: string;
}> {}
