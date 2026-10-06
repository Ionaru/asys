// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { DataStore } from '../data/data-store';
import { Motion } from './motion';
import { TaskMorph } from './task-morph';
import {
  TransitionKind,
  onViewTransitionCreated,
  routeMotion,
  transitionKind,
} from './view-transitions';
import type { RouteMotion } from './view-transitions';

@Component({ template: '' })
class Page {}

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Frame {}

const testRoutes: Routes = [
  { path: 'signin', component: Page },
  {
    path: '',
    component: Frame,
    children: [
      { path: 'now', component: Page, data: { level: 0 } },
      { path: 'today', component: Page, data: { level: 0 } },
      { path: 'inbox', component: Page, data: { level: 0 } },
      { path: 'capture', component: Page, data: { level: 0 } },
      { path: 'tasks/:taskId', component: Page, data: { level: 1 } },
      { path: 'settings', component: Page, data: { level: 1 } },
      { path: 'settings/areas/:areaId', component: Page, data: { level: 3 } },
    ],
  },
];

const NOW: RouteMotion = { path: '/now', level: 0, tab: 0, taskId: null };
const TODAY: RouteMotion = { path: '/today', level: 0, tab: 1, taskId: null };
const INBOX: RouteMotion = { path: '/inbox', level: 0, tab: 2, taskId: null };
const CAPTURE: RouteMotion = { path: '/capture', level: 0, tab: null, taskId: null };
const TASK_ABC: RouteMotion = { path: '/tasks/abc', level: 1, tab: null, taskId: 'abc' };
const TASK_DEF: RouteMotion = { path: '/tasks/def', level: 1, tab: null, taskId: 'def' };
const SETTINGS: RouteMotion = { path: '/settings', level: 1, tab: null, taskId: null };
const AREAS: RouteMotion = { path: '/settings/areas', level: 2, tab: null, taskId: null };
const AREA_NEW: RouteMotion = { path: '/settings/areas/new', level: 3, tab: null, taskId: null };
const AREA_ABC: RouteMotion = { path: '/settings/areas/abc', level: 3, tab: null, taskId: null };
const ACCOUNT: RouteMotion = { path: '/account', level: 2, tab: null, taskId: null };
const SIGNIN: RouteMotion = { path: '/signin', level: null, tab: null, taskId: null };
const RECOVERED: RouteMotion = { path: '/recovered', level: null, tab: null, taskId: null };

type MatrixRow = [string, RouteMotion, RouteMotion, TransitionKind];

const row = (rule: number, from: RouteMotion, to: RouteMotion, kind: TransitionKind): MatrixRow => [
  `rule ${rule}: ${from.path} to ${to.path} is ${kind}`,
  from,
  to,
  kind,
];

const MATRIX: MatrixRow[] = [
  row(1, CAPTURE, CAPTURE, TransitionKind.None),
  row(1, NOW, NOW, TransitionKind.None),
  row(2, SIGNIN, NOW, TransitionKind.None),
  row(2, ACCOUNT, SIGNIN, TransitionKind.None),
  row(2, RECOVERED, NOW, TransitionKind.None),
  row(3, NOW, TASK_ABC, TransitionKind.Push),
  row(3, INBOX, TASK_ABC, TransitionKind.Push),
  row(3, TODAY, SETTINGS, TransitionKind.Push),
  row(3, CAPTURE, SETTINGS, TransitionKind.Push),
  row(3, SETTINGS, AREAS, TransitionKind.Push),
  row(3, SETTINGS, ACCOUNT, TransitionKind.Push),
  row(3, AREAS, AREA_NEW, TransitionKind.Push),
  row(3, AREAS, AREA_ABC, TransitionKind.Push),
  row(3, TASK_ABC, NOW, TransitionKind.Pop),
  row(3, TASK_ABC, INBOX, TransitionKind.Pop),
  row(3, SETTINGS, TODAY, TransitionKind.Pop),
  row(3, ACCOUNT, SETTINGS, TransitionKind.Pop),
  row(3, AREA_ABC, AREAS, TransitionKind.Pop),
  row(3, AREA_NEW, NOW, TransitionKind.Pop),
  row(4, NOW, TODAY, TransitionKind.TabForward),
  row(4, NOW, INBOX, TransitionKind.TabForward),
  row(4, TODAY, INBOX, TransitionKind.TabForward),
  row(4, INBOX, TODAY, TransitionKind.TabBack),
  row(4, INBOX, NOW, TransitionKind.TabBack),
  row(4, TODAY, NOW, TransitionKind.TabBack),
  row(5, NOW, CAPTURE, TransitionKind.Swap),
  row(5, CAPTURE, INBOX, TransitionKind.Swap),
  row(5, TASK_ABC, TASK_DEF, TransitionKind.Swap),
  row(5, TASK_ABC, SETTINGS, TransitionKind.Swap),
  row(5, AREAS, ACCOUNT, TransitionKind.Swap),
  row(5, AREA_NEW, AREA_ABC, TransitionKind.Swap),
];

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}

