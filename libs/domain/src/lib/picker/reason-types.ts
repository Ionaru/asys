// SPDX-License-Identifier: MPL-2.0

import type { BlockedBy, Quadrant } from '../task';
import type { Instant } from '../time';

export enum ExclusionReasonTag {
  NotYetAvailable = 'NotYetAvailable',
}

export interface NotYetAvailable {
  readonly _tag: ExclusionReasonTag.NotYetAvailable;
  readonly from: Instant;
}

/** Why an Open, triaged Task is not ranked. An open union: Slice 2 adds Voice and Gap reasons, so consumers must handle tags they do not know. */
export type ExclusionReason = NotYetAvailable | BlockedBy;

export interface Reason {
  readonly overdue: boolean;
  readonly quadrant: Quadrant;
  readonly urgent: boolean;
  readonly latestStart: Instant | null;
}
