// SPDX-License-Identifier: MPL-2.0

import type { Instant } from '../time';

export interface ReviewSubject {
  readonly type: string;
  readonly id: string;
}

export interface ReviewItem {
  readonly id: string;
  readonly kind: string;
  readonly subjects: readonly ReviewSubject[];
  readonly payload: unknown;
  readonly dedupeKey: string | null;
  readonly createdAt: Instant;
  readonly resolvedAt: Instant | null;
}