interface FakeTransition {
  readonly transition: ViewTransition;
  readonly skipTransition: ReturnType<typeof vi.fn<() => void>>;
  readonly finish: () => Promise<void>;
  readonly fail: () => Promise<void>;
}

interface NodeProcess {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
}

interface SetupOptions {
  /** Whether Motion allows animation; defaults to true. */
  readonly allowed?: boolean;
  /** The ids ranked in Now, or null when Now has no result; defaults to ['abc']. */
  readonly ranked?: readonly string[] | null;
}

const defer = (): Deferred => {
  let resolve: () => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const flush = (): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, 0));

const created: FakeTransition[] = [];

const hosts: HTMLElement[] = [];

/** A fake ViewTransition whose `finished` the test settles; afterEach settles whatever is left. */
const createTransition = (): FakeTransition => {
  const finished = defer();
  const skipTransition = vi.fn<() => void>();
  const transition = {
    skipTransition,
    finished: finished.promise,
    ready: Promise.resolve(),
    updateCallbackDone: Promise.resolve(),
    types: new Set<string>(),
  } as unknown as ViewTransition;
  const fake: FakeTransition = {
    transition,
    skipTransition,
    finish: async () => {
      finished.resolve();
      await flush();
    },
    fail: async () => {
      finished.reject(new DOMException('Transition was skipped', 'AbortError'));
      await flush();
    },
  };

  created.push(fake);

  return fake;
};

/** Appends the markup inside one wrapper element of the body; afterEach removes the wrapper. */
const addToBody = (html: string): HTMLElement => {
  const host = document.createElement('div');

  host.innerHTML = html;
  document.body.append(host);
  hosts.push(host);

  return host;
};

const pick = (host: Element, selector: string): HTMLElement => {
  const element = host.querySelector<HTMLElement>(selector);

  if (element === null) {
    throw new Error(`No element matches ${selector}`);
  }

  return element;
};

const pickResult = (ranked: readonly string[] | null) =>
  ranked === null ? null : { ranked: ranked.map((id) => ({ task: { id } })), waiting: [] };

const attribute = (): string | null => document.documentElement.getAttribute('data-transition');

const named = (): Element[] => Array.from(document.querySelectorAll('[data-morph]'));

const expectNamedOnly = (element: Element): void => {
  expect(named()).toHaveLength(1);
  expect(named()[0]).toBe(element);
  expect(element.getAttribute('data-morph')).toBe('');
};

const expectNothingNamed = (): void => {
  expect(named()).toHaveLength(0);
};

const trackUnhandledRejections = () => {
  const nodeProcess = (globalThis as unknown as { process: NodeProcess }).process;
  const reasons: unknown[] = [];
  const listener = (reason: unknown): void => {
    reasons.push(reason);
  };

  nodeProcess.on('unhandledRejection', listener);

  return {
    reasons,
    stop: (): void => {
      nodeProcess.off('unhandledRejection', listener);
    },
  };
};

