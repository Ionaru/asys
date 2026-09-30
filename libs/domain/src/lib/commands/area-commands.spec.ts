// SPDX-License-Identifier: MPL-2.0

import { describe, expect, it } from 'vitest';
import { aState, anArea } from '../../test/builders';
import { PERSONAL_ACTIVE_HOURS, WORK_ACTIVE_HOURS, type ActiveHours } from '../area';
import { Privacy } from '../task';
import {
  type AreaPatch,
  type Change,
  type TransitionResult,
  ChangeEntity,
  ChangeOp,
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  TransitionResultTag,
} from './command';
import { IsoWeekday } from '../time/local-date';
import { createArea, updateArea } from './area-commands';

const now = Date.parse('2026-10-14T08:00:00.000Z');

const rejected = (reason: RejectedReason) => ({ _tag: TransitionResultTag.Rejected, reason });

const badHours = {
  ...WORK_ACTIVE_HOURS,
  [IsoWeekday.Monday]: [[600, 480]],
} as unknown as ActiveHours;

const officeHours: ActiveHours = {
  [IsoWeekday.Monday]: [[540, 1020]],
  [IsoWeekday.Tuesday]: [[540, 1020]],
  [IsoWeekday.Wednesday]: [[540, 1020]],
  [IsoWeekday.Thursday]: [[540, 1020]],
  [IsoWeekday.Friday]: [[540, 1020]],
  [IsoWeekday.Saturday]: [[540, 1020]],
  [IsoWeekday.Sunday]: [[540, 1020]],
};

const changesOf = (result: TransitionResult): readonly Change[] => {
  if (result._tag !== TransitionResultTag.Applied) {
    throw new Error(`expected Applied, got ${JSON.stringify(result)}`);
  }
  return result.changes;
};

describe('createArea', () => {
  const create = (
    overrides: Partial<{
      areaId: string;
      name: string;
      activeHours: ActiveHours;
      defaultPrivacy: Privacy | null;
    }> = {},
    areas = [] as ReturnType<typeof anArea>[],
  ) =>
    createArea(
      aState({ areas }),
      {
        _tag: CommandTag.CreateArea,
        areaId: 'home',
        name: 'Home',
        activeHours: PERSONAL_ACTIVE_HOURS,
        defaultPrivacy: Privacy.Hidden,
        ...overrides,
      },
      now,
    );

  it('creates an Area at version 1 with the trimmed name', () => {
    expect(create({ name: '  Home ' })).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Area,
          op: ChangeOp.Put,
          id: 'home',
          after: {
            id: 'home',
            name: 'Home',
            activeHours: PERSONAL_ACTIVE_HOURS,
            defaultPrivacy: Privacy.Hidden,
            version: 1,
          },
        },
      ],
    });
  });

  it('stores the active hours without an extra key', () => {
    const extra = { ...PERSONAL_ACTIVE_HOURS, 8: [] } as unknown as ActiveHours;
    const [change] = changesOf(create({ activeHours: extra }));
    const after =
      change?.entity === ChangeEntity.Area && change.op === ChangeOp.Put ? change.after : null;
    expect(after?.activeHours).toStrictEqual(PERSONAL_ACTIVE_HOURS);
    expect(Object.keys(after?.activeHours ?? {})).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('accepts a null default privacy', () => {
    const [change] = changesOf(create({ defaultPrivacy: null }));
    expect(change).toMatchObject({ after: { defaultPrivacy: null } });
  });

  it('rejects an empty name with invalid_name', () => {
    expect(create({ name: '' })).toEqual(rejected(RejectedReason.InvalidName));
  });

  it('rejects a whitespace-only name with invalid_name', () => {
    expect(create({ name: '   ' })).toEqual(rejected(RejectedReason.InvalidName));
  });

  it('rejects a non-string name with invalid_name', () => {
    expect(create({ name: 5 as unknown as string })).toEqual(rejected(RejectedReason.InvalidName));
  });

  it('rejects invalid active hours with invalid_active_hours', () => {
    expect(create({ activeHours: badHours })).toEqual(rejected(RejectedReason.InvalidActiveHours));
  });

  it('rejects an unknown default privacy with invalid_privacy', () => {
    expect(create({ defaultPrivacy: 'secret' as unknown as Privacy })).toEqual(
      rejected(RejectedReason.InvalidPrivacy),
    );
  });

  it('reports invalid_name before invalid_active_hours', () => {
    expect(create({ name: '', activeHours: badHours })).toEqual(
      rejected(RejectedReason.InvalidName),
    );
  });

  it('reports invalid_active_hours before invalid_privacy', () => {
    expect(
      create({ activeHours: badHours, defaultPrivacy: 'secret' as unknown as Privacy }),
    ).toEqual(rejected(RejectedReason.InvalidActiveHours));
  });

  it('rejects an existing area id with duplicate_id', () => {
    expect(create({}, [anArea({ id: 'home' })])).toEqual(rejected(RejectedReason.DuplicateId));
  });

  it('reports invalid_name before duplicate_id', () => {
    expect(create({ name: '' }, [anArea({ id: 'home' })])).toEqual(
      rejected(RejectedReason.InvalidName),
    );
  });
});

