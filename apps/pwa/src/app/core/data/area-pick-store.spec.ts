// SPDX-License-Identifier: EUPL-1.2
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AreaPick, Instant } from '@asys/domain';

import { Clock } from '../platform/clock';
import { AREA_PICK_KEY, AreaPickStore } from './area-pick-store';

const asInstant = (value: number): Instant => value as Instant;

const stored = (areaId: string, endsAt: number): string => JSON.stringify({ areaId, endsAt });

const work: AreaPick = { areaId: 'work', endsAt: asInstant(1000) };

const personal: AreaPick = { areaId: 'personal', endsAt: asInstant(2000) };

const storageEvent = (key: string | null): void => {
  window.dispatchEvent(new StorageEvent('storage', { key }));
};

describe('AreaPickStore', () => {
  let now: WritableSignal<Instant>;

  const create = (): AreaPickStore => TestBed.runInInjectionContext(() => new AreaPickStore());

  beforeEach(() => {
    localStorage.clear();
    now = signal(asInstant(0));
    TestBed.configureTestingModule({
      providers: [{ provide: Clock, useValue: { now } }],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('exposes the documented key', () => {
    expect(AREA_PICK_KEY).toBe('asys.areaPick');
  });

  describe('reading', () => {
    it('has no pick when nothing is stored', () => {
      expect(create().current()).toBeNull();
    });

    it('restores a stored pick', () => {
      localStorage.setItem(AREA_PICK_KEY, stored('work', 1000));
      now.set(asInstant(999));

      expect(create().current()).toEqual({ areaId: 'work', endsAt: 1000 });
    });

    it.each([
      ['an empty string', ''],
      ['text that is not JSON', 'not json'],
      ['null', 'null'],
      ['a number', '5'],
      ['a string', '"work"'],
      ['an array', '[]'],
      ['an array holding a valid pick', '[{"areaId":"work","endsAt":1000}]'],
      ['an empty object', '{}'],
      ['a missing areaId', '{"endsAt":1000}'],
      ['a missing endsAt', '{"areaId":"work"}'],
      ['an empty areaId', '{"areaId":"","endsAt":1000}'],
      ['a numeric areaId', '{"areaId":5,"endsAt":1000}'],
      ['a null areaId', '{"areaId":null,"endsAt":1000}'],
      ['an endsAt that is a string', '{"areaId":"work","endsAt":"1000"}'],
      ['a null endsAt', '{"areaId":"work","endsAt":null}'],
      ['an endsAt that is an object', '{"areaId":"work","endsAt":{}}'],
    ])('reads %s as no pick', (_name, raw) => {
      localStorage.setItem(AREA_PICK_KEY, raw);

      expect(create().current()).toBeNull();
    });

    it('drops extra fields and keeps only areaId and endsAt', () => {
      localStorage.setItem(
        AREA_PICK_KEY,
        JSON.stringify({ areaId: 'work', endsAt: 1000, label: 'Work', extra: [1] }),
      );

      expect(create().current()).toStrictEqual({ areaId: 'work', endsAt: 1000 });
    });
  });

  describe('current', () => {
    it('is the pick while the Clock is before endsAt and null from endsAt on', () => {
      localStorage.setItem(AREA_PICK_KEY, stored('work', 1000));
      const store = create();

      now.set(asInstant(999));
      expect(store.current()).toEqual({ areaId: 'work', endsAt: 1000 });

      now.set(asInstant(1000));
      expect(store.current()).toBeNull();

      now.set(asInstant(5000));
      expect(store.current()).toBeNull();
    });

    it('is null for a pick that has ended before the store was made', () => {
      localStorage.setItem(AREA_PICK_KEY, stored('work', 1000));
      now.set(asInstant(1000));

      expect(create().current()).toBeNull();
    });

    it('leaves the stored value in place when the pick ends', () => {
      localStorage.setItem(AREA_PICK_KEY, stored('work', 1000));
      const store = create();

      now.set(asInstant(1000));

      expect(store.current()).toBeNull();
      expect(localStorage.getItem(AREA_PICK_KEY)).toBe(stored('work', 1000));
    });
  });

  describe('pick', () => {
    it('writes the exact JSON of areaId and endsAt', () => {
      create().pick(work);

      expect(localStorage.getItem(AREA_PICK_KEY)).toBe('{"areaId":"work","endsAt":1000}');
    });

    it('writes only areaId and endsAt', () => {
      create().pick({ ...work, extra: true } as AreaPick);

      expect(localStorage.getItem(AREA_PICK_KEY)).toBe('{"areaId":"work","endsAt":1000}');
    });

    it('updates current at once, replacing an earlier pick', () => {
      const store = create();

      store.pick(work);
      expect(store.current()).toEqual(work);

      store.pick(personal);
      expect(store.current()).toEqual(personal);
    });

    it('is read back by a store made later', () => {
      create().pick(work);

      expect(create().current()).toEqual(work);
    });
  });

  describe('clear', () => {
    it('removes the key and makes current null at once', () => {
      const store = create();
      store.pick(work);

      store.clear();

      expect(localStorage.getItem(AREA_PICK_KEY)).toBeNull();
      expect(store.current()).toBeNull();
    });

    it('also forgets a pick that was restored at construction', () => {
      localStorage.setItem(AREA_PICK_KEY, stored('work', 1000));
      const store = create();

      store.clear();

      expect(localStorage.getItem(AREA_PICK_KEY)).toBeNull();
      expect(store.current()).toBeNull();
    });
  });

  describe('other tabs', () => {
    it('reads the key again when a storage event names it', () => {
      const a = create();
      const b = create();

      a.pick(work);
      expect(b.current()).toBeNull();

      storageEvent(AREA_PICK_KEY);

      expect(b.current()).toEqual(work);
    });

    it('follows a clear made by the other store', () => {
      const a = create();
      a.pick(work);
      const b = create();
      expect(b.current()).toEqual(work);

      a.clear();
      storageEvent(AREA_PICK_KEY);

      expect(b.current()).toBeNull();
    });

    it('reads the key again when a storage event has a null key (storage cleared)', () => {
      const a = create();
      a.pick(work);
      const b = create();
      expect(b.current()).toEqual(work);

      localStorage.clear();
      storageEvent(null);

      expect(b.current()).toBeNull();
    });

    it('leaves current unchanged for an event about another key', () => {
      const a = create();
      const b = create();
      b.pick(personal);

      a.pick(work);
      storageEvent('asys.something.else');

      expect(b.current()).toEqual(personal);
    });

    it('stops listening once the root injector is destroyed', () => {
      const a = create();
      const b = create();
      a.pick(work);

      TestBed.resetTestingModule();
      storageEvent(AREA_PICK_KEY);

      expect(b.current()).toBeNull();
    });
  });
});
