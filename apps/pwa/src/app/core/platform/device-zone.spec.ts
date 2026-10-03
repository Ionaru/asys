// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';

import { DeviceZone } from './device-zone';

const deviceReports = (timeZone: string | undefined): void => {
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
    timeZone,
  } as unknown as Intl.ResolvedDateTimeFormatOptions);
};

describe('DeviceZone', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('returns a supported zone as is', () => {
    deviceReports('Europe/Amsterdam');

    expect(TestBed.inject(DeviceZone).current()).toBe('Europe/Amsterdam');
  });

  it('returns undefined for a zone Intl does not list', () => {
    deviceReports('Mars/Olympus');

    expect(TestBed.inject(DeviceZone).current()).toBeUndefined();
  });

  it('returns undefined when the device reports no zone', () => {
    deviceReports(undefined);

    expect(TestBed.inject(DeviceZone).current()).toBeUndefined();
  });

  it('returns undefined for a 65-character zone even when Intl lists it', () => {
    const long = 'A'.repeat(65);
    deviceReports(long);
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([long]);

    expect(TestBed.inject(DeviceZone).current()).toBeUndefined();
  });

  it('accepts a 64-character zone that Intl lists', () => {
    const long = 'A'.repeat(64);
    deviceReports(long);
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([long]);

    expect(TestBed.inject(DeviceZone).current()).toBe(long);
  });
});
