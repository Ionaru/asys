// SPDX-License-Identifier: MPL-2.0

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AMS, anArea } from '../../test/builders';
import type { Settings } from '../settings';
import { IsoWeekday } from '../time/local-date';
import { localMinuteInstant, toLocalDateTime } from '../time/zoned';
import type { ActiveHours, MinuteInterval } from './active-hours';
import { seedAreas } from './area';
import { automaticAreaIds, currentArea, makeAreaPick, type AreaPick } from './current-area';

const settings: Settings = { timeZone: AMS, urgencyWindowDays: 2 };

const at = (iso: string) => Date.parse(iso);

const seeds = seedAreas({ workId: 'work', personalId: 'personal' });

const hoursOf = (days: Partial<Record<IsoWeekday, readonly MinuteInterval[]>>): ActiveHours => ({
  [IsoWeekday.Monday]: [],
  [IsoWeekday.Tuesday]: [],
  [IsoWeekday.Wednesday]: [],
  [IsoWeekday.Thursday]: [],
  [IsoWeekday.Friday]: [],
  [IsoWeekday.Saturday]: [],
  [IsoWeekday.Sunday]: [],
  ...days,
});

describe('automaticAreaIds', () => {
  it.each([
    ['Mon 07:59', '2026-10-12T05:59:00.000Z', ['personal']],
    ['Mon 08:00', '2026-10-12T06:00:00.000Z', ['work']],
    ['Mon 17:59', '2026-10-12T15:59:00.000Z', ['work']],
    ['Mon 18:00', '2026-10-12T16:00:00.000Z', ['personal']],
    ['Sat 14:00', '2026-10-10T12:00:00.000Z', ['personal']],
    ['Mon 26 Oct 07:59 CET', '2026-10-26T06:59:00.000Z', ['personal']],
    ['Mon 26 Oct 08:00 CET', '2026-10-26T07:00:00.000Z', ['work']],
  ])('with the seed Areas at %s gives %j', (_label, iso, expected) => {
    expect(automaticAreaIds(seeds, AMS, at(iso))).toEqual(expected);
  });

  it('returns the union of overlapping Areas, sorted by id', () => {
    const extra = anArea({
      id: 'a-extra',
      activeHours: hoursOf({ [IsoWeekday.Monday]: [[600, 700]] }),
    });
    expect(automaticAreaIds([...seeds, extra], AMS, at('2026-10-12T08:30:00.000Z'))).toEqual([
      'a-extra',
      'work',
    ]);
  });

  it('sorts by id, not by input order', () => {
    const all = hoursOf({ [IsoWeekday.Monday]: [[0, 1440]] });
    const areas = [anArea({ id: 'b', activeHours: all }), anArea({ id: 'a', activeHours: all })];
    expect(automaticAreaIds(areas, AMS, at('2026-10-12T08:00:00.000Z'))).toEqual(['a', 'b']);
  });

  it('leaves out an Area with no intervals that day', () => {
    const none = anArea({ id: 'none', activeHours: hoursOf({}) });
    expect(automaticAreaIds([none], AMS, at('2026-10-12T08:00:00.000Z'))).toEqual([]);
  });

  it('returns [] for no Areas, even with an invalid zone', () => {
    expect(automaticAreaIds([], 'Mars/Olympus', at('2026-10-12T08:00:00.000Z'))).toEqual([]);
  });

  it('throws for an invalid zone when there is an Area', () => {
    expect(() => automaticAreaIds(seeds, 'Mars/Olympus', at('2026-10-12T08:00:00.000Z'))).toThrow(
      new RangeError('Invalid time zone: Mars/Olympus'),
    );
  });
});

