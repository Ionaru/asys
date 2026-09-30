// SPDX-License-Identifier: MPL-2.0

import { isValidTimeZone, type Instant } from '../time';
import {
  ChangeEntity,
  ChangeOp,
  RejectedReason,
  TransitionResultTag,
  type DomainState,
  type SetTimeZone,
  type SetUrgencyWindow,
  type TransitionResult,
} from './command';

export const setTimeZone = (
  state: DomainState,
  command: SetTimeZone,
  _now: Instant,
): TransitionResult => {
  const { timeZone } = command;
  if (typeof timeZone !== 'string' || !isValidTimeZone(timeZone)) {
    return { _tag: TransitionResultTag.Rejected, reason: RejectedReason.InvalidTimeZone };
  }
  if (state.settings.timeZone === timeZone)
    return { _tag: TransitionResultTag.Applied, changes: [] };
  return {
    _tag: TransitionResultTag.Applied,
    changes: [
      { entity: ChangeEntity.Settings, op: ChangeOp.Put, after: { ...state.settings, timeZone } },
    ],
  };
};

export const setUrgencyWindow = (
  state: DomainState,
  command: SetUrgencyWindow,
  _now: Instant,
): TransitionResult => {
  const { days } = command;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 14) {
    return { _tag: TransitionResultTag.Rejected, reason: RejectedReason.InvalidUrgencyWindow };
  }
  if (state.settings.urgencyWindowDays === days)
    return { _tag: TransitionResultTag.Applied, changes: [] };
  return {
    _tag: TransitionResultTag.Applied,
    changes: [
      {
        entity: ChangeEntity.Settings,
        op: ChangeOp.Put,
        after: { ...state.settings, urgencyWindowDays: days },
      },
    ],
  };
};
