// SPDX-License-Identifier: EUPL-1.2
import { zoneToReport } from './zone-to-report';

describe('zoneToReport', () => {
  it.each([
    {
      name: 'reports a device zone that differs from the server and was never reported',
      device: 'Europe/London',
      server: 'Europe/Amsterdam',
      last: null,
      expected: { report: 'Europe/London', record: null },
    },
    {
      name: 'does not flip back a zone this device already reported',
      device: 'Europe/London',
      server: 'Europe/Amsterdam',
      last: 'Europe/London',
      expected: { report: null, record: null },
    },
    {
      name: 'records the device zone when it equals the server zone',
      device: 'Europe/Amsterdam',
      server: 'Europe/Amsterdam',
      last: 'x',
      expected: { report: null, record: 'Europe/Amsterdam' },
    },
    {
      name: 'reports when the last reported zone is another zone',
      device: 'Europe/Paris',
      server: 'Europe/London',
      last: 'Europe/Amsterdam',
      expected: { report: 'Europe/Paris', record: null },
    },
    {
      name: 'does nothing without a device zone',
      device: undefined,
      server: 'Europe/London',
      last: null,
      expected: { report: null, record: null },
    },
  ])('$name', ({ device, server, last, expected }) => {
    expect(zoneToReport(device, server, last)).toEqual(expected);
  });

  it('records an equal zone even without a stored value', () => {
    expect(zoneToReport('Europe/Amsterdam', 'Europe/Amsterdam', null)).toEqual({
      report: null,
      record: 'Europe/Amsterdam',
    });
  });

  it('does nothing without a device zone even when the last zone equals the server zone', () => {
    expect(zoneToReport(undefined, 'Europe/London', 'Europe/London')).toEqual({
      report: null,
      record: null,
    });
  });
});
