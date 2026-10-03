// SPDX-License-Identifier: EUPL-1.2

/** What the zone check does: the zone to report to the server and the zone to record on this device. */
export interface ZoneToReport {
  readonly report: string | null;
  readonly record: string | null;
}

/**
 * Decides whether this device reports its zone. The device zone is reported only when it differs
 * from the server's and this device has not already reported it (another device changed the
 * zone since, and it must not be flipped back).
 */
export const zoneToReport = (
  device: string | undefined,
  server: string,
  last: string | null,
): ZoneToReport => {
  if (device === undefined) {
    return { report: null, record: null };
  }

  if (device === server) {
    return { report: null, record: device };
  }

  if (device === last) {
    return { report: null, record: null };
  }

  return { report: device, record: null };
};
