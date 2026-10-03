// SPDX-License-Identifier: EUPL-1.2
import type { Instant } from '@asys/domain';
import { assert, describe, it } from '@effect/vitest';
import { nextCronRun } from './cron';

const amsterdam = 'Europe/Amsterdam';
const tokyo = 'Asia/Tokyo';
const utc = 'UTC';

const at = (iso: string): Instant => Date.parse(iso);

describe('nextCronRun, 0 3 * * * in Europe/Amsterdam', () => {
  const cron = '0 3 * * *';

  it('gives the next 03:00 local time', () => {
    assert.strictEqual(
      nextCronRun(cron, amsterdam, at('2026-10-02T12:00:00Z')),
      at('2026-10-03T01:00:00Z'),
    );
  });

  it('is strictly after now when now is exactly a fire time', () => {
    assert.strictEqual(
      nextCronRun(cron, amsterdam, at('2026-10-03T01:00:00Z')),
      at('2026-10-04T01:00:00Z'),
    );
  });

  it('fires at the fire time when now is 1 ms before it', () => {
    assert.strictEqual(
      nextCronRun(cron, amsterdam, at('2026-10-03T00:59:59.999Z')),
      at('2026-10-03T01:00:00Z'),
    );
  });

  it('follows the switch into summer time', () => {
    assert.strictEqual(
      nextCronRun(cron, amsterdam, at('2026-03-28T12:00:00Z')),
      at('2026-03-29T01:00:00Z'),
    );
  });

  it('follows the switch back to winter time', () => {
    assert.strictEqual(
      nextCronRun(cron, amsterdam, at('2026-10-24T12:00:00Z')),
      at('2026-10-25T02:00:00Z'),
    );
  });
});

describe('nextCronRun, 30 2 * * * in Europe/Amsterdam', () => {
  const cron = '30 2 * * *';

  it('moves forward when 02:30 falls in the spring gap', () => {
    assert.strictEqual(
      nextCronRun(cron, amsterdam, at('2026-03-28T12:00:00Z')),
      at('2026-03-29T01:30:00Z'),
    );
  });

  it('fires at the first 02:30 of the autumn overlap', () => {
    assert.strictEqual(
      nextCronRun(cron, amsterdam, at('2026-10-24T12:00:00Z')),
      at('2026-10-25T00:30:00Z'),
    );
  });

  it('does not fire again at the second 02:30 of the overlap', () => {
    assert.strictEqual(
      nextCronRun(cron, amsterdam, at('2026-10-25T00:30:00Z')),
      at('2026-10-26T01:30:00Z'),
    );
  });
});

describe('nextCronRun, other zones', () => {
  it('uses the given time zone (Asia/Tokyo)', () => {
    assert.strictEqual(
      nextCronRun('0 3 * * *', tokyo, at('2026-10-02T12:00:00Z')),
      at('2026-10-02T18:00:00Z'),
    );
  });
});

describe('nextCronRun, GMT aliases', () => {
  it.each(['GMT', 'GMT0', 'GMT+0'])('treats %s as a zone at UTC+0', (zone) => {
    assert.strictEqual(
      nextCronRun('0 3 * * *', zone, at('2026-10-02T12:00:00Z')),
      at('2026-10-03T03:00:00Z'),
    );
  });
});

describe('nextCronRun, invalid input', () => {
  it('throws on an invalid expression', () => {
    assert.throws(() => nextCronRun('bad', amsterdam, at('2026-10-02T12:00:00Z')));
  });

  it('throws on an invalid time zone', () => {
    assert.throws(() => nextCronRun('0 3 * * *', 'Mars/Base', at('2026-10-02T12:00:00Z')));
  });

  it('throws on an expression that never fires', () => {
    assert.throws(() => nextCronRun('0 0 31 2 *', utc, at('2026-10-02T12:00:00Z')));
  });
});
