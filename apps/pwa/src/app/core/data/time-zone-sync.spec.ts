// SPDX-License-Identifier: EUPL-1.2
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CommandTag, type Instant } from '@asys/domain';

import { CommandOutcomeTag } from '../api/data-api';
import { Clock } from '../platform/clock';
import { DeviceStorage } from '../platform/device-storage';
import { DeviceZone } from '../platform/device-zone';
import { LAST_REPORTED_ZONE_KEY } from '../platform/reported-zone';
import { DataStore, POLL_INTERVAL_MS } from './data-store';
import { TimeZoneSync } from './time-zone-sync';

const T0 = Date.UTC(2026, 9, 3, 10, 0, 0);

const AMSTERDAM = 'Europe/Amsterdam';

const LONDON = 'Europe/London';

const TOKYO = 'Asia/Tokyo';

const settingsOf = (timeZone: string): object => ({ timeZone, urgencyWindowDays: 2 });

const snapshotBody = (seq: number, overrides: object = {}): object | null => ({
  seq,
  tasks: [],
  blockers: [],
  areas: [],
  reviewItems: [],
  settings: settingsOf(AMSTERDAM),
  ...overrides,
});

const putTask = (seq: number, id: string): object => ({
  entity: 'task',
  op: 'put',
  id,
  seq,
  after: {
    id,
    kind: 'task',
    status: 'open',
    title: `Task ${id}`,
    notes: '',
    captureText: '',
    areaId: null,
    availableFrom: null,
    due: null,
    estimateMinutes: 30,
    important: true,
    voice: null,
    privacy: null,
    dueMoveCount: 0,
    version: 1,
    createdAt: 100,
    closedAt: null,
  },
});

const putSettings = (seq: number, timeZone: string): object => ({
  entity: 'settings',
  op: 'put',
  seq,
  after: settingsOf(timeZone),
});

const changesBody = (seq: number, entries: readonly object[] = []): object | null => ({
  seq,
  entries,
});

const respond = async (req: TestRequest, body: object | null, status = 200): Promise<void> => {
  if (status === 200) {
    req.flush(body);
  } else {
    req.flush(body, { status, statusText: 'Error' });
  }

  await vi.advanceTimersByTimeAsync(0);
};

const expired = (after: number): object | null => ({ _tag: 'ChangesExpired', after });

const unauthorized: object | null = { _tag: 'Unauthorized' };

const setVisibility = (value: 'visible' | 'hidden', dispatch = true): void => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });

  if (dispatch) {
    document.dispatchEvent(new Event('visibilitychange'));
  }
};

const advance = async (ms: number): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms);
};

const track = (promise: Promise<unknown>): { done: boolean } => {
  const flag = { done: false };

  void promise.then(() => {
    flag.done = true;
  });

  return flag;
};

const applied = (seq: number): object => ({ _tag: 'Applied', seq });

