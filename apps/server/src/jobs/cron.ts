// SPDX-License-Identifier: EUPL-1.2
import type { Instant, TimeZone } from '@asys/domain';
import { Cron, DateTime } from 'effect';

/**
 * The first run of a cron expression strictly after `now`, evaluated in the
 * given IANA time zone (so daylight saving shifts follow the zone). Throws on
 * an invalid expression, an invalid zone, or an expression that parses but
 * never fires (such as `0 0 31 2 *`). Callers that cannot trust the input wrap
 * it in `Effect.try`. The zone is resolved as a named zone first: given as a
 * string, `Cron.parse` reads `GMT`, `GMT0` and `GMT+0` as malformed offsets,
 * while the domain accepts them as zones.
 */
export const nextCronRun = (cron: string, timeZone: TimeZone, now: Instant): Instant =>
  Cron.next(Cron.parseUnsafe(cron, DateTime.zoneMakeNamedUnsafe(timeZone)), now).getTime();