const setup = async ({ allowed = true, ranked = ['abc'] }: SetupOptions = {}) => {
  const state = { allowed };

  TestBed.configureTestingModule({
    providers: [
      provideRouter(testRoutes),
      {
        provide: Motion,
        useValue: { allowed: () => state.allowed, reduced: signal(false), play: vi.fn() },
      },
      { provide: DataStore, useValue: { now: signal(pickResult(ranked)) } },
    ],
  });

  const harness = await RouterTestingHarness.create();
  const router = TestBed.inject(Router);
  const taskMorph = TestBed.inject(TaskMorph);

  /** The root snapshot after navigating; the caller keeps it before the next navigation. */
  const snapshot = async (url: string): Promise<ActivatedRouteSnapshot> => {
    await harness.navigateByUrl(url);

    return router.routerState.snapshot.root;
  };

  const between = async (fromUrl: string, toUrl: string) => {
    const from = await snapshot(fromUrl);
    const to = await snapshot(toUrl);

    return { from, to };
  };

  const run = (
    fake: FakeTransition,
    from: ActivatedRouteSnapshot,
    to: ActivatedRouteSnapshot,
  ): void => {
    TestBed.runInInjectionContext(() =>
      onViewTransitionCreated({ transition: fake.transition, from, to }),
    );
  };

  const setAllowed = (value: boolean): void => {
    state.allowed = value;
  };

  return { router, taskMorph, snapshot, between, run, setAllowed };
};

describe('TransitionKind', () => {
  it('has the documented values, which the stylesheet matches on', () => {
    expect(TransitionKind.None).toBe('none');
    expect(TransitionKind.TabForward).toBe('tab-forward');
    expect(TransitionKind.TabBack).toBe('tab-back');
    expect(TransitionKind.Push).toBe('push');
    expect(TransitionKind.Pop).toBe('pop');
    expect(TransitionKind.Swap).toBe('swap');
  });
});

describe('routeMotion', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('reads the root before any navigation as unlevelled at the root path', async () => {
    const { router } = await setup();

    expect(routeMotion(router.routerState.snapshot.root)).toStrictEqual({
      path: '/',
      level: null,
      tab: null,
      taskId: null,
    });
  });

  it('reads /now as level 0 on tab 0', async () => {
    const { snapshot } = await setup();

    expect(routeMotion(await snapshot('/now'))).toStrictEqual({
      path: '/now',
      level: 0,
      tab: 0,
      taskId: null,
    });
  });

  it('reads /today as level 0 on tab 1', async () => {
    const { snapshot } = await setup();

    expect(routeMotion(await snapshot('/today'))).toStrictEqual({
      path: '/today',
      level: 0,
      tab: 1,
      taskId: null,
    });
  });

  it('reads /inbox as level 0 on tab 2', async () => {
    const { snapshot } = await setup();

    expect(routeMotion(await snapshot('/inbox'))).toStrictEqual({
      path: '/inbox',
      level: 0,
      tab: 2,
      taskId: null,
    });
  });

  it('reads /capture?text=x as level 0 on no tab, leaving the query out of the path', async () => {
    const { snapshot } = await setup();

    expect(routeMotion(await snapshot('/capture?text=x'))).toStrictEqual({
      path: '/capture',
      level: 0,
      tab: null,
      taskId: null,
    });
  });

  it('reads /tasks/abc as level 1 on no tab, with every url segment in the path and its Task id', async () => {
    const { snapshot } = await setup();

    expect(routeMotion(await snapshot('/tasks/abc'))).toStrictEqual({
      path: '/tasks/abc',
      level: 1,
      tab: null,
      taskId: 'abc',
    });
  });

  it('reads /settings/areas/abc as level 3 on no tab, with every url segment in the path', async () => {
    const { snapshot } = await setup();

    expect(routeMotion(await snapshot('/settings/areas/abc'))).toStrictEqual({
      path: '/settings/areas/abc',
      level: 3,
      tab: null,
      taskId: null,
    });
  });

  it('reads /signin, a leaf without a level, as unlevelled', async () => {
    const { snapshot } = await setup();

    expect(routeMotion(await snapshot('/signin'))).toStrictEqual({
      path: '/signin',
      level: null,
      tab: null,
      taskId: null,
    });
  });
});

describe('transitionKind', () => {
  it.each(MATRIX)('%s', (_name, from, to, expected) => {
    expect(transitionKind(from, to)).toBe(expected);
  });
});

