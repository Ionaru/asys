// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';

import { DeviceStorage } from './device-storage';
import { LAST_REPORTED_ZONE_KEY, ReportedZone } from './reported-zone';

describe('ReportedZone', () => {
  let get: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  let set: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  let remove: ReturnType<typeof vi.fn<(key: string) => void>>;
  let reportedZone: ReportedZone;

  beforeEach(() => {
    get = vi.fn<(key: string) => string | null>().mockReturnValue(null);
    set = vi.fn<(key: string, value: string) => void>();
    remove = vi.fn<(key: string) => void>();
    TestBed.configureTestingModule({
      providers: [{ provide: DeviceStorage, useValue: { get, set, remove } }],
    });
    reportedZone = TestBed.inject(ReportedZone);
  });

  it('exposes the documented key', () => {
    expect(LAST_REPORTED_ZONE_KEY).toBe('asys.timeZone.lastReported');
  });

  it('reads the zone from the key', () => {
    get.mockReturnValue('Europe/London');

    expect(reportedZone.get()).toBe('Europe/London');
    expect(get).toHaveBeenCalledExactlyOnceWith(LAST_REPORTED_ZONE_KEY);
  });

  it('reads null when the key holds nothing', () => {
    expect(reportedZone.get()).toBeNull();
  });

  it('writes the zone to the key', () => {
    reportedZone.set('Europe/London');

    expect(set).toHaveBeenCalledExactlyOnceWith(LAST_REPORTED_ZONE_KEY, 'Europe/London');
  });

  it('removes the key on clear', () => {
    reportedZone.clear();

    expect(remove).toHaveBeenCalledExactlyOnceWith(LAST_REPORTED_ZONE_KEY);
  });
});