describe('TimeZoneSync', () => {
  let store: DataStore;
  let sync: TimeZoneSync;
  let http: HttpTestingController;
  let current: ReturnType<typeof vi.fn<() => string | undefined>>;
  let get: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  let set: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  let remove: ReturnType<typeof vi.fn<(key: string) => void>>;
  let stored: Map<string, string>;

  const noRequests = (): void => {
    http.expectNone(() => true);
  };

  /** Starts both, as the shell does on sign-in. */
  const start = (): void => {
    sync.start();
    store.start();
  };

  /** Stops both, as the shell does on sign-out. */
  const stop = (): void => {
    store.stop();
    sync.stop();
  };

  const begin = async (seq = 12, overrides: object = {}): Promise<void> => {
    start();
    await respond(http.expectOne('/v1/snapshot'), snapshotBody(seq, overrides));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    stored = new Map<string, string>();
    current = vi.fn<() => string | undefined>().mockReturnValue(undefined);
    get = vi.fn<(key: string) => string | null>((key) => stored.get(key) ?? null);
    set = vi.fn<(key: string, value: string) => void>((key, value) => {
      stored.set(key, value);
    });
    remove = vi.fn<(key: string) => void>();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Clock, useValue: { now: signal(T0 as Instant) } },
        { provide: DeviceZone, useValue: { current } },
        { provide: DeviceStorage, useValue: { get, set, remove } },
      ],
    });
    store = TestBed.inject(DataStore);
    sync = TestBed.inject(TimeZoneSync);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    stop();
    Reflect.deleteProperty(document, 'visibilityState');
    http.match(() => true);
    http.verify();
    vi.useRealTimers();
  });

  describe('start and stop', () => {
    it('checks nothing before start', async () => {
      current.mockReturnValue(LONDON);
      store.start();

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(12));
      window.dispatchEvent(new Event('focus'));

      expect(current).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      http.expectNone('/v1/commands');
    });

    it('checks once per settings check after a second start', async () => {
      sync.start();

      await begin(12);

      expect(current).toHaveBeenCalledTimes(1);
    });

    it('checks nothing after stop', async () => {
      current.mockReturnValue(LONDON);
      stored.set(LAST_REPORTED_ZONE_KEY, LONDON);
      await begin(12);
      current.mockClear();

      sync.stop();
      window.dispatchEvent(new Event('focus'));

      expect(current).not.toHaveBeenCalled();
      http.expectNone('/v1/commands');
    });
  });

  describe('automatic check', () => {
    it('reports a differing device zone, records it on Applied, and does not report again after the poll returns it', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);

      const report = http.expectOne('/v1/commands');
      expect(report.request.body).toMatchObject({
        _tag: CommandTag.SetTimeZone,
        timeZone: LONDON,
      });
      await respond(report, { _tag: 'Applied', seq: 13 });

      expect(stored.get(LAST_REPORTED_ZONE_KEY)).toBe(LONDON);
      const poll = http.expectOne('/v1/changes?after=12');
      set.mockClear();
      await respond(poll, changesBody(13, [putSettings(13, LONDON)]));

      expect(set).toHaveBeenCalledWith(LAST_REPORTED_ZONE_KEY, LONDON);
      http.expectNone('/v1/commands');
    });

    it('records the reported zone at once for an automatic report, before the triggered poll settles', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);

      await respond(http.expectOne('/v1/commands'), applied(13));

      expect(stored.get(LAST_REPORTED_ZONE_KEY)).toBe(LONDON);
      http.expectOne('/v1/changes?after=12');
    });

    it('starts no poll for an automatic report that applied while hidden, and writes the zone', async () => {
      setVisibility('hidden', false);
      current.mockReturnValue(LONDON);
      start();
      await respond(http.expectOne('/v1/snapshot'), snapshotBody(12));

      await respond(http.expectOne('/v1/commands'), applied(13));

      expect(stored.get(LAST_REPORTED_ZONE_KEY)).toBe(LONDON);
      noRequests();
      await advance(POLL_INTERVAL_MS * 3);
      noRequests();
    });

    it('reads the last reported zone from the storage key', async () => {
      current.mockReturnValue(LONDON);

      await begin(12);

      expect(get).toHaveBeenCalledWith(LAST_REPORTED_ZONE_KEY);
    });

    it('records the device zone and reports nothing when it equals the server zone', async () => {
      current.mockReturnValue(AMSTERDAM);

      await begin(12);

      expect(set).toHaveBeenCalledWith(LAST_REPORTED_ZONE_KEY, AMSTERDAM);
      http.expectNone('/v1/commands');
    });

    it('does not flip the zone back when this device already reported it', async () => {
      stored.set(LAST_REPORTED_ZONE_KEY, LONDON);
      current.mockReturnValue(LONDON);

      await begin(12);

      expect(set).not.toHaveBeenCalled();
      http.expectNone('/v1/commands');
    });

    it('does nothing without a device zone', async () => {
      current.mockReturnValue(undefined);

      await begin(12);

      expect(set).not.toHaveBeenCalled();
      http.expectNone('/v1/commands');
    });

    it('runs the zone check after every successful snapshot', async () => {
      await begin(12);
      current.mockClear();
      await advance(POLL_INTERVAL_MS);
      await respond(http.expectOne('/v1/changes?after=12'), expired(12), 410);

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(40));

      expect(current).toHaveBeenCalledTimes(1);
    });

    it('runs the zone check on focus when there is state and reports a changed zone', async () => {
      await begin(12);
      current.mockReturnValue(LONDON);

      window.dispatchEvent(new Event('focus'));

      const report = http.expectOne('/v1/commands');
      expect(report.request.body).toMatchObject({
        _tag: CommandTag.SetTimeZone,
        timeZone: LONDON,
      });
    });

    it('runs no zone check on focus without state', () => {
      start();

      window.dispatchEvent(new Event('focus'));

      expect(current).not.toHaveBeenCalled();
    });

    it('runs no zone check for online, refresh or visibilitychange', async () => {
      await begin(12);
      current.mockClear();

      window.dispatchEvent(new Event('online'));
      store.refresh();
      setVisibility('visible');

      expect(current).not.toHaveBeenCalled();
    });

    it('has at most one SetTimeZone in flight', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      http.expectOne('/v1/commands');

      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('focus'));

      http.expectNone('/v1/commands');
    });

    it('clears the in-flight flag when the report settles, so a later check can report again', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      await respond(http.expectOne('/v1/commands'), null, 503);

      window.dispatchEvent(new Event('focus'));

      http.expectOne('/v1/commands');
    });

    it.each([
      { name: 'Applied', body: { _tag: 'Applied', seq: 13 }, status: 200 },
      {
        name: 'NotApplicable',
        body: { _tag: 'NotApplicable', reason: 'expectation_failed', reviewItemId: 'r9' },
        status: 200,
      },
      { name: 'Rejected', body: { _tag: 'CommandRejected', reason: 'invalid_date' }, status: 422 },
    ])('records the reported zone for a $name outcome', async ({ body, status }) => {
      current.mockReturnValue(LONDON);
      await begin(12);

      await respond(http.expectOne('/v1/commands'), body, status);

      expect(set).toHaveBeenCalledWith(LAST_REPORTED_ZONE_KEY, LONDON);
    });

    it.each([
      { name: 'Failed', body: null, status: 503 },
      { name: 'KeyReused', body: { _tag: 'IdempotencyKeyReused' }, status: 409 },
      { name: 'SignedOut', body: unauthorized, status: 401 },
    ])('records nothing for a $name outcome', async ({ body, status }) => {
      current.mockReturnValue(LONDON);
      await begin(12);

      await respond(http.expectOne('/v1/commands'), body, status);

      expect(set).not.toHaveBeenCalled();
    });
  });

  describe('stop and generations', () => {
    it('lets an older poll with a settings entry run no zone check and write no storage', async () => {
      current.mockReturnValue(LONDON);
      await begin(12, { settings: settingsOf(LONDON) });
      window.dispatchEvent(new Event('focus'));
      const oldPoll = http.expectOne('/v1/changes?after=12');
      stop();
      start();
      current.mockClear();
      set.mockClear();

      await respond(oldPoll, changesBody(13, [putSettings(13, AMSTERDAM)]));

      expect(current).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it('does not record the zone when a zone report resolves after stop', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      const report = http.expectOne('/v1/commands');
      stop();

      await respond(report, { _tag: 'Applied', seq: 13 });

      expect(set).not.toHaveBeenCalled();
    });

    it('forgets the SetTimeZone in-flight flag on stop', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      stop();

      await begin(12);

      expect(http.match('/v1/commands')).toHaveLength(2);
    });
  });

  describe('polling', () => {
    it('runs the zone check once after all entries when settings entries were applied', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      current.mockClear();

      await respond(
        http.expectOne('/v1/changes?after=12'),
        changesBody(14, [putSettings(13, 'Europe/Paris'), putSettings(14, AMSTERDAM)]),
      );

      expect(current).toHaveBeenCalledTimes(1);
    });

    it('runs the zone check on a settings entry even when it changed nothing', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      current.mockClear();

      await respond(
        http.expectOne('/v1/changes?after=12'),
        changesBody(13, [putSettings(13, AMSTERDAM)]),
      );

      expect(current).toHaveBeenCalledTimes(1);
    });

    it('runs no zone check for a settings entry at or below the store seq or for other entities', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      current.mockClear();

      await respond(
        http.expectOne('/v1/changes?after=12'),
        changesBody(13, [putSettings(12, 'Europe/Paris'), putTask(13, 't13')]),
      );

      expect(current).not.toHaveBeenCalled();
    });
  });

  describe('hidden document', () => {
    it('still sends the zone report while hidden', async () => {
      setVisibility('hidden', false);
      current.mockReturnValue(LONDON);
      start();

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(12));

      const report = http.expectOne('/v1/commands');
      expect(report.request.body).toMatchObject({
        _tag: CommandTag.SetTimeZone,
        timeZone: LONDON,
      });
    });
  });

  describe('choose', () => {
    it('waits for the automatic report, posts the chosen zone, keeps the device zone as reported and sends no second report', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      const report = http.expectOne('/v1/commands');
      expect(report.request.body).toMatchObject({
        _tag: CommandTag.SetTimeZone,
        timeZone: LONDON,
      });

      const result = sync.choose(TOKYO);
      const flag = track(result);
      await advance(0);
      http.expectNone('/v1/commands');

      await respond(report, applied(13));
      expect(stored.get(LAST_REPORTED_ZONE_KEY)).toBe(LONDON);
      const reportPoll = http.expectOne('/v1/changes?after=12');
      const chosen = http.expectOne('/v1/commands');
      expect(chosen.request.body).toMatchObject({ _tag: CommandTag.SetTimeZone, timeZone: TOKYO });
      expect((chosen.request.body as { idempotencyKey: string }).idempotencyKey).not.toBe(
        (report.request.body as { idempotencyKey: string }).idempotencyKey,
      );
      set.mockClear();

      await respond(chosen, applied(14));

      expect(set).toHaveBeenCalledWith(LAST_REPORTED_ZONE_KEY, LONDON);
      expect(flag.done).toBe(false);
      await respond(reportPoll, changesBody(13));
      expect(flag.done).toBe(false);
      const followUp = http.expectOne('/v1/changes?after=13');
      await respond(followUp, changesBody(14, [putSettings(14, TOKYO)]));

      http.expectNone('/v1/commands');
      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 14 });
      expect(store.state()?.settings.timeZone).toBe(TOKYO);
    });

    it('posts at once with no automatic report in flight, and waits like send for a poll', async () => {
      await begin(12);

      const result = sync.choose(TOKYO);
      const flag = track(result);
      const chosen = http.expectOne('/v1/commands');
      expect(chosen.request.body).toMatchObject({ _tag: CommandTag.SetTimeZone, timeZone: TOKYO });
      await respond(chosen, applied(13));

      expect(flag.done).toBe(false);
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
      expect(flag.done).toBe(true);
    });

    it('holds the settings subject when the follow-up failed', async () => {
      await begin(12);
      const result = sync.choose(TOKYO);
      await respond(http.expectOne('/v1/commands'), applied(13));

      await respond(http.expectOne('/v1/changes?after=12'), null, 503);

      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
      expect(store.awaitingSync()).toEqual(new Set(['settings']));
    });

    it('writes nothing when the device has no zone', async () => {
      await begin(12);

      const result = sync.choose(TOKYO);
      await respond(http.expectOne('/v1/commands'), applied(13));
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
      await result;

      expect(set).not.toHaveBeenCalled();
    });

    it('sends no automatic report during it, from a focus, a snapshot or a settings entry', async () => {
      current.mockReturnValue(AMSTERDAM);
      await begin(12);
      const result = sync.choose(TOKYO);
      const flag = track(result);
      const chosen = http.expectOne('/v1/commands');
      current.mockReturnValue(LONDON);

      window.dispatchEvent(new Event('focus'));
      http.expectNone('/v1/commands');
      await respond(
        http.expectOne('/v1/changes?after=12'),
        changesBody(13, [putSettings(13, 'Europe/Paris')]),
      );
      http.expectNone('/v1/commands');
      await advance(POLL_INTERVAL_MS);
      await respond(http.expectOne('/v1/changes?after=13'), expired(13), 410);
      await respond(http.expectOne('/v1/snapshot'), snapshotBody(20));
      http.expectNone('/v1/commands');
      expect(flag.done).toBe(false);

      await respond(chosen, { _tag: 'CommandRejected', reason: 'invalid_time_zone' }, 422);
      expect(flag.done).toBe(true);
    });

    it('still records the device zone during it when it equals the server zone', async () => {
      current.mockReturnValue(LONDON);
      stored.set(LAST_REPORTED_ZONE_KEY, LONDON);
      await begin(12);
      const result = sync.choose(TOKYO);
      const chosen = http.expectOne('/v1/commands');
      set.mockClear();

      window.dispatchEvent(new Event('focus'));
      await respond(
        http.expectOne('/v1/changes?after=12'),
        changesBody(13, [putSettings(13, LONDON)]),
      );

      expect(set).toHaveBeenCalledWith(LAST_REPORTED_ZONE_KEY, LONDON);
      await respond(chosen, { _tag: 'CommandRejected', reason: 'invalid_time_zone' }, 422);
      await result;
    });

    it('lets the automatic check report a later device zone change after it resolved', async () => {
      current.mockReturnValue(AMSTERDAM);
      await begin(12);
      const result = sync.choose(TOKYO);
      await respond(http.expectOne('/v1/commands'), applied(13));
      expect(stored.get(LAST_REPORTED_ZONE_KEY)).toBe(AMSTERDAM);
      await respond(
        http.expectOne('/v1/changes?after=12'),
        changesBody(13, [putSettings(13, TOKYO)]),
      );
      await result;
      current.mockReturnValue(LONDON);

      window.dispatchEvent(new Event('focus'));

      const report = http.expectOne('/v1/commands');
      expect(report.request.body).toMatchObject({
        _tag: CommandTag.SetTimeZone,
        timeZone: LONDON,
      });
    });

    it('resolves a Rejected invalid_time_zone at once, starts no poll and writes nothing', async () => {
      current.mockReturnValue(LONDON);
      stored.set(LAST_REPORTED_ZONE_KEY, LONDON);
      await begin(12);

      const result = sync.choose('Mars/Olympus');
      const flag = track(result);
      await respond(
        http.expectOne('/v1/commands'),
        { _tag: 'CommandRejected', reason: 'invalid_time_zone' },
        422,
      );

      expect(flag.done).toBe(true);
      expect(await result).toEqual({
        _tag: CommandOutcomeTag.Rejected,
        reason: 'invalid_time_zone',
      });
      noRequests();
      expect(set).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'Failed', body: null, status: 503 },
      { name: 'KeyReused', body: { _tag: 'IdempotencyKeyReused' }, status: 409 },
      { name: 'SignedOut', body: unauthorized, status: 401 },
    ])('resolves a $name outcome at once and writes nothing', async ({ body, status }) => {
      current.mockReturnValue(LONDON);
      stored.set(LAST_REPORTED_ZONE_KEY, LONDON);
      await begin(12);

      const result = sync.choose(TOKYO);
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), body, status);

      expect(flag.done).toBe(true);
      noRequests();
      expect(set).not.toHaveBeenCalled();
    });

    it('writes nothing for a NotApplicable outcome but waits for the poll', async () => {
      current.mockReturnValue(LONDON);
      stored.set(LAST_REPORTED_ZONE_KEY, LONDON);
      await begin(12);

      const result = sync.choose(TOKYO);
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), {
        _tag: 'NotApplicable',
        reason: 'expectation_failed',
        reviewItemId: 'r9',
      });

      expect(set).not.toHaveBeenCalled();
      expect(flag.done).toBe(false);
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(12));
      expect(flag.done).toBe(true);
    });

    it('resolves at once and writes nothing when the store stopped before the response', async () => {
      current.mockReturnValue(LONDON);
      stored.set(LAST_REPORTED_ZONE_KEY, LONDON);
      await begin(12);
      const result = sync.choose(TOKYO);
      const flag = track(result);
      const chosen = http.expectOne('/v1/commands');

      stop();
      await respond(chosen, applied(13));

      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
      expect(set).not.toHaveBeenCalled();
      noRequests();
    });

    it('resolves at once and writes nothing more when the store stops while it waits', async () => {
      current.mockReturnValue(LONDON);
      stored.set(LAST_REPORTED_ZONE_KEY, LONDON);
      await begin(12);
      const result = sync.choose(TOKYO);
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));
      const poll = http.expectOne('/v1/changes?after=12');
      set.mockClear();

      stop();
      await advance(0);

      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
      expect(store.awaitingSync().size).toBe(0);
      await respond(poll, changesBody(13, [putSettings(13, TOKYO)]));
      expect(set).not.toHaveBeenCalled();
    });

    it('resolves and writes nothing when the store stops while it waits for the automatic report', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      const report = http.expectOne('/v1/commands');
      const result = sync.choose(TOKYO);
      const flag = track(result);
      await advance(0);

      stop();
      await respond(report, applied(13));
      await advance(0);

      for (const req of http.match('/v1/commands')) {
        await respond(req, applied(14));
      }

      expect(flag.done).toBe(true);
      expect(set).not.toHaveBeenCalled();
      expect(await result).toMatchObject({ _tag: CommandOutcomeTag.Applied });
      noRequests();
    });
  });
});