describe('updateArea', () => {
  const work = anArea({ id: 'work', name: 'Work', version: 1 });
  const update = (patch: AreaPatch, expectation?: { version?: number }, areas = [work]) =>
    updateArea(
      aState({ areas }),
      {
        _tag: CommandTag.UpdateArea,
        areaId: 'work',
        patch,
        ...(expectation ? { expect: expectation } : {}),
      },
      now,
    );

  it('renames the Area and bumps the version, leaving other fields', () => {
    expect(update({ name: 'Office' })).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Area,
          op: ChangeOp.Put,
          id: 'work',
          after: {
            id: 'work',
            name: 'Office',
            activeHours: WORK_ACTIVE_HOURS,
            defaultPrivacy: null,
            version: 2,
          },
        },
      ],
    });
  });

  it('trims a new name', () => {
    expect(update({ name: '  Office ' })).toMatchObject({
      changes: [{ after: { name: 'Office' } }],
    });
  });

  it('replaces the active hours', () => {
    expect(update({ activeHours: officeHours })).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [
        {
          entity: ChangeEntity.Area,
          op: ChangeOp.Put,
          id: 'work',
          after: { ...work, activeHours: officeHours, version: 2 },
        },
      ],
    });
  });

  it('rejects invalid active hours with invalid_active_hours', () => {
    expect(update({ activeHours: badHours })).toEqual(rejected(RejectedReason.InvalidActiveHours));
  });

  it('sets a default privacy', () => {
    expect(update({ defaultPrivacy: Privacy.Private })).toMatchObject({
      changes: [{ after: { defaultPrivacy: Privacy.Private, version: 2 } }],
    });
  });

  it('clears the default privacy with null', () => {
    const area = anArea({ id: 'work', defaultPrivacy: Privacy.Private });
    expect(update({ defaultPrivacy: null }, undefined, [area])).toMatchObject({
      changes: [{ after: { defaultPrivacy: null, version: 2 } }],
    });
  });

  it('rejects an unknown default privacy with invalid_privacy', () => {
    expect(update({ defaultPrivacy: 'secret' as unknown as Privacy })).toEqual(
      rejected(RejectedReason.InvalidPrivacy),
    );
  });

  it('rejects an empty name with invalid_name', () => {
    expect(update({ name: '' })).toEqual(rejected(RejectedReason.InvalidName));
  });

  it('reports invalid_name before invalid_active_hours', () => {
    expect(update({ name: '', activeHours: badHours })).toEqual(
      rejected(RejectedReason.InvalidName),
    );
  });

  it('reports invalid_active_hours before invalid_privacy', () => {
    expect(
      update({ activeHours: badHours, defaultPrivacy: 'secret' as unknown as Privacy }),
    ).toEqual(rejected(RejectedReason.InvalidActiveHours));
  });

  it('applies nothing for an empty patch', () => {
    expect(update({})).toEqual({ _tag: TransitionResultTag.Applied, changes: [] });
  });

  it('applies nothing when the name is unchanged', () => {
    expect(update({ name: 'Work' })).toEqual({ _tag: TransitionResultTag.Applied, changes: [] });
  });

  it('applies nothing when the active hours are structurally equal', () => {
    const copy = JSON.parse(JSON.stringify(WORK_ACTIVE_HOURS)) as ActiveHours;
    expect(update({ activeHours: copy })).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });

  it('applies nothing when a null default privacy is cleared again', () => {
    expect(update({ defaultPrivacy: null })).toEqual({
      _tag: TransitionResultTag.Applied,
      changes: [],
    });
  });

  it('returns NotApplicable when the expected version differs', () => {
    expect(update({ name: 'Office' }, { version: 2 })).toEqual({
      _tag: TransitionResultTag.NotApplicable,
      reason: NotApplicableReason.ExpectationFailed,
    });
  });

  it('applies when the expected version matches', () => {
    expect(update({ name: 'Office' }, { version: 1 })._tag).toBe(TransitionResultTag.Applied);
  });

  it('rejects a missing Area with not_found', () => {
    expect(update({ name: 'Office' }, undefined, [])).toEqual(rejected(RejectedReason.NotFound));
  });

  it('validates the patch before looking for the Area', () => {
    expect(update({ name: '' }, undefined, [])).toEqual(rejected(RejectedReason.InvalidName));
  });

  it('does not mutate the state', () => {
    const state = aState({ areas: [work] });
    const before = structuredClone(state);
    updateArea(
      state,
      { _tag: CommandTag.UpdateArea, areaId: 'work', patch: { name: 'Office' } },
      now,
    );
    expect(state).toEqual(before);
  });

  describe('an activeHours patch with an extra key', () => {
    const withExtra = (hours: ActiveHours) => ({ ...hours, 8: [] }) as unknown as ActiveHours;

    it('applies nothing when the seven weekdays are unchanged', () => {
      expect(update({ activeHours: withExtra(WORK_ACTIVE_HOURS) })).toEqual({
        _tag: TransitionResultTag.Applied,
        changes: [],
      });
    });

    it('stores the new hours without the extra key', () => {
      const [change] = changesOf(update({ activeHours: withExtra(PERSONAL_ACTIVE_HOURS) }));
      expect(change).toMatchObject({ entity: ChangeEntity.Area, op: ChangeOp.Put, id: 'work' });
      const after =
        change?.entity === ChangeEntity.Area && change.op === ChangeOp.Put ? change.after : null;
      expect(after?.activeHours).toStrictEqual(PERSONAL_ACTIVE_HOURS);
      expect(Object.keys(after?.activeHours ?? {})).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    });
  });
});
