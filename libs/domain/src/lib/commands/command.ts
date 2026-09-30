// SPDX-License-Identifier: MPL-2.0

import type { Area, ActiveHours } from '../area';
import type { ReviewItem } from '../review';
import type { Settings } from '../settings';
import type { BlockerLink, Privacy, Task, TaskStatus } from '../task';
import type { DateSpec } from '../time';

export enum CommandTag {
  CaptureTask = 'CaptureTask',
  TriageTask = 'TriageTask',
  EditTask = 'EditTask',
  LogProgress = 'LogProgress',
  CompleteTask = 'CompleteTask',
  DropTask = 'DropTask',
  AddBlocker = 'AddBlocker',
  RemoveBlocker = 'RemoveBlocker',
  CreateArea = 'CreateArea',
  UpdateArea = 'UpdateArea',
  SetTimeZone = 'SetTimeZone',
  SetUrgencyWindow = 'SetUrgencyWindow',
  ResolveReviewItem = 'ResolveReviewItem',
}

export enum ChangeEntity {
  Task = 'task',
  Blocker = 'blocker',
  Area = 'area',
  ReviewItem = 'review_item',
  Settings = 'settings',
}

export enum ChangeOp {
  Put = 'put',
  Remove = 'remove',
}

export enum TransitionResultTag {
  Applied = 'Applied',
  NotApplicable = 'NotApplicable',
  Rejected = 'Rejected',
}

export enum NotApplicableReason {
  ExpectationFailed = 'expectation_failed',
  NotOpen = 'not_open',
}

export enum RejectedReason {
  NotFound = 'not_found',
  DuplicateId = 'duplicate_id',
  InvalidTitle = 'invalid_title',
  InvalidNotes = 'invalid_notes',
  InvalidDate = 'invalid_date',
  InvalidEstimate = 'invalid_estimate',
  InvalidRemaining = 'invalid_remaining',
  NoEstimate = 'no_estimate',
  UnknownArea = 'unknown_area',
  SelfLink = 'self_link',
  DuplicateLink = 'duplicate_link',
  Cycle = 'cycle',
  InvalidName = 'invalid_name',
  InvalidActiveHours = 'invalid_active_hours',
  InvalidPrivacy = 'invalid_privacy',
  InvalidTimeZone = 'invalid_time_zone',
  InvalidUrgencyWindow = 'invalid_urgency_window',
}

export const MAX_MINUTES = 100_000;

/**
 * Everything a transition may read. Every field is required: a caller may leave arrays the command
 * does not read empty, but must pass every row it does read, whatever its status. addBlocker, for
 * example, needs both Tasks and all of the owner's links to find a cycle.
 */
export interface DomainState {
  readonly tasks: readonly Task[];
  readonly links: readonly BlockerLink[];
  readonly areas: readonly Area[];
  readonly reviewItems: readonly ReviewItem[];
  readonly settings: Settings;
}

export interface Expectation {
  readonly status?: TaskStatus;
  readonly version?: number;
}

export interface AreaExpectation {
  readonly version?: number;
}

export interface CaptureTask {
  readonly _tag: CommandTag.CaptureTask;
  readonly taskId: string;
  readonly title: string;
  readonly captureText: string;
  readonly areaId?: string | null;
}

export interface TriageTask {
  readonly _tag: CommandTag.TriageTask;
  readonly taskId: string;
  readonly important: boolean;
  readonly estimateMinutes: number;
  readonly areaId?: string | null;
  readonly expect?: Expectation;
}

export interface TaskPatch {
  readonly title?: string;
  readonly notes?: string;
  readonly areaId?: string | null;
  readonly availableFrom?: DateSpec | null;
  readonly due?: DateSpec | null;
  readonly estimateMinutes?: number | null;
  readonly important?: boolean | null;
}

export interface EditTask {
  readonly _tag: CommandTag.EditTask;
  readonly taskId: string;
  readonly patch: TaskPatch;
  readonly expect?: Expectation;
}

export interface LogProgress {
  readonly _tag: CommandTag.LogProgress;
  readonly taskId: string;
  readonly remainingMinutes: number;
  readonly expect?: Expectation;
}

export interface CompleteTask {
  readonly _tag: CommandTag.CompleteTask;
  readonly taskId: string;
  readonly expect?: Expectation;
}

export interface DropTask {
  readonly _tag: CommandTag.DropTask;
  readonly taskId: string;
  readonly expect?: Expectation;
}

export interface AddBlocker {
  readonly _tag: CommandTag.AddBlocker;
  readonly linkId: string;
  readonly taskId: string;
  readonly blockerId: string;
}

export interface RemoveBlocker {
  readonly _tag: CommandTag.RemoveBlocker;
  readonly linkId: string;
}

export interface CreateArea {
  readonly _tag: CommandTag.CreateArea;
  readonly areaId: string;
  readonly name: string;
  readonly activeHours: ActiveHours;
  readonly defaultPrivacy: Privacy | null;
}

export interface AreaPatch {
  readonly name?: string;
  readonly activeHours?: ActiveHours;
  readonly defaultPrivacy?: Privacy | null;
}

export interface UpdateArea {
  readonly _tag: CommandTag.UpdateArea;
  readonly areaId: string;
  readonly patch: AreaPatch;
  readonly expect?: AreaExpectation;
}

export interface SetTimeZone {
  readonly _tag: CommandTag.SetTimeZone;
  readonly timeZone: string;
}

export interface SetUrgencyWindow {
  readonly _tag: CommandTag.SetUrgencyWindow;
  readonly days: number;
}

export interface ResolveReviewItem {
  readonly _tag: CommandTag.ResolveReviewItem;
  readonly reviewItemId: string;
}

export type Command =
  | CaptureTask
  | TriageTask
  | EditTask
  | LogProgress
  | CompleteTask
  | DropTask
  | AddBlocker
  | RemoveBlocker
  | CreateArea
  | UpdateArea
  | SetTimeZone
  | SetUrgencyWindow
  | ResolveReviewItem;

export type Change =
  | {
      readonly entity: ChangeEntity.Task;
      readonly op: ChangeOp.Put;
      readonly id: string;
      readonly after: Task;
    }
  | {
      readonly entity: ChangeEntity.Blocker;
      readonly op: ChangeOp.Put;
      readonly id: string;
      readonly after: BlockerLink;
    }
  | { readonly entity: ChangeEntity.Blocker; readonly op: ChangeOp.Remove; readonly id: string }
  | {
      readonly entity: ChangeEntity.Area;
      readonly op: ChangeOp.Put;
      readonly id: string;
      readonly after: Area;
    }
  | {
      readonly entity: ChangeEntity.ReviewItem;
      readonly op: ChangeOp.Put;
      readonly id: string;
      readonly after: ReviewItem;
    }
  | { readonly entity: ChangeEntity.Settings; readonly op: ChangeOp.Put; readonly after: Settings };

export type TransitionResult =
  | { readonly _tag: TransitionResultTag.Applied; readonly changes: readonly Change[] }
  | { readonly _tag: TransitionResultTag.NotApplicable; readonly reason: NotApplicableReason }
  | { readonly _tag: TransitionResultTag.Rejected; readonly reason: RejectedReason };
