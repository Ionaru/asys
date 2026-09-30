// SPDX-License-Identifier: MPL-2.0

import type { DateSpec, Instant } from '../time';

export enum TaskKind {
  Task = 'task',
  CheckIn = 'check_in',
  MemberTemplate = 'member_template',
}

export enum TaskStatus {
  Open = 'open',
  Done = 'done',
  Dropped = 'dropped',
  Delegated = 'delegated',
  Skipped = 'skipped',
}

export enum Voice {
  OutLoud = 'out_loud',
  ClosedDoor = 'closed_door',
}

export enum Privacy {
  Visible = 'visible',
  Private = 'private',
  Hidden = 'hidden',
}

export interface Task {
  readonly id: string;
  readonly kind: TaskKind;
  readonly status: TaskStatus;
  readonly title: string;
  readonly notes: string;
  readonly captureText: string;
  readonly areaId: string | null;
  readonly availableFrom: DateSpec | null;
  readonly due: DateSpec | null;
  readonly estimateMinutes: number | null;
  readonly important: boolean | null;
  readonly voice: Voice | null;
  readonly privacy: Privacy | null;
  readonly dueMoveCount: number;
  readonly version: number;
  readonly createdAt: Instant;
  readonly closedAt: Instant | null;
}

/** `taskId` is the blocked Task; `blockerId` the Task it waits for. */
export interface BlockerLink {
  readonly id: string;
  readonly taskId: string;
  readonly blockerId: string;
}
