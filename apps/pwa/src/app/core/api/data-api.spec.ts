// SPDX-License-Identifier: EUPL-1.2
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ChangeEntity,
  ChangeOp,
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  type Command,
} from '@asys/domain';

import { CommandOutcomeTag, DataApi } from './data-api';
import { HttpOutcomeTag } from './http-outcome';

const task = {
  id: 't1',
  kind: 'task',
  status: 'open',
  title: 'Write tests',
  notes: '',
  captureText: 'write tests',
  areaId: null,
  availableFrom: null,
  due: null,
  estimateMinutes: null,
  important: null,
  voice: null,
  privacy: null,
  dueMoveCount: 0,
  version: 1,
  createdAt: 100,
  closedAt: null,
};

const area = {
  id: 'a1',
  name: 'Work',
  activeHours: { '1': [[540, 1020]], '2': [], '3': [], '4': [], '5': [], '6': [], '7': [] },
  defaultPrivacy: null,
  version: 1,
};

const link = { id: 'l1', taskId: 't1', blockerId: 't0' };

const reviewItem = {
  id: 'r1',
  kind: 'k',
  subjects: [{ type: 'task', id: 't1' }],
  payload: { anything: true },
  dedupeKey: null,
  createdAt: 100,
  resolvedAt: null,
};

const settings = { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 };

const capture: Command = {
  _tag: CommandTag.CaptureTask,
  taskId: 't1',
  title: 'Write tests',
  captureText: 'write tests',
};

