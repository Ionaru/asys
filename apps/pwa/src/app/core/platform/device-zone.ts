// SPDX-License-Identifier: EUPL-1.2
import { Service } from '@angular/core';

const MAX_ZONE_LENGTH = 64;

/** The device time zone. */
@Service()
export class DeviceZone {
  /** The IANA zone of the device, or undefined when it is missing, too long or not in the supported list. */
  current(): string | undefined {
    const zone: unknown = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (
      typeof zone === 'string' &&
      zone.length <= MAX_ZONE_LENGTH &&
      Intl.supportedValuesOf('timeZone').includes(zone)
    ) {
      return zone;
    }

    return undefined;
  }
}
