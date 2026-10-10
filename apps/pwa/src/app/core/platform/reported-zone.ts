// SPDX-License-Identifier: EUPL-1.2
import { inject, Service } from '@angular/core';

import { DeviceStorage } from './device-storage';

/** The DeviceStorage key holding the time zone last reported to the server. */
export const LAST_REPORTED_ZONE_KEY = 'asys.timeZone.lastReported';

/** The time zone this device last reported to the server, kept in DeviceStorage. */
@Service()
export class ReportedZone {
  readonly #storage = inject(DeviceStorage);

  /** The zone last reported, or null when none is kept. */
  get(): string | null {
    return this.#storage.get(LAST_REPORTED_ZONE_KEY);
  }

  /** Keeps a zone as the one last reported. */
  set(zone: string): void {
    this.#storage.set(LAST_REPORTED_ZONE_KEY, zone);
  }

  /** Forgets the zone last reported. */
  clear(): void {
    this.#storage.remove(LAST_REPORTED_ZONE_KEY);
  }
}