describe('makeAreaPick', () => {
  it.each([
    [
      'Personal on a day off at 07:30',
      'personal',
      '2026-10-12T05:30:00.000Z',
      '2026-10-12T16:00:00.000Z',
    ],
    [
      'Personal during a call at 10:00',
      'personal',
      '2026-10-12T08:00:00.000Z',
      '2026-10-12T16:00:00.000Z',
    ],
    ['Work at 06:00', 'work', '2026-10-12T04:00:00.000Z', '2026-10-12T06:00:00.000Z'],
    ['Work late at 17:30', 'work', '2026-10-12T15:30:00.000Z', '2026-10-12T22:00:00.000Z'],
    ['Work on Saturday at 09:00', 'work', '2026-10-10T07:00:00.000Z', '2026-10-10T22:00:00.000Z'],
    [
      'Personal at 00:00 exactly',
      'personal',
      '2026-10-11T22:00:00.000Z',
      '2026-10-12T16:00:00.000Z',
    ],
    ['Work at 08:00 exactly', 'work', '2026-10-12T06:00:00.000Z', '2026-10-12T22:00:00.000Z'],
    ['Work at 07:59:30', 'work', '2026-10-12T05:59:30.000Z', '2026-10-12T06:00:00.000Z'],
    [
      'Personal on the 25 hour day at 12:00 CET',
      'personal',
      '2026-10-25T11:00:00.000Z',
      '2026-10-25T23:00:00.000Z',
    ],
  ])('%s', (_label, areaId, nowIso, endsIso) => {
    expect(makeAreaPick(seeds, settings, at(nowIso), areaId)).toEqual({
      areaId,
      endsAt: at(endsIso),
    });
  });

  it('ends at the next entry after a 00:00 start that is not after now', () => {
    const area = anArea({
      id: 'x',
      activeHours: hoursOf({
        [IsoWeekday.Monday]: [
          [0, 60],
          [600, 700],
        ],
      }),
    });
    expect(makeAreaPick([area], settings, at('2026-10-11T22:00:00.000Z'), 'x')?.endsAt).toBe(
      at('2026-10-12T08:00:00.000Z'),
    );
  });

  describe('touching intervals', () => {
    const area = anArea({
      id: 'touch',
      activeHours: hoursOf({
        [IsoWeekday.Monday]: [
          [480, 720],
          [720, 1080],
        ],
      }),
    });

    it('does not treat the start of a touching interval as an entry', () => {
      expect(makeAreaPick([area], settings, at('2026-10-12T07:00:00.000Z'), 'touch')?.endsAt).toBe(
        at('2026-10-12T22:00:00.000Z'),
      );
    });

    it('still ends at the first interval start before it', () => {
      expect(makeAreaPick([area], settings, at('2026-10-12T05:00:00.000Z'), 'touch')?.endsAt).toBe(
        at('2026-10-12T06:00:00.000Z'),
      );
    });
  });

  it('on the fall-back day ends at the first pass entry, but ignores it on the second pass', () => {
    const area = anArea({
      id: 'night',
      activeHours: hoursOf({ [IsoWeekday.Sunday]: [[150, 200]] }),
    });
    expect(makeAreaPick([area], settings, at('2026-10-25T00:15:00.000Z'), 'night')?.endsAt).toBe(
      at('2026-10-25T00:30:00.000Z'),
    );
    expect(makeAreaPick([area], settings, at('2026-10-25T01:15:00.000Z'), 'night')?.endsAt).toBe(
      at('2026-10-25T23:00:00.000Z'),
    );
  });

  it('ignores the hours of other Areas', () => {
    const other = anArea({
      id: 'other',
      activeHours: hoursOf({ [IsoWeekday.Monday]: [[600, 700]] }),
    });
    expect(
      makeAreaPick([...seeds, other], settings, at('2026-10-12T15:30:00.000Z'), 'work')?.endsAt,
    ).toBe(at('2026-10-12T22:00:00.000Z'));
  });

  it('returns null for an unknown Area', () => {
    expect(makeAreaPick(seeds, settings, at('2026-10-12T08:00:00.000Z'), 'gone')).toBeNull();
  });

  it('throws for an invalid zone when the Area exists', () => {
    expect(() =>
      makeAreaPick(
        seeds,
        { ...settings, timeZone: 'Mars/Olympus' },
        at('2026-10-12T08:00:00.000Z'),
        'work',
      ),
    ).toThrow(new RangeError('Invalid time zone: Mars/Olympus'));
  });
});

describe('currentArea', () => {
  const pick: AreaPick = { areaId: 'work', endsAt: at('2026-10-12T06:00:00.000Z') };

  it('returns the pick while now is before endsAt', () => {
    expect(currentArea(seeds, settings, pick.endsAt - 1, pick)).toEqual({
      areaIds: ['work'],
      picked: true,
    });
  });

  it('returns the automatic set when now equals endsAt', () => {
    expect(currentArea(seeds, settings, pick.endsAt, pick)).toEqual({
      areaIds: ['work'],
      picked: false,
    });
  });

  it('returns the automatic set when the picked Area is gone', () => {
    const gone: AreaPick = { areaId: 'gone', endsAt: at('2026-10-13T00:00:00.000Z') };
    expect(currentArea(seeds, settings, at('2026-10-12T05:00:00.000Z'), gone)).toEqual({
      areaIds: ['personal'],
      picked: false,
    });
  });

  it('returns the automatic set without a pick', () => {
    expect(currentArea(seeds, settings, at('2026-10-12T16:00:00.000Z'), null)).toEqual({
      areaIds: ['personal'],
      picked: false,
    });
  });

  it('never brings a Work pick made at 06:00 back after it ended', () => {
    const made = makeAreaPick(seeds, settings, at('2026-10-12T04:00:00.000Z'), 'work');
    expect(made).toEqual({ areaId: 'work', endsAt: at('2026-10-12T06:00:00.000Z') });
    expect(currentArea(seeds, settings, at('2026-10-12T05:00:00.000Z'), made)).toEqual({
      areaIds: ['work'],
      picked: true,
    });
    expect(currentArea(seeds, settings, at('2026-10-12T06:00:00.000Z'), made)).toEqual({
      areaIds: ['work'],
      picked: false,
    });
    expect(currentArea(seeds, settings, at('2026-10-12T16:00:00.000Z'), made)).toEqual({
      areaIds: ['personal'],
      picked: false,
    });
  });

  it('does not convert the zone on the picked path', () => {
    const bad = { ...settings, timeZone: 'Mars/Olympus' };
    expect(currentArea(seeds, bad, pick.endsAt - 1, pick)).toEqual({
      areaIds: ['work'],
      picked: true,
    });
  });
});

describe('a pick made by makeAreaPick', () => {
  it('ends after now, within the local day, and then selects the picked Area', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: at('2026-10-11T00:00:00.000Z'), max: at('2026-11-08T00:00:00.000Z') }),
        fc.constantFrom(...seeds.map((a) => a.id)),
        (now, areaId) => {
          const made = makeAreaPick(seeds, settings, now, areaId);
          expect(made).not.toBeNull();
          if (made === null) return;
          expect(made.endsAt).toBeGreaterThan(now);
          expect(made.endsAt).toBeLessThanOrEqual(
            localMinuteInstant(toLocalDateTime(now, AMS).date, 1440, AMS),
          );
          expect(currentArea(seeds, settings, now, made)).toEqual({
            areaIds: [areaId],
            picked: true,
          });
        },
      ),
      { numRuns: 300 },
    );
  });
});