describe('onViewTransitionCreated', () => {
  afterEach(async () => {
    await Promise.all(created.splice(0).map((fake) => fake.finish()));

    for (const host of hosts.splice(0)) {
      host.remove();
    }

    document.documentElement.removeAttribute('data-transition');
    TestBed.resetTestingModule();
  });

  describe('skipping', () => {
    it('skips /now to /now?x=1 once and sets no attribute', async () => {
      const { between, run, taskMorph } = await setup();
      const { from, to } = await between('/now', '/now?x=1');
      const fake = createTransition();

      run(fake, from, to);

      expect(fake.skipTransition).toHaveBeenCalledTimes(1);
      expect(attribute()).toBeNull();
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });

    it('skips /signin to /now once and sets no attribute', async () => {
      const { between, run, taskMorph } = await setup();
      const { from, to } = await between('/signin', '/now');
      const fake = createTransition();

      run(fake, from, to);

      expect(fake.skipTransition).toHaveBeenCalledTimes(1);
      expect(attribute()).toBeNull();
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });

    it('skips /now to /inbox once when motion is not allowed, with no attribute and a null Task id', async () => {
      const { between, run, taskMorph } = await setup({ allowed: false });
      const { from, to } = await between('/now', '/inbox');
      const fake = createTransition();

      run(fake, from, to);

      expect(fake.skipTransition).toHaveBeenCalledTimes(1);
      expect(attribute()).toBeNull();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });

    it('names nothing and leaves the Task id null when motion is not allowed on a Push with a hook in the body', async () => {
      const { between, run, taskMorph } = await setup({ allowed: false });
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const { from, to } = await between('/now', '/tasks/abc');
      const fake = createTransition();

      run(fake, from, to);

      expect(fake.skipTransition).toHaveBeenCalledTimes(1);
      expect(attribute()).toBeNull();
      expect(pick(host, 'h2').hasAttribute('data-morph')).toBe(false);
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });
  });

  describe('the attribute', () => {
    it('sets data-transition to tab-forward for /now to /inbox when allowed, without skipping', async () => {
      const { between, run } = await setup();
      const { from, to } = await between('/now', '/inbox');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('tab-forward');
      expect(fake.skipTransition).not.toHaveBeenCalled();

      await fake.finish();
    });

    it('sets data-transition to tab-back for /inbox to /today', async () => {
      const { between, run } = await setup();
      const { from, to } = await between('/inbox', '/today');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('tab-back');
      expect(fake.skipTransition).not.toHaveBeenCalled();

      await fake.finish();
    });

    it('sets data-transition to swap for /now to /capture', async () => {
      const { between, run } = await setup();
      const { from, to } = await between('/now', '/capture');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('swap');
      expect(fake.skipTransition).not.toHaveBeenCalled();

      await fake.finish();
    });
  });

  describe('the morph on a Push', () => {
    it('names only the live h2 for /now to /tasks/abc, not a leaving span of the same Task before it', async () => {
      const { between, run, taskMorph } = await setup();
      const host = addToBody(
        '<span data-task-id="abc" data-leaving></span><h2 data-task-id="abc"></h2>',
      );
      const { from, to } = await between('/now', '/tasks/abc');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('push');
      expectNamedOnly(pick(host, 'h2'));
      expect(pick(host, 'span').hasAttribute('data-morph')).toBe(false);
      expect(taskMorph.taskId()).toBe('abc');

      await fake.finish();
    });

    it('names only the h2 for /now to /tasks/abc when the earlier span sits inside a leaving li', async () => {
      const { between, run, taskMorph } = await setup();
      const host = addToBody(
        '<li data-leaving><span data-task-id="abc"></span></li><h2 data-task-id="abc"></h2>',
      );
      const { from, to } = await between('/now', '/tasks/abc');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('push');
      expectNamedOnly(pick(host, 'h2'));
      expect(pick(host, 'span').hasAttribute('data-morph')).toBe(false);
      expect(taskMorph.taskId()).toBe('abc');

      await fake.finish();
    });

    it('names nothing and leaves the Task id null for /now to /tasks/abc with no hook in the body', async () => {
      const { between, run, taskMorph } = await setup();
      const { from, to } = await between('/now', '/tasks/abc');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('push');
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });

    it('names only the element of the Task being opened, not a hook of another Task', async () => {
      const { between, run, taskMorph } = await setup();
      const host = addToBody(
        '<h2 data-task-id="def"></h2><h2 id="wanted" data-task-id="abc"></h2>',
      );
      const { from, to } = await between('/now', '/tasks/abc');
      const fake = createTransition();

      run(fake, from, to);

      expectNamedOnly(pick(host, '#wanted'));
      expect(taskMorph.taskId()).toBe('abc');

      await fake.finish();
    });
  });

  describe('the morph on a Pop', () => {
    it('names the h1 and sets the Task id for /tasks/abc to /now while abc is ranked', async () => {
      const { between, run, taskMorph } = await setup({ ranked: ['abc'] });
      const host = addToBody('<h1 data-task-id="abc"></h1>');
      const { from, to } = await between('/tasks/abc', '/now');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('pop');
      expectNamedOnly(pick(host, 'h1'));
      expect(taskMorph.taskId()).toBe('abc');

      await fake.finish();
    });

    it('names nothing and leaves the Task id null for the Done Pop, where abc is no longer ranked', async () => {
      const { between, run, taskMorph } = await setup({ ranked: [] });
      addToBody('<h1 data-task-id="abc"></h1>');
      const { from, to } = await between('/tasks/abc', '/now');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('pop');
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });

    it('names nothing for /tasks/abc to /now when only another Task is ranked', async () => {
      const { between, run, taskMorph } = await setup({ ranked: ['def'] });
      addToBody('<h1 data-task-id="abc"></h1>');
      const { from, to } = await between('/tasks/abc', '/now');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('pop');
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });

    it('names nothing for /tasks/abc to /now when Now has no result yet', async () => {
      const { between, run, taskMorph } = await setup({ ranked: null });
      addToBody('<h1 data-task-id="abc"></h1>');
      const { from, to } = await between('/tasks/abc', '/now');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('pop');
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });

    it('names nothing for /tasks/abc to /inbox even while abc is ranked', async () => {
      const { between, run, taskMorph } = await setup({ ranked: ['abc'] });
      addToBody('<h1 data-task-id="abc"></h1>');
      const { from, to } = await between('/tasks/abc', '/inbox');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('pop');
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });
  });

  describe('the morph on a Swap', () => {
    it('names nothing for /tasks/abc to /tasks/def', async () => {
      const { between, run, taskMorph } = await setup({ ranked: ['abc'] });
      addToBody('<h1 data-task-id="abc"></h1>');
      const { from, to } = await between('/tasks/abc', '/tasks/def');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('swap');
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await fake.finish();
    });
  });

  describe('cleanup', () => {
    it('removes the attribute, the name and the Task id when finished resolves', async () => {
      const { between, run, taskMorph } = await setup();
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const { from, to } = await between('/now', '/tasks/abc');
      const fake = createTransition();

      run(fake, from, to);

      expect(attribute()).toBe('push');
      expectNamedOnly(pick(host, 'h2'));
      expect(taskMorph.taskId()).toBe('abc');

      await fake.finish();

      expect(attribute()).toBeNull();
      expect(pick(host, 'h2').hasAttribute('data-morph')).toBe(false);
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();
    });

    it('does the same cleanup, without an unhandled rejection, when finished rejects', async () => {
      const { between, run, taskMorph } = await setup();
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const { from, to } = await between('/now', '/tasks/abc');
      const fake = createTransition();
      const unhandled = trackUnhandledRejections();

      try {
        run(fake, from, to);

        expect(attribute()).toBe('push');
        expectNamedOnly(pick(host, 'h2'));
        expect(taskMorph.taskId()).toBe('abc');

        await fake.fail();
        await flush();

        expect(attribute()).toBeNull();
        expect(pick(host, 'h2').hasAttribute('data-morph')).toBe(false);
        expectNothingNamed();
        expect(taskMorph.taskId()).toBeNull();
        expect(unhandled.reasons).toEqual([]);
      } finally {
        unhandled.stop();
      }
    });

    it('removes data-morph only from the element it named, not from another element that carries it', async () => {
      const { between, run } = await setup();
      const host = addToBody('<h2 data-task-id="abc"></h2><h1 data-task-id="abc"></h1>');
      const { from, to } = await between('/now', '/tasks/abc');
      const fake = createTransition();

      run(fake, from, to);
      // The new side's TaskMorph binding names the editor title during the transition.
      pick(host, 'h1').setAttribute('data-morph', '');

      expect(pick(host, 'h2').getAttribute('data-morph')).toBe('');
      expect(pick(host, 'h1').getAttribute('data-morph')).toBe('');

      await fake.finish();

      expect(pick(host, 'h2').hasAttribute('data-morph')).toBe(false);
      expect(pick(host, 'h1').getAttribute('data-morph')).toBe('');
    });
  });

  describe('a second navigation that interrupts the first', () => {
    it('lets the second transition take over, so the first one settling late leaves its attribute and state alone', async () => {
      const { snapshot, run, taskMorph } = await setup();
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const nowSnapshot = await snapshot('/now');
      const taskSnapshot = await snapshot('/tasks/abc');
      const inboxSnapshot = await snapshot('/inbox');
      const first = createTransition();
      const second = createTransition();
      const h2 = pick(host, 'h2');

      run(first, nowSnapshot, taskSnapshot);

      expect(attribute()).toBe('push');
      expectNamedOnly(h2);
      expect(taskMorph.taskId()).toBe('abc');

      run(second, taskSnapshot, inboxSnapshot);

      expect(h2.hasAttribute('data-morph')).toBe(false);
      expectNothingNamed();
      expect(attribute()).toBe('pop');
      expect(taskMorph.taskId()).toBeNull();

      await first.finish();

      expect(attribute()).toBe('pop');
      expect(h2.hasAttribute('data-morph')).toBe(false);
      expect(taskMorph.taskId()).toBeNull();
      expect(first.skipTransition).not.toHaveBeenCalled();
      expect(second.skipTransition).not.toHaveBeenCalled();

      await second.finish();

      expect(attribute()).toBeNull();
    });

    it('does the same when the interrupted transition settles by rejecting, as the browser does with an AbortError', async () => {
      const { snapshot, run } = await setup();
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const nowSnapshot = await snapshot('/now');
      const taskSnapshot = await snapshot('/tasks/abc');
      const inboxSnapshot = await snapshot('/inbox');
      const first = createTransition();
      const second = createTransition();
      const unhandled = trackUnhandledRejections();

      try {
        run(first, nowSnapshot, taskSnapshot);
        run(second, taskSnapshot, inboxSnapshot);

        expect(pick(host, 'h2').hasAttribute('data-morph')).toBe(false);
        expect(attribute()).toBe('pop');

        await first.fail();
        await flush();

        expect(attribute()).toBe('pop');

        await second.finish();

        expect(attribute()).toBeNull();
        expect(unhandled.reasons).toEqual([]);
      } finally {
        unhandled.stop();
      }
    });

    it('keeps the second transition own name and Task id when the first one settles late', async () => {
      const { snapshot, run, taskMorph } = await setup({ ranked: ['abc'] });
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const nowSnapshot = await snapshot('/now');
      const taskSnapshot = await snapshot('/tasks/abc');
      const nowAgainSnapshot = await snapshot('/now?again=1');
      const first = createTransition();
      const second = createTransition();
      const h2 = pick(host, 'h2');

      run(first, nowSnapshot, taskSnapshot);

      expectNamedOnly(h2);

      h2.remove();
      host.insertAdjacentHTML('beforeend', '<h1 data-task-id="abc"></h1>');
      const h1 = pick(host, 'h1');

      run(second, taskSnapshot, nowAgainSnapshot);

      expect(attribute()).toBe('pop');
      expectNamedOnly(h1);
      expect(taskMorph.taskId()).toBe('abc');

      await first.finish();

      expect(attribute()).toBe('pop');
      expectNamedOnly(h1);
      expect(taskMorph.taskId()).toBe('abc');

      await second.finish();

      expect(attribute()).toBeNull();
      expect(h1.hasAttribute('data-morph')).toBe(false);
      expect(taskMorph.taskId()).toBeNull();
    });

    it('resets the Task id to null when the second transition finds no element to name', async () => {
      const { snapshot, run, taskMorph } = await setup();
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const nowSnapshot = await snapshot('/now');
      const taskAbcSnapshot = await snapshot('/tasks/abc');
      const taskDefSnapshot = await snapshot('/tasks/def');
      const first = createTransition();
      const second = createTransition();

      run(first, nowSnapshot, taskAbcSnapshot);

      expect(taskMorph.taskId()).toBe('abc');

      run(second, nowSnapshot, taskDefSnapshot);

      expect(attribute()).toBe('push');
      expect(pick(host, 'h2').hasAttribute('data-morph')).toBe(false);
      expectNothingNamed();
      expect(taskMorph.taskId()).toBeNull();

      await first.finish();
      await second.finish();
    });

    it('unnames the partner a TaskMorph binding named when a Push interrupts a Pop', async () => {
      const { snapshot, run, taskMorph } = await setup({ ranked: ['abc', 'def'] });
      const editor = addToBody('<h1 data-task-id="abc"></h1>');
      const taskAbcSnapshot = await snapshot('/tasks/abc');
      const nowSnapshot = await snapshot('/now');
      const taskDefSnapshot = await snapshot('/tasks/def');
      const first = createTransition();
      const second = createTransition();

      run(first, taskAbcSnapshot, nowSnapshot);

      expect(taskMorph.taskId()).toBe('abc');

      // Now replaces the editor, and its binding names the Pop's partner before change detection catches up.
      editor.remove();
      const now = addToBody(
        '<h2 data-task-id="abc" data-morph=""></h2><span data-task-id="def"></span>',
      );

      run(second, nowSnapshot, taskDefSnapshot);

      expect(attribute()).toBe('push');
      expectNamedOnly(pick(now, 'span'));
      expect(pick(now, 'h2').hasAttribute('data-morph')).toBe(false);
      expect(taskMorph.taskId()).toBe('def');

      await first.finish();
      await second.finish();
    });

    it('leaves the first transition state alone when a second /now to /now is skipped, and the first settle removes it', async () => {
      const { snapshot, run, taskMorph } = await setup();
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const nowSnapshot = await snapshot('/now');
      const taskSnapshot = await snapshot('/tasks/abc');
      const nowAgainSnapshot = await snapshot('/now?again=1');
      const first = createTransition();
      const second = createTransition();
      const h2 = pick(host, 'h2');

      run(first, nowSnapshot, taskSnapshot);

      expect(attribute()).toBe('push');
      expectNamedOnly(h2);
      expect(taskMorph.taskId()).toBe('abc');

      run(second, nowSnapshot, nowAgainSnapshot);

      expect(second.skipTransition).toHaveBeenCalledTimes(1);
      expect(first.skipTransition).not.toHaveBeenCalled();
      expect(attribute()).toBe('push');
      expectNamedOnly(h2);
      expect(taskMorph.taskId()).toBe('abc');

      await first.finish();

      expect(attribute()).toBeNull();
      expect(h2.hasAttribute('data-morph')).toBe(false);
      expect(taskMorph.taskId()).toBeNull();

      await second.finish();
    });

    it('leaves the first transition state alone when a second navigation is skipped because motion stopped being allowed', async () => {
      const { snapshot, run, setAllowed, taskMorph } = await setup();
      const host = addToBody('<h2 data-task-id="abc"></h2>');
      const nowSnapshot = await snapshot('/now');
      const taskSnapshot = await snapshot('/tasks/abc');
      const inboxSnapshot = await snapshot('/inbox');
      const first = createTransition();
      const second = createTransition();
      const h2 = pick(host, 'h2');

      run(first, nowSnapshot, taskSnapshot);
      setAllowed(false);
      run(second, taskSnapshot, inboxSnapshot);

      expect(second.skipTransition).toHaveBeenCalledTimes(1);
      expect(attribute()).toBe('push');
      expectNamedOnly(h2);
      expect(taskMorph.taskId()).toBe('abc');

      await first.finish();

      expect(attribute()).toBeNull();
      expect(h2.hasAttribute('data-morph')).toBe(false);
      expect(taskMorph.taskId()).toBeNull();

      await second.finish();
    });
  });
});