describe('DataApi', () => {
  let api: DataApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(DataApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  describe('snapshot', () => {
    it('requests GET /v1/snapshot and renames blockers to links', async () => {
      const result = api.snapshot();

      const req = http.expectOne({ method: 'GET', url: '/v1/snapshot' });
      req.flush({
        seq: 12,
        tasks: [task],
        blockers: [link],
        areas: [area],
        reviewItems: [reviewItem],
        settings,
      } as object | null);

      expect(await result).toEqual({
        _tag: HttpOutcomeTag.Ok,
        value: {
          seq: 12,
          state: {
            tasks: [task],
            links: [link],
            areas: [area],
            reviewItems: [reviewItem],
            settings,
          },
        },
      });
    });

    it('does not leak the blockers key into the state', async () => {
      const result = api.snapshot();

      http.expectOne('/v1/snapshot').flush({
        seq: 0,
        tasks: [],
        blockers: [],
        areas: [],
        reviewItems: [],
        settings,
      } as object | null);

      const outcome = await result;

      expect(outcome._tag).toBe(HttpOutcomeTag.Ok);
      if (outcome._tag === HttpOutcomeTag.Ok) {
        expect(Object.keys(outcome.value.state).sort()).toEqual([
          'areas',
          'links',
          'reviewItems',
          'settings',
          'tasks',
        ]);
      }
    });

    it.each([
      [401, { _tag: 'Unauthorized' }, 'Unauthorized'],
      [503, null, null],
    ])('turns a %i answer into Failed', async (status, body, errorTag) => {
      const result = api.snapshot();

      http.expectOne('/v1/snapshot').flush(body as object | null, { status, statusText: 'Error' });

      expect(await result).toEqual({ _tag: HttpOutcomeTag.Failed, status, errorTag });
    });

    it('turns a network failure into Failed with status 0', async () => {
      const result = api.snapshot();

      http.expectOne('/v1/snapshot').error(new ProgressEvent('error'), { status: 0 });

      expect(await result).toEqual({ _tag: HttpOutcomeTag.Failed, status: 0, errorTag: null });
    });
  });

  describe('changes', () => {
    it('requests GET /v1/changes?after=12 and returns the entries in order', async () => {
      const entries = [
        { entity: 'task', op: 'put', id: 't1', seq: 13, after: task },
        { entity: 'blocker', op: 'remove', id: 'l1', seq: 14 },
        { entity: 'settings', op: 'put', seq: 15, after: settings },
      ];

      const result = api.changes(12);

      const req = http.expectOne({ method: 'GET', url: '/v1/changes?after=12' });
      req.flush({ seq: 15, entries } as object | null);

      const outcome = await result;

      expect(outcome).toEqual({ _tag: HttpOutcomeTag.Ok, value: { seq: 15, entries } });
      if (outcome._tag === HttpOutcomeTag.Ok) {
        expect(outcome.value.entries.map((entry) => entry.seq)).toEqual([13, 14, 15]);
        expect(outcome.value.entries[1]).toMatchObject({
          entity: ChangeEntity.Blocker,
          op: ChangeOp.Remove,
        });
      }
    });

    it('sends after=0 for an empty cursor', async () => {
      const result = api.changes(0);

      http.expectOne('/v1/changes?after=0').flush({ seq: 0, entries: [] } as object | null);

      expect(await result).toEqual({
        _tag: HttpOutcomeTag.Ok,
        value: { seq: 0, entries: [] },
      });
    });

    it('turns 410 ChangesExpired into Failed with the tag', async () => {
      const result = api.changes(3);

      http.expectOne('/v1/changes?after=3').flush({ _tag: 'ChangesExpired' } as object | null, {
        status: 410,
        statusText: 'Gone',
      });

      expect(await result).toEqual({
        _tag: HttpOutcomeTag.Failed,
        status: 410,
        errorTag: 'ChangesExpired',
      });
    });

    it('turns a network failure into Failed with status 0', async () => {
      const result = api.changes(3);

      http.expectOne('/v1/changes?after=3').error(new ProgressEvent('error'), { status: 0 });

      expect(await result).toEqual({ _tag: HttpOutcomeTag.Failed, status: 0, errorTag: null });
    });

    it('turns a 401 into Failed with the Unauthorized tag', async () => {
      const result = api.changes(3);

      http.expectOne('/v1/changes?after=3').flush({ _tag: 'Unauthorized' } as object | null, {
        status: 401,
        statusText: 'Unauthorized',
      });

      expect(await result).toEqual({
        _tag: HttpOutcomeTag.Failed,
        status: 401,
        errorTag: 'Unauthorized',
      });
    });
  });

  describe('runCommand', () => {
    it('posts the command with the idempotency key merged into the body', async () => {
      const result = api.runCommand(capture, 'key-1');

      const req = http.expectOne({ method: 'POST', url: '/v1/commands' });
      expect(req.request.body).toEqual({ ...capture, idempotencyKey: 'key-1' });
      req.flush({ _tag: 'Applied', seq: 7 } as object | null);

      await result;
    });

    it('maps 200 Applied', async () => {
      const result = api.runCommand(capture, 'key-1');

      http.expectOne('/v1/commands').flush({ _tag: 'Applied', seq: 7 } as object | null);

      expect(await result).toEqual({ _tag: CommandOutcomeTag.Applied, seq: 7 });
    });

    it('maps 200 NotApplicable to the domain reason', async () => {
      const result = api.runCommand(capture, 'key-1');

      http.expectOne('/v1/commands').flush({
        _tag: 'NotApplicable',
        reason: 'expectation_failed',
        reviewItemId: 'r9',
      } as object | null);

      expect(await result).toEqual({
        _tag: CommandOutcomeTag.NotApplicable,
        reason: NotApplicableReason.ExpectationFailed,
        reviewItemId: 'r9',
      });
    });

    it('maps 422 CommandRejected to the domain reason', async () => {
      const result = api.runCommand(capture, 'key-1');

      http
        .expectOne('/v1/commands')
        .flush({ _tag: 'CommandRejected', reason: 'invalid_title' } as object | null, {
          status: 422,
          statusText: 'Unprocessable Entity',
        });

      expect(await result).toEqual({
        _tag: CommandOutcomeTag.Rejected,
        reason: RejectedReason.InvalidTitle,
      });
    });

    it('maps 409 IdempotencyKeyReused to KeyReused', async () => {
      const result = api.runCommand(capture, 'key-1');

      http.expectOne('/v1/commands').flush({ _tag: 'IdempotencyKeyReused' } as object | null, {
        status: 409,
        statusText: 'Conflict',
      });

      expect(await result).toEqual({ _tag: CommandOutcomeTag.KeyReused });
    });

    it('maps 401 Unauthorized to SignedOut', async () => {
      const result = api.runCommand(capture, 'key-1');

      http.expectOne('/v1/commands').flush({ _tag: 'Unauthorized' } as object | null, {
        status: 401,
        statusText: 'Unauthorized',
      });

      expect(await result).toEqual({ _tag: CommandOutcomeTag.SignedOut });
    });

    it('maps a network failure to Failed with status 0', async () => {
      const result = api.runCommand(capture, 'key-1');

      http.expectOne('/v1/commands').error(new ProgressEvent('error'), { status: 0 });

      expect(await result).toEqual({ _tag: CommandOutcomeTag.Failed, status: 0 });
    });

    it.each([400, 403, 404, 413, 429, 500, 503])(
      'maps a body-less %i to Failed with that status',
      async (status) => {
        const result = api.runCommand(capture, 'key-1');

        http.expectOne('/v1/commands').flush(null, { status, statusText: 'Error' });

        expect(await result).toEqual({ _tag: CommandOutcomeTag.Failed, status });
      },
    );

    it.each([
      [422, { _tag: 'SomethingElse' }],
      [422, null],
      [409, { _tag: 'SomethingElse' }],
      [409, null],
      [401, { _tag: 'SomethingElse' }],
      [401, null],
    ])('maps a %i with body %j and no known tag to Failed', async (status, body) => {
      const result = api.runCommand(capture, 'key-1');

      http.expectOne('/v1/commands').flush(body as object | null, { status, statusText: 'Error' });

      expect(await result).toEqual({ _tag: CommandOutcomeTag.Failed, status });
    });

    it('never rejects', async () => {
      const result = api.runCommand(capture, 'key-1');

      http.expectOne('/v1/commands').error(new ProgressEvent('error'), { status: 0 });

      await expect(result).resolves.toBeDefined();
    });
  });

  it('keeps no state between calls', async () => {
    const first = api.snapshot();
    http.expectOne('/v1/snapshot').flush(null, { status: 503, statusText: 'Unavailable' });
    await first;

    const second = api.snapshot();
    http.expectOne('/v1/snapshot').flush({
      seq: 1,
      tasks: [],
      blockers: [],
      areas: [],
      reviewItems: [],
      settings,
    } as object | null);

    expect((await second)._tag).toBe(HttpOutcomeTag.Ok);
  });
});
