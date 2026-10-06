// SPDX-License-Identifier: EUPL-1.2
import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By, Title } from '@angular/platform-browser';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { Instant } from '@asys/domain';

import { routes } from './app.routes';
import { Session, SessionState } from './core/auth/session';
import { DataStore, SyncStatus } from './core/data/data-store';
import { Clock } from './core/platform/clock';
import { DeviceZone } from './core/platform/device-zone';
import { Ids } from './core/platform/ids';
import { routeMotion } from './core/platform/view-transitions';
import { AreaEditor } from './features/areas/area-editor';
import { AreaEditorRoute } from './features/areas/area-editor-route';
import { TaskEditor } from './features/task/task-editor';
import { TaskEditorRoute } from './features/task/task-editor-route';
import { ShellLayout } from './layout/shell-layout';

const NOW = Date.parse('2026-10-03T08:05:00Z') as Instant;

const setup = async () => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      {
        provide: Session,
        useValue: {
          state: signal(SessionState.SignedIn),
          me: signal(null),
          check: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
      },
      {
        provide: DataStore,
        useValue: {
          state: signal(null),
          status: signal(SyncStatus.Loading),
          syncedAt: signal(null),
          now: signal(null),
          inboxCount: signal(0),
          awaitingSync: signal(new Set()),
          send: vi.fn(),
          refresh: vi.fn(),
          chooseTimeZone: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        },
      },
      { provide: DeviceZone, useValue: { current: () => 'Europe/Amsterdam' } },
      { provide: Clock, useValue: { now: signal(NOW) } },
      { provide: Ids, useValue: { next: () => 'id' } },
    ],
  });

  const harness = await RouterTestingHarness.create();
  const title = TestBed.inject(Title);
  const query = <C>(type: Type<C>): C | null =>
    harness.fixture.debugElement.query(By.directive(type))?.componentInstance ?? null;

  return { harness, title, query };
};

describe('routes', () => {
  describe('titles', () => {
    it.each([
      ['/now', 'Now · ASYS'],
      ['/today', 'Today · ASYS'],
      ['/inbox', 'Inbox · ASYS'],
      ['/capture', 'Capture · ASYS'],
      ['/tasks/abc', 'Task · ASYS'],
      ['/settings', 'Settings · ASYS'],
      ['/settings/areas', 'Areas · ASYS'],
      ['/settings/areas/new', 'New Area · ASYS'],
      ['/settings/areas/abc', 'Area · ASYS'],
    ])('%s is titled %s', async (url, expected) => {
      const { harness, title } = await setup();

      await harness.navigateByUrl(url);

      expect(title.getTitle()).toBe(expected);
    });
  });

  describe('levels', () => {
    it('gives every ShellLayout child a numeric level', () => {
      const shell = routes.find((route) => route.component === ShellLayout);
      const children = shell?.children ?? [];

      const unlevelled = children.filter((child) => typeof child.data?.['level'] !== 'number');

      expect(shell).toBeDefined();
      expect(unlevelled.map((child) => child.path)).toEqual([]);
      expect(
        Object.fromEntries(children.map((child) => [child.path, child.data?.['level']])),
      ).toStrictEqual({
        now: 0,
        today: 0,
        inbox: 0,
        capture: 0,
        'tasks/:taskId': 1,
        settings: 1,
        'settings/areas': 2,
        'settings/areas/new': 3,
        'settings/areas/:areaId': 3,
        account: 2,
      });
    });

    it.each([
      ['/now', 0],
      ['/today', 0],
      ['/inbox', 0],
      ['/capture', 0],
      ['/tasks/abc', 1],
      ['/settings', 1],
      ['/settings/areas', 2],
      ['/settings/areas/new', 3],
      ['/settings/areas/abc', 3],
      ['/account', 2],
    ])('%s is at level %i', async (url, level) => {
      const { harness } = await setup();

      await harness.navigateByUrl(url);

      expect(routeMotion(TestBed.inject(Router).routerState.snapshot.root)).toMatchObject({
        path: url,
        level,
      });
    });
  });

  describe('settings/areas/new and settings/areas/:areaId', () => {
    it('matches /settings/areas/new as a new Area, not as an Area with the id "new"', async () => {
      const { harness, query } = await setup();

      await harness.navigateByUrl('/settings/areas/new');

      expect(query(AreaEditorRoute)).not.toBeNull();
      expect(query(AreaEditor)?.areaId()).toBeNull();
    });

    it('matches /settings/areas/:areaId with that id', async () => {
      const { harness, query } = await setup();

      await harness.navigateByUrl('/settings/areas/area-7');

      expect(query(AreaEditor)?.areaId()).toBe('area-7');
    });
  });

  describe('keyed recreation', () => {
    it('binds the task id from the route to the Task editor', async () => {
      const { harness, query } = await setup();

      await harness.navigateByUrl('/tasks/A');

      expect(query(TaskEditor)?.taskId()).toBe('A');
    });

    it('keeps the route component but recreates the Task editor when the task id changes', async () => {
      const { harness, query } = await setup();

      await harness.navigateByUrl('/tasks/A');
      const route = query(TaskEditorRoute);
      const editor = query(TaskEditor);

      await harness.navigateByUrl('/tasks/B');

      expect(query(TaskEditorRoute)).toBe(route);
      expect(query(TaskEditor)).not.toBe(editor);
      expect(query(TaskEditor)?.taskId()).toBe('B');
    });

    it('keeps the Task editor when only the query changes', async () => {
      const { harness, query } = await setup();

      await harness.navigateByUrl('/tasks/A');
      const editor = query(TaskEditor);

      await harness.navigateByUrl('/tasks/A?x=1');

      expect(editor).not.toBeNull();
      expect(query(TaskEditor)).toBe(editor);
    });

    it('keeps the route component but recreates the Area editor when the area id changes', async () => {
      const { harness, query } = await setup();

      await harness.navigateByUrl('/settings/areas/A');
      const route = query(AreaEditorRoute);
      const editor = query(AreaEditor);

      await harness.navigateByUrl('/settings/areas/B');

      expect(query(AreaEditorRoute)).toBe(route);
      expect(query(AreaEditor)).not.toBe(editor);
      expect(query(AreaEditor)?.areaId()).toBe('B');
    });

    it('keeps the Area editor when only the query changes', async () => {
      const { harness, query } = await setup();

      await harness.navigateByUrl('/settings/areas/A');
      const editor = query(AreaEditor);

      await harness.navigateByUrl('/settings/areas/A?x=1');

      expect(editor).not.toBeNull();
      expect(query(AreaEditor)).toBe(editor);
    });
  });
});
