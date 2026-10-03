// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';

import { DeviceStorage } from './device-storage';

describe('DeviceStorage', () => {
  let storage: DeviceStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = TestBed.inject(DeviceStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('get returns null for a missing key', () => {
    expect(storage.get('missing')).toBeNull();
  });

  it('set stores a value that get returns', () => {
    storage.set('k', 'v');

    expect(storage.get('k')).toBe('v');
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('set overwrites an existing value', () => {
    storage.set('k', 'v1');
    storage.set('k', 'v2');

    expect(storage.get('k')).toBe('v2');
  });

  it('remove deletes the key and leaves others', () => {
    storage.set('a', '1');
    storage.set('b', '2');

    storage.remove('a');

    expect(storage.get('a')).toBeNull();
    expect(storage.get('b')).toBe('2');
  });

  it('remove of a missing key does nothing', () => {
    expect(() => storage.remove('missing')).not.toThrow();
  });

  describe('when storage throws', () => {
    it('get returns null', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(storage.get('k')).toBeNull();
    });

    it('set does nothing and does not throw', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(() => storage.set('k', 'v')).not.toThrow();
    });

    it('remove does nothing and does not throw', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('blocked');
      });

      expect(() => storage.remove('k')).not.toThrow();
    });
  });
});
