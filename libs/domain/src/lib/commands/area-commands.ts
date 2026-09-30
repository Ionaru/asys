// SPDX-License-Identifier: MPL-2.0

import { isValidActiveHours, type ActiveHours, type Area } from '../area';
import { Privacy } from '../task';
import { IsoWeekday, type Instant } from '../time';
import {
  ChangeEntity,
  ChangeOp,
  NotApplicableReason,
  RejectedReason,
  TransitionResultTag,
  type CreateArea,
  type DomainState,
  type TransitionResult,
  type UpdateArea,
} from './command';

const rejected = (reason: RejectedReason): TransitionResult => ({
  _tag: TransitionResultTag.Rejected,
  reason,
});

const isValidName = (name: unknown): name is string => {
  return typeof name === 'string' && name.trim() !== '';
};

const isValidPrivacy = (value: unknown): value is Privacy | null => {
  return value === null || Object.values(Privacy).includes(value as Privacy);
};

const WEEKDAYS = [
  IsoWeekday.Monday,
  IsoWeekday.Tuesday,
  IsoWeekday.Wednesday,
  IsoWeekday.Thursday,
  IsoWeekday.Friday,
  IsoWeekday.Saturday,
  IsoWeekday.Sunday,
] as const;

// Keeps exactly the seven weekday keys so an extra key never reaches the stored Area.
const normaliseActiveHours = (hours: ActiveHours): ActiveHours => {
  const [d1, d2, d3, d4, d5, d6, d7] = WEEKDAYS.map((day) => hours[day]);
  return {
    [IsoWeekday.Monday]: d1,
    [IsoWeekday.Tuesday]: d2,
    [IsoWeekday.Wednesday]: d3,
    [IsoWeekday.Thursday]: d4,
    [IsoWeekday.Friday]: d5,
    [IsoWeekday.Saturday]: d6,
    [IsoWeekday.Sunday]: d7,
  } as ActiveHours;
};

const sameActiveHours = (a: ActiveHours, b: ActiveHours): boolean => {
  for (const day of WEEKDAYS) {
    const x = a[day];
    const y = b[day];
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) {
      if (x[i]?.[0] !== y[i]?.[0] || x[i]?.[1] !== y[i]?.[1]) return false;
    }
  }
  return true;
};

const present = <T extends object, K extends keyof T>(obj: T, key: K): boolean => {
  return key in obj && obj[key] !== undefined;
};

export const createArea = (
  state: DomainState,
  command: CreateArea,
  _now: Instant,
): TransitionResult => {
  const { areaId, name, activeHours, defaultPrivacy } = command;
  if (!isValidName(name)) return rejected(RejectedReason.InvalidName);
  if (!isValidActiveHours(activeHours)) return rejected(RejectedReason.InvalidActiveHours);
  if (!isValidPrivacy(defaultPrivacy)) return rejected(RejectedReason.InvalidPrivacy);
  if (state.areas.some((a) => a.id === areaId)) return rejected(RejectedReason.DuplicateId);
  return {
    _tag: TransitionResultTag.Applied,
    changes: [
      {
        entity: ChangeEntity.Area,
        op: ChangeOp.Put,
        id: areaId,
        after: {
          id: areaId,
          name: name.trim(),
          activeHours: normaliseActiveHours(activeHours),
          defaultPrivacy,
          version: 1,
        },
      },
    ],
  };
};

export const updateArea = (
  state: DomainState,
  command: UpdateArea,
  _now: Instant,
): TransitionResult => {
  const { areaId, patch, expect } = command;
  if (present(patch, 'name') && !isValidName(patch.name))
    return rejected(RejectedReason.InvalidName);
  if (present(patch, 'activeHours') && !isValidActiveHours(patch.activeHours as ActiveHours)) {
    return rejected(RejectedReason.InvalidActiveHours);
  }
  if (present(patch, 'defaultPrivacy') && !isValidPrivacy(patch.defaultPrivacy)) {
    return rejected(RejectedReason.InvalidPrivacy);
  }
  const current = state.areas.find((a) => a.id === areaId);
  if (current === undefined) return rejected(RejectedReason.NotFound);
  if (expect?.version !== undefined && expect.version !== current.version) {
    return {
      _tag: TransitionResultTag.NotApplicable,
      reason: NotApplicableReason.ExpectationFailed,
    };
  }
  const next: Area = {
    ...current,
    name: present(patch, 'name') ? (patch.name as string).trim() : current.name,
    activeHours: present(patch, 'activeHours')
      ? normaliseActiveHours(patch.activeHours as ActiveHours)
      : current.activeHours,
    defaultPrivacy: present(patch, 'defaultPrivacy')
      ? (patch.defaultPrivacy as Privacy | null)
      : current.defaultPrivacy,
  };
  if (
    next.name === current.name &&
    next.defaultPrivacy === current.defaultPrivacy &&
    sameActiveHours(next.activeHours, current.activeHours)
  ) {
    return { _tag: TransitionResultTag.Applied, changes: [] };
  }
  return {
    _tag: TransitionResultTag.Applied,
    changes: [
      {
        entity: ChangeEntity.Area,
        op: ChangeOp.Put,
        id: current.id,
        after: { ...next, version: current.version + 1 },
      },
    ],
  };
};
