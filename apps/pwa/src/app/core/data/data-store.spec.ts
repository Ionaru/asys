// SPDX-License-Identifier: EUPL-1.2
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CommandTag, type Command, type Instant } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../api/data-api';
import { LAST_REPORTED_ZONE_KEY } from '../auth/session';
import { Clock } from '../platform/clock';
import { DeviceStorage } from '../platform/device-storage';
import { DeviceZone } from '../platform/device-zone';
import { DataStore, POLL_INTERVAL_MS, SyncStatus } from './data-store';

const T0 = Date.UTC(2026, 9, 3, 10, 0, 0);

const AMSTERDAM = 'Europe/Amsterdam';

const LONDON = 'Europe/London';

const aTask = (id: string, overrides: object = {}): object => ({
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
  ...overrides,
});

const aReviewItem = (id: string, resolvedAt: number | null = null): object => ({
  id,
  kind: 'expectation_failed',
  subjects: [{ type: 'task', id: 't1' }],
  payload: { note: 'x' },
  dedupeKey: null,
  createdAt: 100,
  resolvedAt,
});

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

const putTask = (seq: number, id: string, overrides: object = {}): object => ({
  entity: 'task',
  op: 'put',
  id,
  seq,
  after: aTask(id, overrides),
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

const capture: Command = {
  _tag: CommandTag.CaptureTask,
  taskId: 't1',
  title: 'Write tests',
  captureText: 'write tests',
};

const respond = async (req: TestRequest, body: object | null, status = 200): Promise<void> => {
  if (status === 200) {
    req.flush(body);
  } else {
    req.flush(body, { status, statusText: 'Error' });
  }

  await vi.advanceTimersByTimeAsync(0);
};

const networkError = async (req: TestRequest): Promise<void> => {
  req.error(new ProgressEvent('error'), { status: 0 });
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

const completeTask: Command = { _tag: CommandTag.CompleteTask, taskId: 't1' };

describe('DataStore', () => {
  let store: DataStore;
  let http: HttpTestingController;
  let current: ReturnType<typeof vi.fn<() => string | undefined>>;
  let get: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  let set: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  let remove: ReturnType<typeof vi.fn<(key: string) => void>>;
  let stored: Map<string, string>;

  const noRequests = (): void => {
    http.expectNone(() => true);
  };

  const begin = async (seq = 12, overrides: object = {}): Promise<void> => {
    store.start();
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
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    store.stop();
    Reflect.deleteProperty(document, 'visibilityState');
    http.match(() => true);
    http.verify();
    vi.useRealTimers();
  });

  describe('before start and after stop', () => {
    it('is Idle without state before start', () => {
      expect(store.status()).toBe(SyncStatus.Idle);
      expect(store.state()).toBeNull();
      expect(store.syncedAt()).toBeNull();
      expect(store.now()).toBeNull();
      expect(store.inboxCount()).toBe(0);
    });

    it('ignores every trigger and requests nothing', async () => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      store.refresh();
      await advance(POLL_INTERVAL_MS * 2);

      noRequests();
      expect(store.status()).toBe(SyncStatus.Idle);
    });

    it('still runs a command before start, resolves its outcome and triggers no poll', async () => {
      const result = store.send(capture, 'key-1');

      const req = http.expectOne({ method: 'POST', url: '/v1/commands' });
      expect(req.request.body).toMatchObject({ ...capture, idempotencyKey: 'key-1' });
      await respond(req, { _tag: 'Applied', seq: 7 });

      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 7 });
      noRequests();
    });

    it('returns to Idle with no state after stop', async () => {
      await begin();

      store.stop();

      expect(store.status()).toBe(SyncStatus.Idle);
      expect(store.state()).toBeNull();
      expect(store.syncedAt()).toBeNull();
      expect(store.now()).toBeNull();
      expect(store.inboxCount()).toBe(0);
    });

    it('ignores triggers and the timer after stop, but a command still runs without a poll', async () => {
      await begin();
      store.stop();

      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      store.refresh();
      await advance(POLL_INTERVAL_MS * 2);
      noRequests();

      const result = store.send(capture, 'key-2');
      await respond(http.expectOne('/v1/commands'), { _tag: 'Applied', seq: 13 });

      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
      noRequests();
    });
  });

  describe('start', () => {
    it('sets Loading and requests the snapshot', () => {
      store.start();

      expect(store.status()).toBe(SyncStatus.Loading);
      http.expectOne({ method: 'GET', url: '/v1/snapshot' });
    });

    it('does nothing on a second start while started', () => {
      store.start();
      store.start();

      expect(http.match('/v1/snapshot')).toHaveLength(1);
    });

    it('requests the snapshot while the document is hidden', () => {
      setVisibility('hidden', false);

      store.start();

      http.expectOne('/v1/snapshot');
    });

    it('takes the snapshot as state, sets Ready and syncedAt', async () => {
      store.start();
      await advance(250);

      await respond(
        http.expectOne('/v1/snapshot'),
        snapshotBody(12, { tasks: [aTask('t1')], reviewItems: [aReviewItem('r1')] }),
      );

      expect(store.status()).toBe(SyncStatus.Ready);
      expect(store.syncedAt()).toBe(T0 + 250);
      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['t1']);
      expect(store.state()?.reviewItems.map((item) => item.id)).toEqual(['r1']);
      expect(store.state()?.settings.timeZone).toBe(AMSTERDAM);
    });

    it('adds the focus, online and visibilitychange listeners on start and removes them on stop', () => {
      const addWindow = vi.spyOn(window, 'addEventListener');
      const removeWindow = vi.spyOn(window, 'removeEventListener');
      const addDocument = vi.spyOn(document, 'addEventListener');
      const removeDocument = vi.spyOn(document, 'removeEventListener');

      store.start();

      expect(addWindow.mock.calls.map(([type]) => type)).toEqual(
        expect.arrayContaining(['focus', 'online']),
      );
      expect(addDocument.mock.calls.map(([type]) => type)).toContain('visibilitychange');

      store.stop();

      expect(removeWindow.mock.calls.map(([type]) => type)).toEqual(
        expect.arrayContaining(['focus', 'online']),
      );
      expect(removeDocument.mock.calls.map(([type]) => type)).toContain('visibilitychange');
    });
  });

  describe('snapshot failure without state', () => {
    it('becomes Failed and sets no timer', async () => {
      store.start();

      await respond(http.expectOne('/v1/snapshot'), null, 503);

      expect(store.status()).toBe(SyncStatus.Failed);
      expect(store.state()).toBeNull();
      await advance(POLL_INTERVAL_MS * 4);
      noRequests();
    });

    it('retries the snapshot on a trigger, setting Loading', async () => {
      store.start();
      await networkError(http.expectOne('/v1/snapshot'));

      window.dispatchEvent(new Event('online'));

      expect(store.status()).toBe(SyncStatus.Loading);
      http.expectOne('/v1/snapshot');
    });

    it('requests the snapshot again at once with Loading when a trigger arrived during it', async () => {
      store.start();
      const snapshot = http.expectOne('/v1/snapshot');
      window.dispatchEvent(new Event('online'));
      noRequests();

      await networkError(snapshot);

      expect(store.status()).toBe(SyncStatus.Loading);
      http.expectOne('/v1/snapshot');
    });

    it('becomes Failed again and sets no timer when the retry fails', async () => {
      store.start();
      await respond(http.expectOne('/v1/snapshot'), null, 503);
      store.refresh();

      await respond(http.expectOne('/v1/snapshot'), null, 503);

      expect(store.status()).toBe(SyncStatus.Failed);
      await advance(POLL_INTERVAL_MS * 4);
      noRequests();
    });

    it('goes Ready and polls after=<seq> when the retry succeeds', async () => {
      store.start();
      await respond(http.expectOne('/v1/snapshot'), null, 503);
      window.dispatchEvent(new Event('focus'));

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(21));

      expect(store.status()).toBe(SyncStatus.Ready);
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=21');
    });

    it('retries the snapshot on a trigger even while the document is hidden', async () => {
      store.start();
      await respond(http.expectOne('/v1/snapshot'), null, 503);
      setVisibility('hidden');

      window.dispatchEvent(new Event('online'));

      http.expectOne('/v1/snapshot');
    });
  });

  describe('stop and generations', () => {
    it('ignores the settle of a snapshot from an older generation', async () => {
      store.start();
      store.stop();
      store.start();

      const [a, b] = http.match('/v1/snapshot');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(http.match('/v1/snapshot')).toHaveLength(0);

      await respond(a, snapshotBody(5, { tasks: [aTask('old')] }));

      expect(store.status()).toBe(SyncStatus.Loading);
      expect(store.state()).toBeNull();
      noRequests();

      await respond(b, snapshotBody(9));

      expect(store.status()).toBe(SyncStatus.Ready);
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=9');
    });

    it('keeps the new generation untouched when an older snapshot settles later', async () => {
      store.start();
      store.stop();
      store.start();
      const [a, b] = http.match('/v1/snapshot');

      await respond(b, snapshotBody(9, { tasks: [aTask('new')] }));
      await respond(a, snapshotBody(5, { tasks: [aTask('old')] }));

      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['new']);
      expect(store.status()).toBe(SyncStatus.Ready);
      noRequests();
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=9');
    });

    it('lets an older failed snapshot touch nothing', async () => {
      store.start();
      store.stop();
      store.start();
      const [a, b] = http.match('/v1/snapshot');

      await respond(a, null, 503);

      expect(store.status()).toBe(SyncStatus.Loading);
      noRequests();

      await respond(b, snapshotBody(9));

      expect(store.status()).toBe(SyncStatus.Ready);
    });

    it('lets an older poll that settles touch nothing, not even a snapshot after a 410', async () => {
      await begin(12);
      window.dispatchEvent(new Event('focus'));
      const oldPoll = http.expectOne('/v1/changes?after=12');
      store.stop();
      store.start();

      await respond(oldPoll, expired(12), 410);

      expect(store.status()).toBe(SyncStatus.Loading);
      expect(http.match('/v1/snapshot')).toHaveLength(1);
    });

    it('lets an older poll with a settings entry run no zone check and write no storage', async () => {
      current.mockReturnValue(LONDON);
      await begin(12, { settings: settingsOf(LONDON) });
      window.dispatchEvent(new Event('focus'));
      const oldPoll = http.expectOne('/v1/changes?after=12');
      store.stop();
      store.start();
      current.mockClear();
      set.mockClear();

      await respond(oldPoll, changesBody(13, [putSettings(13, AMSTERDAM)]));

      expect(current).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    });

    it('cancels the timer on stop', async () => {
      await begin();

      store.stop();
      await advance(POLL_INTERVAL_MS * 2);

      noRequests();
    });

    it('forgets the needs-snapshot flag on stop', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      await respond(http.expectOne('/v1/changes?after=12'), expired(12), 410);
      await respond(http.expectOne('/v1/snapshot'), null, 503);
      expect(store.status()).toBe(SyncStatus.Stale);

      store.stop();
      await begin(3);
      await advance(POLL_INTERVAL_MS);

      http.expectOne('/v1/changes?after=3');
    });

    it('forgets the pending follow-up on stop', async () => {
      store.start();
      window.dispatchEvent(new Event('focus'));
      const a = http.expectOne('/v1/snapshot');
      store.stop();
      store.start();
      const b = http.expectOne('/v1/snapshot');

      await respond(a, snapshotBody(5));
      await respond(b, snapshotBody(9));

      noRequests();
    });

    it('does not record the zone when a zone report resolves after stop', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      const report = http.expectOne('/v1/commands');
      store.stop();

      await respond(report, { _tag: 'Applied', seq: 13 });

      expect(set).not.toHaveBeenCalled();
    });

    it('forgets the SetTimeZone in-flight flag on stop', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      store.stop();

      await begin(12);

      expect(http.match('/v1/commands')).toHaveLength(2);
    });
  });

  describe('settling and the timer', () => {
    it('polls 15 000 ms after the snapshot settled and then 15 000 ms after each poll', async () => {
      await begin(12);

      await advance(14_999);
      noRequests();
      await advance(1);
      await advance(0);
      const first = http.expectOne('/v1/changes?after=12');

      await advance(5_000);
      await respond(first, changesBody(12));

      await advance(14_999);
      noRequests();
      await advance(1);
      http.expectOne('/v1/changes?after=12');
    });

    it('runs exactly one follow-up and one timer for triggers during a poll', async () => {
      await begin(12);
      await advance(1_000);
      window.dispatchEvent(new Event('focus'));
      const first = http.expectOne('/v1/changes?after=12');
      store.refresh();
      noRequests();

      await respond(first, changesBody(12));
      const second = http.expectOne('/v1/changes?after=12');
      await advance(2_000);
      await respond(second, changesBody(12));

      await advance(13_000);
      noRequests();
      await advance(2_000);
      http.expectOne('/v1/changes?after=12');
      noRequests();
    });

    it('requests the snapshot at once after a 410 ChangesExpired poll, with no timer for the poll', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);

      await respond(http.expectOne('/v1/changes?after=12'), expired(12), 410);

      http.expectOne('/v1/snapshot');
    });

    it('drops the follow-up and sets no timer after a 401 Unauthorized', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const poll = http.expectOne('/v1/changes?after=12');
      window.dispatchEvent(new Event('focus'));

      await respond(poll, unauthorized, 401);

      noRequests();
      await advance(POLL_INTERVAL_MS * 4);
      noRequests();
    });

    it('starts the pending follow-up at once when the snapshot of start settles', async () => {
      store.start();
      window.dispatchEvent(new Event('focus'));

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(12));

      http.expectOne('/v1/changes?after=12');
    });

    it('sets no timer while the document is hidden', async () => {
      setVisibility('hidden', false);

      await begin(12);

      await advance(POLL_INTERVAL_MS * 4);
      noRequests();
    });
  });

  describe('polling', () => {
    it('applies the entries after the store seq in order and polls with the response seq', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);

      await respond(
        http.expectOne('/v1/changes?after=12'),
        changesBody(14, [putTask(13, 't13'), putTask(14, 't14')]),
      );

      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['t13', 't14']);
      expect(store.status()).toBe(SyncStatus.Ready);
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=14');
    });

    it('applies entries in order so the last put wins', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);

      await respond(
        http.expectOne('/v1/changes?after=12'),
        changesBody(14, [
          putTask(13, 't1', { title: 'first' }),
          putTask(14, 't1', { title: 'second' }),
        ]),
      );

      expect(store.state()?.tasks.map((task) => task.title)).toEqual(['second']);
    });

    it('skips entries at or below the store seq', async () => {
      await begin(14);
      await advance(POLL_INTERVAL_MS);

      await respond(
        http.expectOne('/v1/changes?after=14'),
        changesBody(15, [putTask(14, 'skipped'), putTask(15, 'applied')]),
      );

      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['applied']);
    });

    it('keeps the very same state object for an empty entries list, and refreshes syncedAt', async () => {
      await begin(12);
      const before = store.state();
      await advance(POLL_INTERVAL_MS);

      await respond(http.expectOne('/v1/changes?after=12'), changesBody(12));

      expect(store.state()).toBe(before);
      expect(store.status()).toBe(SyncStatus.Ready);
      expect(store.syncedAt()).toBe(T0 + POLL_INTERVAL_MS);
    });

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

  describe('410 ChangesExpired', () => {
    const expire = async (seq = 12): Promise<void> => {
      await begin(seq);
      await advance(POLL_INTERVAL_MS);
      await respond(http.expectOne(`/v1/changes?after=${seq}`), expired(seq), 410);
    };

    it('keeps the status and requests the snapshot at once', async () => {
      await expire();

      expect(store.status()).toBe(SyncStatus.Ready);
      http.expectOne('/v1/snapshot');
    });

    it('replaces state and seq when the snapshot succeeds', async () => {
      await expire(12);

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(40, { tasks: [aTask('fresh')] }));

      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['fresh']);
      expect(store.status()).toBe(SyncStatus.Ready);
      noRequests();
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=40');
    });

    it('lets the snapshot replace a pending follow-up', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const poll = http.expectOne('/v1/changes?after=12');
      window.dispatchEvent(new Event('focus'));
      await respond(poll, expired(12), 410);

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(40));

      noRequests();
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=40');
    });

    it('runs exactly one follow-up poll with the new seq for triggers during the snapshot', async () => {
      await expire(12);
      const snapshot = http.expectOne('/v1/snapshot');
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      store.refresh();
      noRequests();

      await respond(snapshot, snapshotBody(40));

      http.expectOne('/v1/changes?after=40');
      noRequests();
    });

    it('becomes Stale keeping state and syncedAt when the snapshot fails, then asks for the snapshot, not the changes', async () => {
      await begin(12, { tasks: [aTask('kept')] });
      const syncedAt = store.syncedAt();
      await advance(POLL_INTERVAL_MS);
      await respond(http.expectOne('/v1/changes?after=12'), expired(12), 410);

      await respond(http.expectOne('/v1/snapshot'), null, 503);

      expect(store.status()).toBe(SyncStatus.Stale);
      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['kept']);
      expect(store.syncedAt()).toBe(syncedAt);
      await advance(POLL_INTERVAL_MS - 1);
      noRequests();
      await advance(1);
      http.expectOne('/v1/snapshot');
      noRequests();
    });

    it('keeps asking for the snapshot until one succeeds, then polls with its seq', async () => {
      await expire(12);
      await respond(http.expectOne('/v1/snapshot'), null, 503);
      await advance(POLL_INTERVAL_MS);
      await respond(http.expectOne('/v1/snapshot'), null, 503);
      await advance(POLL_INTERVAL_MS);

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(50));

      expect(store.status()).toBe(SyncStatus.Ready);
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=50');
    });

    it('requests the snapshot, not a poll, for a trigger while it is needed', async () => {
      await expire(12);
      await respond(http.expectOne('/v1/snapshot'), null, 503);

      window.dispatchEvent(new Event('focus'));

      http.expectOne('/v1/snapshot');
      noRequests();
    });

    it('requests the snapshot again at once when a trigger arrived during the failing snapshot', async () => {
      await expire(12);
      const snapshot = http.expectOne('/v1/snapshot');
      window.dispatchEvent(new Event('focus'));

      await respond(snapshot, null, 503);

      expect(store.status()).toBe(SyncStatus.Stale);
      http.expectOne('/v1/snapshot');
    });

    it('does nothing when the snapshot gets a 401 Unauthorized', async () => {
      await expire(12);

      await respond(http.expectOne('/v1/snapshot'), unauthorized, 401);

      expect(store.status()).toBe(SyncStatus.Ready);
      noRequests();
      await advance(POLL_INTERVAL_MS * 4);
      noRequests();
    });

    it('treats a 410 with another tag as a plain failure', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);

      await respond(http.expectOne('/v1/changes?after=12'), { _tag: 'Other' }, 410);

      expect(store.status()).toBe(SyncStatus.Stale);
      noRequests();
    });
  });

  describe('401 Unauthorized', () => {
    it('changes no status and sets no timer for a poll', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);

      await respond(http.expectOne('/v1/changes?after=12'), unauthorized, 401);

      expect(store.status()).toBe(SyncStatus.Ready);
      await advance(POLL_INTERVAL_MS * 4);
      noRequests();
    });

    it('changes no status and sets no timer for the first snapshot', async () => {
      store.start();

      await respond(http.expectOne('/v1/snapshot'), unauthorized, 401);

      expect(store.status()).toBe(SyncStatus.Loading);
      await advance(POLL_INTERVAL_MS * 4);
      noRequests();
    });
  });

  describe('poll failures', () => {
    it.each([
      { name: 'a network failure', status: 0, body: null },
      { name: 'a 503', status: 503, body: null },
      { name: 'a 401 without a tag', status: 401, body: null },
      { name: 'a 401 with another tag', status: 401, body: { _tag: 'Other' } },
      { name: 'a 410 without a tag', status: 410, body: null },
    ])('becomes Stale, keeps state and polls again after $name', async ({ status, body }) => {
      await begin(12, { tasks: [aTask('kept')] });
      const syncedAt = store.syncedAt();
      await advance(POLL_INTERVAL_MS);
      const poll = http.expectOne('/v1/changes?after=12');

      if (status === 0) {
        await networkError(poll);
      } else {
        await respond(poll, body, status);
      }

      expect(store.status()).toBe(SyncStatus.Stale);
      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['kept']);
      expect(store.syncedAt()).toBe(syncedAt);
      await advance(POLL_INTERVAL_MS - 1);
      noRequests();
      await advance(1);
      http.expectOne('/v1/changes?after=12');
    });

    it('goes back to Ready on the next successful poll', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      await respond(http.expectOne('/v1/changes?after=12'), null, 503);
      await advance(POLL_INTERVAL_MS);

      await respond(http.expectOne('/v1/changes?after=12'), changesBody(12));

      expect(store.status()).toBe(SyncStatus.Ready);
      expect(store.syncedAt()).toBe(T0 + POLL_INTERVAL_MS * 2);
    });
  });

  describe('hidden document', () => {
    it('sets no timer after the start snapshot, drops triggers and polls on becoming visible', async () => {
      setVisibility('hidden', false);
      store.start();
      await respond(http.expectOne('/v1/snapshot'), snapshotBody(12));

      await advance(POLL_INTERVAL_MS * 2);
      window.dispatchEvent(new Event('online'));
      store.refresh();
      window.dispatchEvent(new Event('focus'));
      noRequests();

      setVisibility('visible');

      http.expectOne('/v1/changes?after=12');
    });

    it('lets a firing timer do nothing and not set it again', async () => {
      await begin(12);
      await advance(5_000);
      setVisibility('hidden');

      await advance(POLL_INTERVAL_MS * 3);
      noRequests();

      setVisibility('visible');
      const poll = http.expectOne('/v1/changes?after=12');
      await respond(poll, changesBody(12));
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=12');
    });

    it('drops a pending follow-up and sets no timer when the request settles while hidden', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const poll = http.expectOne('/v1/changes?after=12');
      window.dispatchEvent(new Event('focus'));
      setVisibility('hidden');

      await respond(poll, changesBody(12));

      noRequests();
      await advance(POLL_INTERVAL_MS * 3);
      noRequests();
    });

    it('still requests the snapshot after a 410 while hidden, and sets no timer after it', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const poll = http.expectOne('/v1/changes?after=12');
      setVisibility('hidden');

      await respond(poll, expired(12), 410);

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(40));
      await advance(POLL_INTERVAL_MS * 3);
      noRequests();
    });

    it('still sends a command, including the zone report, while hidden', async () => {
      setVisibility('hidden', false);
      current.mockReturnValue(LONDON);
      store.start();

      await respond(http.expectOne('/v1/snapshot'), snapshotBody(12));

      const report = http.expectOne('/v1/commands');
      expect(report.request.body).toMatchObject({
        _tag: CommandTag.SetTimeZone,
        timeZone: LONDON,
      });
    });

    it('runs the forced follow-up of an Applied outcome while hidden, resolves after it and sets no timer', async () => {
      await begin(12);
      setVisibility('hidden');

      const result = store.send(capture, 'k');
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));
      const poll = http.expectOne('/v1/changes?after=12');
      expect(flag.done).toBe(false);

      await respond(poll, changesBody(13, [putTask(13, 't1')]));

      expect(flag.done).toBe(true);
      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['t1']);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
      noRequests();
      await advance(POLL_INTERVAL_MS * 3);
      noRequests();
    });

    it('still drops a focus while hidden, before and after the forced follow-up', async () => {
      await begin(12);
      setVisibility('hidden');
      window.dispatchEvent(new Event('focus'));
      noRequests();

      const result = store.send(capture, 'k');
      await respond(http.expectOne('/v1/commands'), applied(13));
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
      await result;

      window.dispatchEvent(new Event('focus'));
      store.refresh();
      noRequests();
    });

    it('runs the forced follow-up recorded during a request that settles while hidden', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const inFlight = http.expectOne('/v1/changes?after=12');
      const result = store.send(capture, 'k');
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));
      setVisibility('hidden');

      await respond(inFlight, changesBody(12));

      expect(flag.done).toBe(false);
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
      expect(flag.done).toBe(true);
      await advance(POLL_INTERVAL_MS * 3);
      noRequests();
    });
  });

  describe('triggers', () => {
    it.each([
      {
        name: 'focus',
        fire: (): void => {
          window.dispatchEvent(new Event('focus'));
        },
      },
      {
        name: 'online',
        fire: (): void => {
          window.dispatchEvent(new Event('online'));
        },
      },
      {
        name: 'visibilitychange to visible',
        fire: (): void => {
          setVisibility('visible');
        },
      },
      {
        name: 'refresh()',
        fire: (): void => {
          store.refresh();
        },
      },
    ])('$name starts a poll at once and clears the timer', async ({ fire }) => {
      await begin(12);
      await advance(1_000);

      fire();

      const poll = http.expectOne('/v1/changes?after=12');
      await respond(poll, changesBody(12));
      await advance(POLL_INTERVAL_MS - 1);
      noRequests();
      await advance(1);
      http.expectOne('/v1/changes?after=12');
    });

    it('does not start a poll for visibilitychange to hidden', async () => {
      await begin(12);

      setVisibility('hidden');

      noRequests();
    });

    it('runs exactly one follow-up however many triggers arrived during a poll', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const poll = http.expectOne('/v1/changes?after=12');

      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      store.refresh();
      store.refresh();
      setVisibility('visible');
      noRequests();
      await respond(poll, changesBody(12));

      expect(http.match('/v1/changes?after=12')).toHaveLength(1);
      noRequests();
    });

    it('never overlaps a poll with the snapshot: a trigger during the snapshot waits for it', async () => {
      store.start();
      const snapshot = http.expectOne('/v1/snapshot');

      window.dispatchEvent(new Event('focus'));
      store.refresh();
      noRequests();
      await respond(snapshot, snapshotBody(12));

      http.expectOne('/v1/changes?after=12');
      noRequests();
    });

    it('does not start a second request while one is in flight', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      http.expectOne('/v1/changes?after=12');

      window.dispatchEvent(new Event('focus'));
      await advance(POLL_INTERVAL_MS * 2);

      noRequests();
    });
  });

  describe('send', () => {
    const submit = async (
      body: object | null,
      status = 200,
    ): Promise<{ result: Promise<CommandOutcome>; flag: { done: boolean } }> => {
      const result = store.send(capture, 'key-1');
      const flag = track(result);

      await respond(http.expectOne({ method: 'POST', url: '/v1/commands' }), body, status);

      return { result, flag };
    };

    it('posts the command with the key and resolves the outcome unchanged', async () => {
      await begin(12);

      const result = store.send(capture, 'key-1');

      const req = http.expectOne({ method: 'POST', url: '/v1/commands' });
      expect(req.request.body).toEqual({ ...capture, idempotencyKey: 'key-1' });
      await respond(req, applied(13));
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
    });

    it('defaults the key to a fresh random UUID per call', async () => {
      await begin(12);

      const first = store.send(capture);
      const firstReq = http.expectOne('/v1/commands');
      await respond(firstReq, applied(13));
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
      await first;
      const second = store.send(capture);
      const secondReq = http.expectOne('/v1/commands');
      await respond(secondReq, applied(14));
      await respond(http.expectOne('/v1/changes?after=13'), changesBody(14));
      await second;

      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
      const firstKey = (firstReq.request.body as { idempotencyKey: string }).idempotencyKey;
      const secondKey = (secondReq.request.body as { idempotencyKey: string }).idempotencyKey;
      expect(firstKey).toMatch(uuid);
      expect(secondKey).toMatch(uuid);
      expect(firstKey).not.toBe(secondKey);
    });

    it('starts a poll at once for an Applied outcome and resolves after it', async () => {
      await begin(12);

      const { result, flag } = await submit(applied(13));

      const poll = http.expectOne('/v1/changes?after=12');
      expect(flag.done).toBe(false);
      await respond(poll, changesBody(13));
      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
    });

    it('starts a poll at once for a NotApplicable outcome and resolves after it', async () => {
      await begin(12);

      const { result, flag } = await submit({
        _tag: 'NotApplicable',
        reason: 'expectation_failed',
        reviewItemId: 'r9',
      });

      const poll = http.expectOne('/v1/changes?after=12');
      expect(flag.done).toBe(false);
      await respond(poll, changesBody(13));
      expect(flag.done).toBe(true);
      expect(await result).toMatchObject({
        _tag: CommandOutcomeTag.NotApplicable,
        reviewItemId: 'r9',
      });
    });

    it('resolves a Rejected outcome at once and triggers nothing', async () => {
      await begin(12);

      const { result, flag } = await submit(
        { _tag: 'CommandRejected', reason: 'invalid_date' },
        422,
      );

      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Rejected, reason: 'invalid_date' });
      noRequests();
    });

    it('resolves a KeyReused outcome at once and triggers nothing', async () => {
      await begin(12);

      const { result, flag } = await submit({ _tag: 'IdempotencyKeyReused' }, 409);

      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.KeyReused });
      noRequests();
    });

    it('resolves a SignedOut outcome at once and triggers nothing', async () => {
      await begin(12);

      const { result, flag } = await submit(unauthorized, 401);

      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.SignedOut });
      noRequests();
    });

    it('resolves a Failed outcome at once and triggers nothing', async () => {
      await begin(12);

      const { result, flag } = await submit(null, 503);

      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Failed, status: 503 });
      noRequests();
    });

    it('records an Applied outcome during a poll as a follow-up and resolves only after that follow-up', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const poll = http.expectOne('/v1/changes?after=12');

      const result = store.send(capture, 'key-1');
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));
      noRequests();
      await respond(poll, changesBody(13));

      expect(flag.done).toBe(false);
      const followUp = http.expectOne('/v1/changes?after=13');
      await respond(followUp, changesBody(13));
      expect(flag.done).toBe(true);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
    });
  });

  describe('reading its own writes', () => {
    const commandsOf: readonly {
      readonly name: string;
      readonly command: Command;
      readonly subject: string;
    }[] = [
      { name: 'CompleteTask', command: completeTask, subject: 't1' },
      {
        name: 'RemoveBlocker',
        command: { _tag: CommandTag.RemoveBlocker, linkId: 'l1' },
        subject: 'l1',
      },
      {
        name: 'UpdateArea',
        command: { _tag: CommandTag.UpdateArea, areaId: 'a1', patch: { name: 'Home' } },
        subject: 'a1',
      },
      {
        name: 'ResolveReviewItem',
        command: { _tag: CommandTag.ResolveReviewItem, reviewItemId: 'r1' },
        subject: 'r1',
      },
      {
        name: 'SetUrgencyWindow',
        command: { _tag: CommandTag.SetUrgencyWindow, days: 3 },
        subject: 'settings',
      },
    ];

    it('resolves only after the triggered poll applied its entries', async () => {
      await begin(12);

      const result = store.send(completeTask, 'k');
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));
      const poll = http.expectOne('/v1/changes?after=12');
      await advance(1_000);
      expect(flag.done).toBe(false);

      await respond(poll, changesBody(13, [putTask(13, 't1', { title: 'Done soon' })]));

      expect(flag.done).toBe(true);
      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['t1']);
      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
    });

    it('resolves with the command outcome, never the poll outcome', async () => {
      await begin(12);

      const result = store.send(completeTask, 'k');
      await respond(http.expectOne('/v1/commands'), applied(13));
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(99));

      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
    });

    it('waits for the follow-up poll, not the poll that was already in flight', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const inFlight = http.expectOne('/v1/changes?after=12');
      const result = store.send(completeTask, 'k');
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));

      await respond(inFlight, changesBody(12));

      expect(flag.done).toBe(false);
      const followUp = http.expectOne('/v1/changes?after=12');
      noRequests();
      await respond(followUp, changesBody(13, [putTask(13, 't1')]));
      expect(flag.done).toBe(true);
      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['t1']);
    });

    it('gives exactly one follow-up for several commands and triggers during one request', async () => {
      await begin(12);
      await advance(POLL_INTERVAL_MS);
      const inFlight = http.expectOne('/v1/changes?after=12');
      const first = store.send(completeTask, 'k1');
      const second = store.send({ _tag: CommandTag.RemoveBlocker, linkId: 'l1' }, 'k2');
      const firstFlag = track(first);
      const secondFlag = track(second);
      const [firstReq, secondReq] = http.match('/v1/commands');
      await respond(firstReq, applied(13));
      await respond(secondReq, applied(14));
      window.dispatchEvent(new Event('focus'));
      store.refresh();

      await respond(inFlight, changesBody(12));

      expect(firstFlag.done).toBe(false);
      expect(secondFlag.done).toBe(false);
      const followUp = http.match('/v1/changes?after=12');
      expect(followUp).toHaveLength(1);
      noRequests();
      await respond(followUp[0], changesBody(14));
      expect(firstFlag.done).toBe(true);
      expect(secondFlag.done).toBe(true);
      noRequests();
    });

    it('resolves a command whose response arrived during a poll after the next poll', async () => {
      await begin(12);
      const first = store.send(completeTask, 'k1');
      const firstFlag = track(first);
      await respond(http.expectOne('/v1/commands'), applied(13));
      const firstPoll = http.expectOne('/v1/changes?after=12');
      const second = store.send({ _tag: CommandTag.RemoveBlocker, linkId: 'l1' }, 'k2');
      const secondFlag = track(second);
      await respond(http.expectOne('/v1/commands'), applied(14));

      await respond(firstPoll, changesBody(13));

      expect(firstFlag.done).toBe(true);
      expect(secondFlag.done).toBe(false);
      await respond(http.expectOne('/v1/changes?after=13'), changesBody(14));
      expect(secondFlag.done).toBe(true);
    });

    it('requests the follow-up after the start snapshot when the command applied during it', async () => {
      store.start();
      const snapshot = http.expectOne('/v1/snapshot');
      const result = store.send(completeTask, 'k');
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));

      await respond(snapshot, snapshotBody(12));

      expect(flag.done).toBe(false);
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
      expect(flag.done).toBe(true);
    });

    it('resolves a command that is Applied after a failed snapshot only after the next snapshot settles', async () => {
      store.start();
      await respond(http.expectOne('/v1/snapshot'), null, 503);
      const result = store.send(completeTask, 'k');
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));

      expect(flag.done).toBe(false);
      await respond(http.expectOne('/v1/snapshot'), snapshotBody(13, { tasks: [aTask('t1')] }));
      expect(flag.done).toBe(true);
      expect(store.state()?.tasks.map((task) => task.id)).toEqual(['t1']);
    });

    describe('410 ChangesExpired', () => {
      it('resolves only after the reloaded snapshot settled', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        const flag = track(result);
        await respond(http.expectOne('/v1/commands'), applied(13));

        await respond(http.expectOne('/v1/changes?after=12'), expired(12), 410);

        expect(flag.done).toBe(false);
        const snapshot = http.expectOne('/v1/snapshot');
        await respond(snapshot, snapshotBody(40, { tasks: [aTask('t1')] }));
        expect(flag.done).toBe(true);
        expect(store.state()?.tasks.map((task) => task.id)).toEqual(['t1']);
        expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
      });

      it('resolves when the reloaded snapshot fails too', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        const flag = track(result);
        await respond(http.expectOne('/v1/commands'), applied(13));
        await respond(http.expectOne('/v1/changes?after=12'), expired(12), 410);
        expect(flag.done).toBe(false);

        await respond(http.expectOne('/v1/snapshot'), null, 503);

        expect(flag.done).toBe(true);
        expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
        expect(store.awaitingSync()).toEqual(new Set(['t1']));
      });
    });

    describe('awaitingSync', () => {
      it('starts empty', () => {
        expect(store.awaitingSync().size).toBe(0);
      });

      it.each(commandsOf)(
        'holds the subject of a $name whose follow-up failed, until the next successful poll',
        async ({ command, subject }) => {
          await begin(12);
          const result = store.send(command, 'k');
          const flag = track(result);
          await respond(http.expectOne('/v1/commands'), applied(13));

          await respond(http.expectOne('/v1/changes?after=12'), null, 503);

          expect(flag.done).toBe(true);
          expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
          expect(store.awaitingSync()).toEqual(new Set([subject]));
          await advance(POLL_INTERVAL_MS);
          await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
          expect(store.awaitingSync().size).toBe(0);
        },
      );

      it('holds the subject when the follow-up failed with a network error', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        const flag = track(result);
        await respond(http.expectOne('/v1/commands'), applied(13));

        await networkError(http.expectOne('/v1/changes?after=12'));

        expect(flag.done).toBe(true);
        expect(store.awaitingSync()).toEqual(new Set(['t1']));
      });

      it('holds the subject of a NotApplicable outcome whose follow-up failed', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        await respond(http.expectOne('/v1/commands'), {
          _tag: 'NotApplicable',
          reason: 'expectation_failed',
          reviewItemId: 'r9',
        });

        await respond(http.expectOne('/v1/changes?after=12'), null, 503);

        expect(await result).toMatchObject({ _tag: CommandOutcomeTag.NotApplicable });
        expect(store.awaitingSync()).toEqual(new Set(['t1']));
      });

      it('holds a 410 with another tag as a failure', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        await respond(http.expectOne('/v1/commands'), applied(13));

        await respond(http.expectOne('/v1/changes?after=12'), { _tag: 'Other' }, 410);

        await result;
        expect(store.awaitingSync()).toEqual(new Set(['t1']));
      });

      it('holds every subject whose command waited for the same failing follow-up', async () => {
        await begin(12);
        await advance(POLL_INTERVAL_MS);
        const inFlight = http.expectOne('/v1/changes?after=12');
        const first = store.send(completeTask, 'k1');
        const second = store.send({ _tag: CommandTag.RemoveBlocker, linkId: 'l1' }, 'k2');
        const [firstReq, secondReq] = http.match('/v1/commands');
        await respond(firstReq, applied(13));
        await respond(secondReq, applied(14));
        await respond(inFlight, changesBody(12));

        await respond(http.expectOne('/v1/changes?after=12'), null, 503);

        await Promise.all([first, second]);
        expect(store.awaitingSync()).toEqual(new Set(['t1', 'l1']));
      });

      it('is a new object on every change and keeps the same one when nothing changes', async () => {
        await begin(12);
        const empty = store.awaitingSync();
        const result = store.send(completeTask, 'k');
        await respond(http.expectOne('/v1/commands'), applied(13));
        await respond(http.expectOne('/v1/changes?after=12'), null, 503);
        await result;
        const holding = store.awaitingSync();
        expect(holding).not.toBe(empty);

        await advance(POLL_INTERVAL_MS);
        await respond(http.expectOne('/v1/changes?after=12'), changesBody(12));
        const cleared = store.awaitingSync();
        expect(cleared).not.toBe(holding);
        expect(holding).toEqual(new Set(['t1']));

        await advance(POLL_INTERVAL_MS);
        await respond(http.expectOne('/v1/changes?after=12'), changesBody(12));
        expect(store.awaitingSync()).toBe(cleared);
      });

      it('is emptied by a successful snapshot', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        await respond(http.expectOne('/v1/commands'), applied(13));
        await respond(http.expectOne('/v1/changes?after=12'), null, 503);
        await result;
        expect(store.awaitingSync().size).toBe(1);
        await advance(POLL_INTERVAL_MS);
        await respond(http.expectOne('/v1/changes?after=12'), expired(12), 410);

        await respond(http.expectOne('/v1/snapshot'), snapshotBody(40));

        expect(store.awaitingSync().size).toBe(0);
      });

      it('is emptied before a waiter of the successful settle resolves', async () => {
        await begin(12);
        const first = store.send(completeTask, 'k1');
        await respond(http.expectOne('/v1/commands'), applied(13));
        await respond(http.expectOne('/v1/changes?after=12'), null, 503);
        await first;
        expect(store.awaitingSync().size).toBe(1);
        const second = store.send({ _tag: CommandTag.RemoveBlocker, linkId: 'l1' }, 'k2');
        let seen: ReadonlySet<string> | null = null;
        void second.then(() => {
          seen = store.awaitingSync();
        });
        await respond(http.expectOne('/v1/commands'), applied(14));

        await respond(http.expectOne('/v1/changes?after=12'), changesBody(14));

        expect(seen).toEqual(new Set());
      });

      it('is emptied by stop', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        await respond(http.expectOne('/v1/commands'), applied(13));
        await respond(http.expectOne('/v1/changes?after=12'), null, 503);
        await result;
        expect(store.awaitingSync().size).toBe(1);

        store.stop();

        expect(store.awaitingSync().size).toBe(0);
      });
    });

    describe('401 Unauthorized', () => {
      it('resolves a waiting send and holds its subject when the request already in flight is unauthorized', async () => {
        await begin(12);
        await advance(POLL_INTERVAL_MS);
        const inFlight = http.expectOne('/v1/changes?after=12');
        const result = store.send(completeTask, 'k');
        const flag = track(result);
        await respond(http.expectOne('/v1/commands'), applied(13));
        expect(flag.done).toBe(false);

        await respond(inFlight, unauthorized, 401);

        expect(flag.done).toBe(true);
        expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
        expect(store.awaitingSync()).toEqual(new Set(['t1']));
        noRequests();
        await advance(POLL_INTERVAL_MS * 4);
        noRequests();
      });

      it('resolves a waiting send and holds its subject when its own follow-up is unauthorized', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        const flag = track(result);
        await respond(http.expectOne('/v1/commands'), applied(13));

        await respond(http.expectOne('/v1/changes?after=12'), unauthorized, 401);

        expect(flag.done).toBe(true);
        expect(store.awaitingSync()).toEqual(new Set(['t1']));
      });
    });

    describe('stop while waiting', () => {
      it('resolves the waiting send at once with its outcome and holds nothing', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        const flag = track(result);
        await respond(http.expectOne('/v1/commands'), applied(13));
        const poll = http.expectOne('/v1/changes?after=12');
        expect(flag.done).toBe(false);

        store.stop();
        await advance(0);

        expect(flag.done).toBe(true);
        expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
        expect(store.awaitingSync().size).toBe(0);
        await respond(poll, changesBody(13));
        expect(store.awaitingSync().size).toBe(0);
        noRequests();
      });
    });

    describe('without a follow-up', () => {
      it('resolves at once, with no request, on a generation change between post and response', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        const flag = track(result);
        const req = http.expectOne('/v1/commands');
        store.stop();
        store.start();
        http.expectOne('/v1/snapshot');

        await respond(req, applied(13));

        expect(flag.done).toBe(true);
        expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
        noRequests();
      });

      it('resolves at once, with no request, when the store stopped between post and response', async () => {
        await begin(12);
        const result = store.send(completeTask, 'k');
        const flag = track(result);
        const req = http.expectOne('/v1/commands');
        store.stop();

        await respond(req, applied(13));

        expect(flag.done).toBe(true);
        noRequests();
        expect(store.awaitingSync().size).toBe(0);
      });

      it('resolves a NotApplicable outcome at once before start', async () => {
        const result = store.send(completeTask, 'k');
        const flag = track(result);

        await respond(http.expectOne('/v1/commands'), {
          _tag: 'NotApplicable',
          reason: 'expectation_failed',
          reviewItemId: 'r9',
        });

        expect(flag.done).toBe(true);
        noRequests();
      });
    });
  });

  describe('chooseTimeZone', () => {
    const TOKYO = 'Asia/Tokyo';

    it('waits for the automatic report, posts the chosen zone, keeps the device zone as reported and sends no second report', async () => {
      current.mockReturnValue(LONDON);
      await begin(12);
      const report = http.expectOne('/v1/commands');
      expect(report.request.body).toMatchObject({
        _tag: CommandTag.SetTimeZone,
        timeZone: LONDON,
      });

      const result = store.chooseTimeZone(TOKYO);
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

      const result = store.chooseTimeZone(TOKYO);
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
      const result = store.chooseTimeZone(TOKYO);
      await respond(http.expectOne('/v1/commands'), applied(13));

      await respond(http.expectOne('/v1/changes?after=12'), null, 503);

      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 13 });
      expect(store.awaitingSync()).toEqual(new Set(['settings']));
    });

    it('writes nothing when the device has no zone', async () => {
      await begin(12);

      const result = store.chooseTimeZone(TOKYO);
      await respond(http.expectOne('/v1/commands'), applied(13));
      await respond(http.expectOne('/v1/changes?after=12'), changesBody(13));
      await result;

      expect(set).not.toHaveBeenCalled();
    });

    it('sends no automatic report during it, from a focus, a snapshot or a settings entry', async () => {
      current.mockReturnValue(AMSTERDAM);
      await begin(12);
      const result = store.chooseTimeZone(TOKYO);
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
      const result = store.chooseTimeZone(TOKYO);
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
      const result = store.chooseTimeZone(TOKYO);
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

      const result = store.chooseTimeZone('Mars/Olympus');
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

      const result = store.chooseTimeZone(TOKYO);
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

      const result = store.chooseTimeZone(TOKYO);
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
      const result = store.chooseTimeZone(TOKYO);
      const flag = track(result);
      const chosen = http.expectOne('/v1/commands');

      store.stop();
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
      const result = store.chooseTimeZone(TOKYO);
      const flag = track(result);
      await respond(http.expectOne('/v1/commands'), applied(13));
      const poll = http.expectOne('/v1/changes?after=12');
      set.mockClear();

      store.stop();
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
      const result = store.chooseTimeZone(TOKYO);
      const flag = track(result);
      await advance(0);

      store.stop();
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

  describe('time zone', () => {
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
      store.start();
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
      store.start();

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

  describe('derived values', () => {
    it('counts Inbox tasks and unresolved review items', async () => {
      await begin(12, {
        tasks: [
          aTask('inbox', { important: null }),
          aTask('triaged'),
          aTask('done', { important: null, status: 'done', closedAt: 200 }),
        ],
        reviewItems: [aReviewItem('open'), aReviewItem('resolved', 300)],
      });

      expect(store.inboxCount()).toBe(2);
    });

    it('computes Now from the state and the clock', async () => {
      await begin(12, {
        tasks: [aTask('t1', { due: { date: '2026-10-10' } })],
      });

      expect(store.now()?.ranked.map((ranked) => ranked.task.id)).toEqual(['t1']);
    });

    it('does not throw for a time zone this browser does not know', async () => {
      await begin(12, {
        tasks: [aTask('t2', { due: { date: '2026-10-10' } })],
        settings: settingsOf('Mars/Olympus'),
      });

      expect(store.now()).not.toBeNull();
      expect(store.now()?.ranked.map((ranked) => ranked.task.id)).toEqual(['t2']);
    });
  });
});
