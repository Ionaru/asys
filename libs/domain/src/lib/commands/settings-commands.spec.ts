// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aState } from '../../test/builders';
import { setTimeZone, setUrgencyWindow } from './settings-commands';
import { ChangeEntity, ChangeOp, CommandTag, RejectedReason, TransitionResultTag } from './command';

const now = Date.parse('2026-10-14T08:00:00.000Z');

const rejected = (reason: RejectedReason) => ({ _tag: TransitionResultTag.Rejected, reason });

const state = aState({ settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 } });

describe('setTimeZone', () => {
  it('replaces the time zone and keeps the urgency window', () => {
    expect(
      setTimeZone(state, { _tag: CommandTag.SetTimeZone, timeZone: 'America/New_York' }, now),
    ).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Settings,
          op: ChangeOp.Put,
          after: { timeZone: 'America/New_York', urgencyWindowDays: 2 },
        },
      ],
    });
  });

  it('applies nothing for the current time zone', () => {
    expect(
      setTimeZone(state, { _tag: CommandTag.SetTimeZone, timeZone: 'Europe/Amsterdam' }, now),
    ).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });

  it('accepts UTC', () => {
    expect(setTimeZone(state, { _tag: CommandTag.SetTimeZone, timeZone: 'UTC' }, now)).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Settings,
          op: ChangeOp.Put,
          after: { timeZone: 'UTC', urgencyWindowDays: 2 },
        },
      ],
    });
  });

  it.each(['Mars/Olympus', '+01:00', ''])('rejects %j with invalid_time_zone', (timeZone) => {
    expect(setTimeZone(state, { _tag: CommandTag.SetTimeZone, timeZone }, now)).toEqual(
      rejected(RejectedReason.InvalidTimeZone),
    );
  });
});

describe('setUrgencyWindow', () => {
  it.each([1, 14])('accepts %i days at the boundary', (days) => {
    expect(setUrgencyWindow(state, { _tag: CommandTag.SetUrgencyWindow, days }, now)).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Settings,
          op: ChangeOp.Put,
          after: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: days },
        },
      ],
    });
  });

  it.each([0, 15, 2.5])('rejects %s days with invalid_urgency_window', (days) => {
    expect(setUrgencyWindow(state, { _tag: CommandTag.SetUrgencyWindow, days }, now)).toEqual(
      rejected(RejectedReason.InvalidUrgencyWindow),
    );
  });

  it('applies nothing for the current value', () => {
    expect(setUrgencyWindow(state, { _tag: CommandTag.SetUrgencyWindow, days: 2 }, now)).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });
});
