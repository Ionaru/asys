// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { CommandTag, RejectedReason, type Command } from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../core/api/data-api';
import { CaptureQueue } from '../core/data/capture-queue';
import { CommandAttempts } from '../core/data/command-attempts';
import { DataStore } from '../core/data/data-store';
import {
  DoneOrigin,
  DoneUndo,
  PauseReason,
  UNDO_WINDOW_MS,
  type DoneFailure,
  type DoneNotice,
  type DoneUndone,
  type PendingDone,
} from '../core/data/done-undo';
import { Ids } from '../core/platform/ids';
import { Motion } from '../core/platform/motion';
import { TAB_PATHS } from '../core/platform/tabs';
import { ShellLayout } from './shell-layout';

@Component({ template: '' })
class Stub {}

interface NowItem {
  readonly id: string;
  readonly leaving?: boolean;
  readonly linked?: boolean;
}

/** What `NowStub` renders after its h1; a case sets it and `afterEach` resets it. */
const nowItems = signal<readonly NowItem[]>([]);

@Component({
  template: `
    <h1 tabindex="-1">Now</h1>
    @for (item of items(); track item.id) {
      @if (item.leaving) {
        <div data-leaving>
          <span tabindex="-1" [attr.data-task-id]="item.id">{{ item.id }}</span>
        </div>
      } @else if (item.linked) {
        <a [attr.href]="'/tasks/' + item.id"
          ><span tabindex="-1" [attr.data-task-id]="item.id">{{ item.id }}</span></a
        >
      } @else {
        <span tabindex="-1" [attr.data-task-id]="item.id">{{ item.id }}</span>
      }
    }
  `,
})
class NowStub {
  protected readonly items = nowItems;
}

const PENDING: PendingDone = {
  taskId: 'a',
  title: 'Pay the invoice',
  origin: DoneOrigin.Button,
  remainingMs: UNDO_WINDOW_MS,
};

/** The Undo bar's ring duration and delay, set on its host as custom properties. */
const RING_DURATION = '--asys-undo-duration';

const RING_DELAY = '--asys-undo-delay';

/** No delay, however the bar spells a zero: `0ms` or `-0ms`. */
const NO_DELAY = /^-?0ms$/;

const ringStyle = (bar: HTMLElement | null, name: string): string | undefined =>
  bar?.style.getPropertyValue(name).trim();

const NOT_DONE: DoneFailure = {
  taskId: 'a',
  title: 'Pay the invoice',
  message: 'ASYS cannot reach the server. Try again.',
  canRetry: true,
  closedElsewhere: false,
};

const REVIEW_SENTENCE = 'That no longer applied, so it waits in the Inbox as a Review item.';

/** A stand-in for the shell's DoneUndo: writable signals and spies. */
const fakeDoneUndo = () => {
  const pending = signal<PendingDone | null>(null);
  const failure = signal<DoneFailure | null>(null);
  const notice = signal<DoneNotice | null>(null);
  const undone = signal<DoneUndone | null>(null);
  const focusRequest = signal(0);

  return {
    pending,
    failure,
    notice,
    undone,
    focusRequest,
    // The real DoneUndo clears the failure on both; a retry also holds the Task again.
    undo: vi.fn<() => void>(),
    retry: vi.fn<() => void>(() => failure.set(null)),
    dismiss: vi.fn<() => void>(() => failure.set(null)),
    pause: vi.fn<(reason: PauseReason) => void>(),
    resume: vi.fn<(reason: PauseReason) => void>(),
    requestFocus: vi.fn<() => void>(),
    flush: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    complete: vi.fn<() => void>(),
  };
};

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

/** A pointer press: `HTMLElement.click()` has `detail` 0, which reads as a keyboard activation. */
const pointerClick = (element: HTMLElement | undefined): void => {
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
};

/** The two ways a click reaches Capture: a pointer press (`detail` 1) and a keyboard activation (`detail` 0). */
const ACTIVATIONS: [string, (element: HTMLElement | undefined) => void][] = [
  ['a pointer press', pointerClick],
  ['a keyboard activation', (element) => element?.click()],
];

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const deferred = <V>() => {
  let resolve: (value: V) => void = () => undefined;
  const promise = new Promise<V>((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

interface SetupOptions {
  readonly motion?: Partial<Motion>;
}

const setup = async (url = '/now', { motion }: SetupOptions = {}) => {
  let counter = 0;
  const doneUndo = fakeDoneUndo();
  const send = vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>();
  // `state` is null until the store has loaded; the shell hands the nav null for the count then.
  const dataStore = { state: signal<object | null>({}), inboxCount: signal(0), send };

  send.mockResolvedValue(APPLIED);

  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [
          {
            path: '',
            component: ShellLayout,
            children: [
              { path: 'now', component: NowStub },
              { path: 'today', component: Stub },
              { path: 'inbox', component: Stub },
              { path: 'tasks/:taskId', component: Stub },
              { path: 'settings', component: Stub },
            ],
          },
        ],
        withComponentInputBinding(),
      ),
      { provide: DataStore, useValue: dataStore },
      ...(motion === undefined ? [] : [{ provide: Motion, useValue: motion }]),
      {
        provide: Ids,
        useValue: {
          next: () => {
            counter += 1;

            return `id-${counter}`;
          },
        },
      },
    ],
  });

  // TestBed.overrideProvider does not reach the component-level provider, so the shell's own
  // provider list is replaced with the fake in place of the real DoneUndo.
  TestBed.overrideComponent(ShellLayout, {
    set: {
      providers: [CommandAttempts, CaptureQueue, { provide: DoneUndo, useValue: doneUndo }],
    },
  });

  const harness = await RouterTestingHarness.create();
  const fixture = harness.fixture;

  document.body.appendChild(fixture.nativeElement);

  const root = (): HTMLElement => fixture.nativeElement;

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 3; round += 1) {
      TestBed.tick();
      await fixture.whenStable();
      await new Promise<void>((resolve) => setTimeout(resolve));
    }

    fixture.detectChanges();
  };

  const go = async (to: string): Promise<void> => {
    await harness.navigateByUrl(to);
    await settle();
  };

  const nav = (): HTMLElement | null => root().querySelector('nav[aria-label="Primary"]');
  /** Capture, found where the contract puts it: inside the Primary nav. */
  const capture = (): HTMLButtonElement | null =>
    root().querySelector('nav[aria-label="Primary"] button.asys-capture');
  /** Every Capture button anywhere in the shell, however it got there. */
  const captures = (): HTMLButtonElement[] =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('button.asys-capture'));
  const page = (): HTMLElement | null => root().querySelector('main');
  const bar = (): HTMLElement | null => root().querySelector('asys-quick-add');
  const input = (): HTMLInputElement | null => root().querySelector('.asys-quickadd__input');
  const status = (): string | null =>
    root().querySelector('.asys-quickadd__status')?.textContent?.trim() ?? null;
  const addButton = (): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.asys-quickadd button')).find(
      (b) => b.textContent?.trim() === 'Add',
    );
  const failures = (): HTMLElement[] =>
    Array.from(root().querySelectorAll<HTMLElement>('.asys-quickadd__failure'));
  const failureText = (row: HTMLElement | undefined): string | null =>
    row?.querySelector('.asys-quickadd__failure-text')?.textContent?.trim() ?? null;
  const rowButton = (row: HTMLElement | undefined, label: string): HTMLButtonElement | undefined =>
    Array.from(row?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (b) => b.textContent?.trim() === label,
    );
  const badge = (): string | null =>
    capture()?.querySelector('.asys-capture__count')?.firstChild?.textContent?.trim() ?? null;
  /** The accessible name of Capture: its text, whitespace collapsed. */
  const captureName = (): string | null =>
    capture()?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const closeButton = (): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.asys-quickadd button')).find(
      (b) => b.textContent?.trim() === 'Close',
    );

  const open = async (): Promise<void> => {
    capture()?.click();
    await settle();
  };

  const type = async (text: string): Promise<void> => {
    const field = input();

    if (field !== null) {
      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await settle();
  };

  const submit = async (): Promise<void> => {
    root()
      .querySelector('.asys-quickadd')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };

  const escape = async (): Promise<void> => {
    input()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
  };

  const undoBar = (): HTMLElement | null => root().querySelector('asys-undo-bar');
  const undoButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(undoBar()?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (b) => b.textContent?.trim() === label,
    );
  const statusRegion = (): HTMLElement | null =>
    root().querySelector<HTMLElement>('p.shell__status');
  const shellHost = (): HTMLElement | null => root().querySelector('app-shell-layout');
  const pressEscapeInBar = async (): Promise<void> => {
    undoButton('Undo')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await settle();
  };

  await go(url);

  const inboxBadge = (): string | null =>
    root().querySelector('.asys-bottomnav__badge')?.textContent?.trim() ?? null;

  return {
    fixture,
    dataStore,
    inboxBadge,
    doneUndo,
    undoBar,
    undoButton,
    statusRegion,
    shellHost,
    pressEscapeInBar,
    send,
    root,
    settle,
    go,
    capture,
    captures,
    nav,
    page,
    captureName,
    bar,
    input,
    status,
    addButton,
    failures,
    failureText,
    rowButton,
    badge,
    closeButton,
    open,
    type,
    submit,
    escape,
  };
};

const captureCommand = (taskId: string, title: string): Command => ({
  _tag: CommandTag.CaptureTask,
  taskId,
  title,
  captureText: title,
});

const VIEWPORT_KEY = 'visualViewport';

/** Stubs `visualViewport` on the global and on the document's own window, whichever the shell reads. */
const stubViewport = (box: { height: number } | undefined): void => {
  const value =
    box === undefined ? undefined : { offsetLeft: 0, offsetTop: 0, width: 412, height: box.height };

  vi.stubGlobal(VIEWPORT_KEY, value);

  const view = document.defaultView;

  if (view !== null && view !== (globalThis as unknown)) {
    Object.defineProperty(view, VIEWPORT_KEY, { value, configurable: true, writable: true });
  }
};

const OBSERVER_KEY = 'ResizeObserver';

interface ObserverInstance {
  readonly observed: Element[];
  readonly disconnect: ReturnType<typeof vi.fn>;
  /** Reports a border box of `blockSize` for `target`, as the browser does after a resize. */
  readonly fire: (target: Element, blockSize: number) => void;
}

/**
 * Stubs `ResizeObserver` on the global and on the document's own window, whichever the shell
 * reads. With `immediate` (the default) every observed target reports a 64px border box at once;
 * without it, nothing is reported until a case calls `fire`.
 */
const stubResizeObserver = (present: boolean, immediate = true): ObserverInstance[] => {
  const instances: ObserverInstance[] = [];

  class FakeResizeObserver {
    readonly observed: Element[] = [];

    readonly disconnect = vi.fn();

    readonly #callback: (entries: unknown[], observer: unknown) => void;

    constructor(callback: (entries: unknown[], observer: unknown) => void) {
      this.#callback = callback;
      instances.push(this);
    }

    observe(target: Element): void {
      this.observed.push(target);

      if (immediate) {
        this.fire(target, 64);
      }
    }

    fire(target: Element, blockSize: number): void {
      this.#callback(
        [
          {
            target,
            borderBoxSize: [{ blockSize, inlineSize: 412 }],
            contentRect: { height: blockSize },
          },
        ],
        this,
      );
    }

    unobserve(): void {
      // Unused.
    }
  }

  const value = present ? FakeResizeObserver : undefined;

  vi.stubGlobal(OBSERVER_KEY, value);

  const view = document.defaultView;

  if (view !== null && view !== (globalThis as unknown)) {
    Object.defineProperty(view, OBSERVER_KEY, { value, configurable: true, writable: true });
  }

  return instances;
};

afterEach(() => {
  document.body.innerHTML = '';
  nowItems.set([]);
  vi.unstubAllGlobals();

  const view = document.defaultView;

  if (view !== null) {
    Reflect.deleteProperty(view, VIEWPORT_KEY);
    Reflect.deleteProperty(view, OBSERVER_KEY);
  }
});

describe('ShellLayout', () => {
  describe('the frame', () => {
    it('has no header element, and no link to Settings or Account', async () => {
      const { root } = await setup();
      const links = Array.from(root().querySelectorAll<HTMLAnchorElement>('a'));

      expect(root().querySelector('header')).toBeNull();
      expect(root().querySelector('a[href="/settings"]')).toBeNull();
      expect(links.some((a) => a.textContent?.trim() === 'Settings')).toBe(false);
      expect(links.some((a) => a.textContent?.trim() === 'Account')).toBe(false);
    });

    it('starts with the main element, which holds the routed screen', async () => {
      const { root } = await setup();
      const main = must(root().querySelector('main'));

      expect(main.querySelector('h1')?.textContent?.trim()).toBe('Now');
      expect(root().querySelector('app-shell-layout')?.firstElementChild).toBe(main);
    });
  });

  describe('the Inbox badge', () => {
    it('shows no badge while the store has no state, however large its count', async () => {
      const { dataStore, inboxBadge, settle } = await setup();

      dataStore.state.set(null);
      dataStore.inboxCount.set(3);
      await settle();

      expect(inboxBadge()).toBeNull();
    });

    it('shows the count once the state is there', async () => {
      const { dataStore, inboxBadge, settle } = await setup();

      dataStore.state.set(null);
      dataStore.inboxCount.set(3);
      await settle();
      dataStore.state.set({});
      await settle();

      expect(inboxBadge()).toBe('3');
    });

    it('shows no badge for a loaded Inbox of 0', async () => {
      const { inboxBadge } = await setup();

      expect(inboxBadge()).toBeNull();
    });
  });

  describe('where Capture shows', () => {
    it.each(['/now', '/today', '/inbox'])(
      'shows Capture in the bottom nav and no bar on %s',
      async (url) => {
        const { capture, bar } = await setup(url);

        expect(capture()).not.toBeNull();
        expect(bar()).toBeNull();
      },
    );

    it.each(['/tasks/x', '/settings'])(
      'shows neither Capture nor the bar on %s, and leaves the nav with its links',
      async (url) => {
        const { captures, nav, bar } = await setup(url);

        expect(captures()).toHaveLength(0);
        expect(bar()).toBeNull();
        expect(nav()?.querySelectorAll('a')).toHaveLength(3);
        expect(nav()?.querySelector('button')).toBeNull();
      },
    );

    it('ignores the query when deciding the path', async () => {
      const { capture } = await setup('/now?x=1');

      expect(capture()).not.toBeNull();
    });

    it('renders Capture inside the Primary nav, after the three links, and nowhere else', async () => {
      const { capture, captures, nav } = await setup();

      expect(captures()).toHaveLength(1);
      expect(capture()).toBe(captures()[0]);
      expect(capture()?.parentElement).toBe(nav());
      expect(nav()?.lastElementChild).toBe(capture());
      expect(
        Array.from(nav()?.children ?? [])
          .slice(0, 3)
          .map((child) => child.getAttribute('href')),
      ).toEqual(TAB_PATHS);
    });

    it('has no floating Capture pill of its own', async () => {
      const { root, capture, open } = await setup();

      expect(root().querySelector('.shell__capture')).toBeNull();
      expect(capture()?.classList.contains('shell__capture')).toBe(false);

      await open();

      expect(root().querySelector('.shell__capture')).toBeNull();
    });

    it('labels Capture with its name and a collapsed state', async () => {
      const { capture, captureName } = await setup();

      expect(captureName()).toBe('Capture');
      expect(capture()?.getAttribute('type')).toBe('button');
      expect(capture()?.getAttribute('aria-expanded')).toBe('false');
    });

    it('drops Capture when moving to a screen that is not a tab, and brings it back on a tab', async () => {
      const { captures, go } = await setup('/now');

      await go('/settings');

      expect(captures()).toHaveLength(0);

      await go('/inbox');

      expect(captures()).toHaveLength(1);
    });

    it('takes the tabs from TAB_PATHS, which lists the bottom nav links in their order', async () => {
      const { root } = await setup();
      const links = Array.from(
        root().querySelectorAll<HTMLAnchorElement>('nav[aria-label="Primary"] a'),
      ).map((a) => a.getAttribute('href'));

      expect(links).toEqual(TAB_PATHS);
    });
  });

  describe('opening and closing', () => {
    it('opens the bar and focuses its input when Capture is clicked, and Capture stays', async () => {
      const { capture, nav, bar, input, open } = await setup();
      const before = capture();

      await open();

      expect(bar()).not.toBeNull();
      expect(document.activeElement).toBe(input());
      expect(capture()).not.toBeNull();
      expect(capture()).toBe(before);
      expect(nav()?.lastElementChild).toBe(capture());
    });

    it('reports the state in aria-expanded: false while closed, true while open, false once closed', async () => {
      const { capture, open, closeButton, settle } = await setup();

      expect(capture()?.getAttribute('aria-expanded')).toBe('false');

      await open();

      expect(capture()?.getAttribute('aria-expanded')).toBe('true');

      closeButton()?.click();
      await settle();

      expect(capture()?.getAttribute('aria-expanded')).toBe('false');
    });

    it('marks the page for the open bar, and never for a pill', async () => {
      const { page, open, escape } = await setup();

      expect(page()?.classList.contains('shell__page--bar')).toBe(false);
      expect(page()?.classList.contains('shell__page--pill')).toBe(false);

      await open();

      expect(page()?.classList.contains('shell__page--bar')).toBe(true);
      expect(page()?.classList.contains('shell__page--pill')).toBe(false);

      await escape();

      expect(page()?.classList.contains('shell__page--bar')).toBe(false);
      expect(page()?.classList.contains('shell__page--pill')).toBe(false);
    });

    it('never marks the page for a pill on a screen that is not a tab', async () => {
      const { page } = await setup('/settings');

      expect(page()?.classList.contains('shell__page--pill')).toBe(false);
      expect(page()?.classList.contains('shell__page--bar')).toBe(false);
    });

    it('closes with the Close button, keeps Capture and focuses it', async () => {
      const { capture, bar, open, closeButton, settle } = await setup();
      const before = capture();

      await open();
      closeButton()?.click();
      await settle();

      expect(bar()).toBeNull();
      expect(capture()).not.toBeNull();
      expect(capture()).toBe(before);
      expect(document.activeElement).toBe(capture());
    });

    it('closes on Escape, keeps Capture and focuses it', async () => {
      const { capture, bar, open, escape } = await setup();
      const before = capture();

      await open();
      await escape();

      expect(bar()).toBeNull();
      expect(capture()).toBe(before);
      expect(document.activeElement).toBe(capture());
    });

    it.each(ACTIVATIONS)(
      'closes the bar when Capture is activated by %s while it is open, and keeps focus on Capture',
      async (_how, activate) => {
        const { capture, bar, input, open, settle } = await setup();
        const before = capture();

        await open();

        expect(document.activeElement).toBe(input());

        activate(capture() ?? undefined);
        await settle();

        expect(bar()).toBeNull();
        expect(capture()).toBe(before);
        expect(capture()?.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(capture());
      },
    );

    it('opens the bar again on a second click after closing it with Capture', async () => {
      const { capture, bar, input, open, settle } = await setup();

      await open();
      capture()?.click();
      await settle();

      expect(bar()).toBeNull();

      capture()?.click();
      await settle();

      expect(bar()).not.toBeNull();
      expect(capture()?.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(input());
    });

    it('keeps the typed text when Capture closes the bar', async () => {
      const { capture, input, open, type, settle } = await setup();

      await open();
      await type('Buy milk');
      capture()?.click();
      await settle();
      capture()?.click();
      await settle();

      expect(input()?.value).toBe('Buy milk');
    });

    it('keeps the typed text for the next opening', async () => {
      const { input, open, type, escape } = await setup();

      await open();
      await type('Buy milk');
      await escape();
      await open();

      expect(input()?.value).toBe('Buy milk');
    });

    it('stays open when moving between /now, /today and /inbox', async () => {
      const { bar, open, go } = await setup('/now');

      await open();
      await go('/today');

      expect(bar()).not.toBeNull();

      await go('/inbox');

      expect(bar()).not.toBeNull();
    });

    it('keeps Capture expanded while moving between the tabs with the bar open', async () => {
      const { capture, open, go } = await setup('/now');

      await open();
      await go('/today');

      expect(capture()?.getAttribute('aria-expanded')).toBe('true');

      await go('/inbox');

      expect(capture()?.getAttribute('aria-expanded')).toBe('true');
    });

    it('closes on any other path and starts closed when coming back', async () => {
      const { capture, captures, bar, open, go } = await setup('/now');

      await open();
      await go('/settings');

      expect(bar()).toBeNull();
      expect(captures()).toHaveLength(0);

      await go('/now');

      expect(bar()).toBeNull();
      expect(capture()).not.toBeNull();
      expect(capture()?.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('adding', () => {
    it('sends a CaptureTask without an areaId, with the first id as taskId and the next as key', async () => {
      const { send, open, type, submit } = await setup();

      await open();
      await type('Buy milk');
      await submit();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
      expect(send.mock.calls[0]?.[1]).toBe('id-2');
    });

    it('sends the trimmed text', async () => {
      const { send, open, type, submit } = await setup();

      await open();
      await type('  Buy milk  ');
      await submit();

      expect(send.mock.calls[0]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
    });

    it('clears the field before the send resolves, then says it is captured and keeps focus in the input', async () => {
      const { send, input, status, open, type, submit, settle } = await setup();
      const pending = deferred<CommandOutcome>();

      send.mockReturnValueOnce(pending.promise);

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('');
      expect(document.activeElement).toBe(input());

      pending.resolve(APPLIED);
      await settle();

      expect(input()?.value).toBe('');
      expect(status()).toBe('Captured. It waits in the Inbox.');
      expect(document.activeElement).toBe(input());
    });

    it('uses a new taskId and key for the next add after Applied', async () => {
      const { send, open, type, submit } = await setup();

      await open();
      await type('Buy milk');
      await submit();
      await type('Buy milk');
      await submit();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy milk'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });

    it('on Failed clears the field, shows the message and a row, and Try again resends the same command and key', async () => {
      const { send, input, status, failures, failureText, rowButton, open, type, submit, settle } =
        await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('');
      expect(status()).toBe('ASYS cannot reach the server. Try again.');
      expect(failures()).toHaveLength(1);
      expect(failureText(failures()[0])).toBe('Not captured: “Buy milk”');
      expect(rowButton(failures()[0], 'Try again')).toBeDefined();
      expect(rowButton(failures()[0], 'Discard')).toBeDefined();

      rowButton(failures()[0], 'Try again')?.click();
      await settle();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-1', 'Buy milk'));
      expect(send.mock.calls[1]?.[1]).toBe('id-2');
      expect(failures()).toHaveLength(0);
    });

    it('sends a new taskId and key for new text typed after Failed and keeps the old row', async () => {
      const { send, failures, failureText, open, type, submit } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();
      await type('Buy bread');
      await submit();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy bread'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
      expect(failures()).toHaveLength(1);
      expect(failureText(failures()[0])).toBe('Not captured: “Buy milk”');
    });

    it('on Rejected clears the field and shows a row with Discard only, and an empty submit sends nothing', async () => {
      const { send, input, status, failures, rowButton, open, type, submit } = await setup();

      send.mockResolvedValueOnce({
        _tag: CommandOutcomeTag.Rejected,
        reason: RejectedReason.InvalidTitle,
      });

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('');
      expect(status()).toBe('Enter a title.');
      expect(failures()).toHaveLength(1);
      expect(rowButton(failures()[0], 'Discard')).toBeDefined();
      expect(rowButton(failures()[0], 'Try again')).toBeUndefined();

      await submit();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('on NotApplicable clears the field and shows the Review item message and a row with Discard only', async () => {
      const { send, input, status, failures, rowButton, open, type, submit } = await setup();

      send.mockResolvedValueOnce({
        _tag: CommandOutcomeTag.NotApplicable,
        reason: 'x',
        reviewItemId: 'r',
      } as unknown as CommandOutcome);

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('');
      expect(status()).toBe('That no longer applied, so it waits in the Inbox as a Review item.');
      expect(failures()).toHaveLength(1);
      expect(rowButton(failures()[0], 'Discard')).toBeDefined();
      expect(rowButton(failures()[0], 'Try again')).toBeUndefined();
    });

    it('on KeyReused shows the generic message and Try again sends a fresh command and key', async () => {
      const { send, input, status, failures, rowButton, open, type, submit, settle } =
        await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.KeyReused });

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('');
      expect(status()).toBe('Something went wrong. Try again.');
      expect(rowButton(failures()[0], 'Try again')).toBeDefined();

      rowButton(failures()[0], 'Try again')?.click();
      await settle();

      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy milk'));
      expect(send.mock.calls[1]?.[1]).toBe('id-4');
    });

    it('on SignedOut clears the field and shows neither a message nor a row', async () => {
      const { send, input, status, failures, open, type, submit } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.SignedOut });

      await open();
      await type('Buy milk');
      await submit();

      expect(input()?.value).toBe('');
      expect(status()).toBe('');
      expect(failures()).toHaveLength(0);
    });

    it('Discard removes the row and sends nothing', async () => {
      const { send, failures, rowButton, open, type, submit, settle } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();
      rowButton(failures()[0], 'Discard')?.click();
      await settle();

      expect(failures()).toHaveLength(0);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('clears the status message when the bar is opened again, and keeps the row', async () => {
      const { send, status, failures, open, type, submit, escape } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();
      await escape();
      await open();

      expect(status()).toBe('');
      expect(failures()).toHaveLength(1);
    });

    it('shows the number of rows as a count on Capture and drops it when the rows are gone', async () => {
      const {
        send,
        capture,
        captureName,
        badge,
        failures,
        rowButton,
        open,
        type,
        submit,
        escape,
        settle,
      } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });
      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();
      await escape();

      expect(badge()).toBe('1');
      expect(captureName()).toBe('Capture 1 not captured');

      await open();
      await type('Buy bread');
      await submit();
      await escape();

      expect(badge()).toBe('2');
      expect(captureName()).toBe('Capture 2 not captured');

      await open();
      rowButton(failures()[0], 'Discard')?.click();
      await settle();
      await escape();

      expect(badge()).toBe('1');

      await open();
      rowButton(failures()[0], 'Discard')?.click();
      await settle();
      await escape();

      expect(capture()?.querySelector('.asys-capture__count')).toBeNull();
      expect(capture()?.querySelector('.asys-capture__badge')).toBeNull();
      expect(badge()).toBeNull();
      expect(captureName()).toBe('Capture');
    });

    it('keeps the count on Capture visible while the bar is open', async () => {
      const { send, capture, badge, open, type, submit, escape } = await setup();

      send.mockResolvedValueOnce({ _tag: CommandOutcomeTag.Failed, status: 0 });

      await open();
      await type('Buy milk');
      await submit();

      expect(capture()?.getAttribute('aria-expanded')).toBe('true');
      expect(badge()).toBe('1');

      await escape();

      expect(badge()).toBe('1');
    });

    it('clears the field and leaves focus on Capture when an add resolves Applied after the bar closed', async () => {
      const { send, capture, input, open, type, submit, escape, settle } = await setup();
      const pending = deferred<CommandOutcome>();

      send.mockReturnValueOnce(pending.promise);

      await open();
      await type('Buy milk');
      await submit();
      await escape();

      expect(document.activeElement).toBe(capture());

      pending.resolve(APPLIED);
      await settle();

      expect(document.activeElement).toBe(capture());

      await open();

      expect(input()?.value).toBe('');
    });

    it('queues a second add while the first is pending, without ever disabling Add', async () => {
      const { send, addButton, input, open, type, submit, settle } = await setup();
      const pending = deferred<CommandOutcome>();

      send.mockReturnValueOnce(pending.promise);

      await open();
      await type('Buy milk');
      await submit();

      expect(addButton()?.disabled).toBe(false);

      await type('Buy bread');

      expect(addButton()?.disabled).toBe(false);

      await submit();

      expect(input()?.value).toBe('');
      expect(send).toHaveBeenCalledTimes(1);

      pending.resolve(APPLIED);
      await settle();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]?.[0]).toStrictEqual(captureCommand('id-3', 'Buy bread'));
      expect(addButton()?.disabled).toBe(false);
    });
  });

  describe('the capture flight', () => {
    const INBOX_RECT = {
      x: 275,
      y: 783,
      width: 137,
      height: 56,
      left: 275,
      top: 783,
      right: 412,
      bottom: 839,
    };

    const FIELD_RECT = {
      x: 16,
      y: 700,
      width: 300,
      height: 40,
      left: 16,
      top: 700,
      right: 316,
      bottom: 740,
    };

    interface FlightOptions {
      readonly allowed?: boolean;
      readonly viewportHeight?: number | null;
    }

    const flightSetup = async ({ allowed = true, viewportHeight = 839 }: FlightOptions = {}) => {
      const play = vi.fn((..._args: unknown[]) => new Promise<void>(() => undefined));

      stubViewport(viewportHeight === null ? undefined : { height: viewportHeight });

      const harness = await setup('/now', {
        motion: { allowed: () => allowed, reduced: signal(false), play } as Partial<Motion>,
      });
      const inboxLink = harness
        .root()
        .querySelector<HTMLAnchorElement>('nav[aria-label="Primary"] a[href="/inbox"]');

      if (inboxLink !== null) {
        inboxLink.getBoundingClientRect = () => INBOX_RECT as DOMRect;
      }

      const ghosts = (): HTMLElement[] =>
        Array.from(document.body.querySelectorAll<HTMLElement>('span.shell__ghost'));

      await harness.open();
      await harness.type('Buy milk');
      const field = harness.input();

      if (field !== null) {
        field.getBoundingClientRect = () => FIELD_RECT as DOMRect;
      }

      await harness.submit();

      return { ...harness, play, ghosts };
    };

    it('appends one aria-hidden ghost carrying the captured title and plays it', async () => {
      const { play, ghosts, send } = await flightSetup();

      expect(ghosts()).toHaveLength(1);
      expect(ghosts()[0]?.getAttribute('aria-hidden')).toBe('true');
      expect(ghosts()[0]?.textContent).toBe('Buy milk');
      expect(ghosts()[0]?.style.left).toBe('16px');
      expect(ghosts()[0]?.style.top).toBe('700px');
      expect(ghosts()[0]?.style.width).toBe('300px');
      expect(ghosts()[0]?.style.height).toBe('40px');
      expect(play).toHaveBeenCalledTimes(1);
      expect(play.mock.calls[0]?.[0]).toBe(ghosts()[0]);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('flies nothing when motion is not allowed, and still sends', async () => {
      const { play, ghosts, send } = await flightSetup({ allowed: false });

      expect(ghosts()).toHaveLength(0);
      expect(play).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('flies nothing when the Inbox tab is under the keyboard, and still sends', async () => {
      const { play, ghosts, send } = await flightSetup({ viewportHeight: 500 });

      expect(ghosts()).toHaveLength(0);
      expect(play).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('flies nothing without visualViewport, and still sends', async () => {
      const { play, ghosts, send } = await flightSetup({ viewportHeight: null });

      expect(ghosts()).toHaveLength(0);
      expect(play).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('the status region', () => {
    it('exists, always rendered, visually hidden and empty before any Done', async () => {
      const { statusRegion } = await setup();

      expect(statusRegion()).not.toBeNull();
      expect(statusRegion()?.getAttribute('role')).toBe('status');
      expect(statusRegion()?.classList.contains('asys-visually-hidden')).toBe(true);
      expect(statusRegion()?.textContent).toBe('');
    });

    it('holds a notice text and nothing else', async () => {
      const { doneUndo, statusRegion, settle } = await setup();

      doneUndo.notice.set({ text: '“Pay the invoice” is Done.', seq: 1 });
      await settle();

      expect(statusRegion()?.textContent).toBe('“Pay the invoice” is Done.');

      doneUndo.notice.set({ text: 'That no longer applied.', seq: 2 });
      await settle();

      expect(statusRegion()?.textContent).toBe('That no longer applied.');
    });

    it('announces an identical second notice as a new node in the region', async () => {
      const { doneUndo, statusRegion, settle } = await setup();
      const text = '“Pay the invoice” is Done.';

      doneUndo.notice.set({ text, seq: 1 });
      await settle();

      const first = statusRegion()?.firstElementChild;

      doneUndo.notice.set({ text, seq: 2 });
      await settle();

      // A live region announces added nodes; the same text in the same node would not be read again.
      expect(statusRegion()?.textContent).toBe(text);
      expect(first).toBeInstanceOf(HTMLElement);
      expect(statusRegion()?.firstElementChild).not.toBe(first);
      expect(statusRegion()?.children).toHaveLength(1);
    });
  });

  describe('the Undo bar', () => {
    it('shows no bar before a Done', async () => {
      const { undoBar } = await setup();

      expect(undoBar()).toBeNull();
    });

    it('shows the Done layout with the title and Undo for a pending Done, and Undo calls undo', async () => {
      const { doneUndo, undoBar, undoButton, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      expect(undoBar()?.classList.contains('asys-undo')).toBe(true);
      expect(undoBar()?.classList.contains('asys-undobar')).toBe(false);
      expect(undoBar()?.textContent).toContain('Pay the invoice');
      expect(undoButton('Undo')).toBeDefined();
      expect(undoButton('Undo')?.getAttribute('aria-label')).toBe('Undo Done: Pay the invoice');

      undoButton('Undo')?.click();
      await settle();

      expect(doneUndo.undo).toHaveBeenCalledTimes(1);
    });

    it('gives the bar the whole Undo window to run for a Done that has just opened', async () => {
      const { doneUndo, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      expect(ringStyle(undoBar(), RING_DURATION)).toBe(`${UNDO_WINDOW_MS}ms`);
      expect(ringStyle(undoBar(), RING_DELAY)).toMatch(NO_DELAY);
    });

    it('hands the bar the time the Done has left, so the ring starts part-way round', async () => {
      const { doneUndo, undoBar, settle } = await setup();

      doneUndo.pending.set({ ...PENDING, remainingMs: 3_000 });
      await settle();

      expect(ringStyle(undoBar(), RING_DURATION)).toBe(`${UNDO_WINDOW_MS}ms`);
      expect(ringStyle(undoBar(), RING_DELAY)).toBe('-2000ms');
    });

    it('restarts the ring where the timer is when a dismissed failure lets the Done run again', async () => {
      const { doneUndo, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      doneUndo.failure.set(NOT_DONE);
      await settle();
      doneUndo.pending.set({ ...PENDING, remainingMs: 3_000 });
      doneUndo.failure.set(null);
      await settle();

      expect(undoBar()?.textContent).toContain('Pay the invoice');
      expect(ringStyle(undoBar(), RING_DELAY)).toBe('-2000ms');
    });

    it('starts the ring again when a second Done replaces the first in the open bar', async () => {
      const { doneUndo, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      const fill = must(undoBar()?.querySelector('.asys-undo__fill'));
      const animation = { currentTime: 2_400 } as unknown as Animation;

      fill.getAnimations = () => [animation];
      doneUndo.pending.set({ ...PENDING, taskId: 'b', title: 'Water the plants' });
      await settle();

      expect(undoBar()?.querySelector('.asys-undo__fill')).toBe(fill);
      expect(animation.currentTime).toBe(0);
    });

    it('carries the time left only into the Done layout, never into a failure', async () => {
      const { doneUndo, undoBar, settle } = await setup();

      doneUndo.pending.set({ ...PENDING, remainingMs: 3_000 });
      doneUndo.failure.set(NOT_DONE);
      await settle();

      expect(undoBar()?.textContent).toContain('is not Done');
      expect(ringStyle(undoBar(), RING_DURATION)).toBe(`${UNDO_WINDOW_MS}ms`);
      expect(ringStyle(undoBar(), RING_DELAY)).toMatch(NO_DELAY);
    });

    it('sits after <main> in the shell, not inside it', async () => {
      const { doneUndo, undoBar, root, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      const main = root().querySelector('main');

      expect(main?.contains(undoBar())).toBe(false);
      expect(
        must(main).compareDocumentPosition(must(undoBar())) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('closes when nothing is pending any more', async () => {
      const { doneUndo, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();
      doneUndo.pending.set(null);
      await settle();

      expect(undoBar()).toBeNull();
    });

    it('shows the failed layout in place of a pending Done', async () => {
      const { doneUndo, undoBar, undoButton, settle } = await setup();

      doneUndo.pending.set(PENDING);
      doneUndo.failure.set(NOT_DONE);
      await settle();

      expect(undoBar()?.textContent).toContain('“Pay the invoice” is not Done.');
      expect(undoBar()?.textContent).toContain('ASYS cannot reach the server. Try again.');
      expect(undoButton('Undo')).toBeUndefined();
      expect(undoButton('Try again')).toBeDefined();
      expect(undoButton('Dismiss')).toBeDefined();
    });

    it('shows Dismiss only for a failure that cannot be retried', async () => {
      const { doneUndo, undoButton, settle } = await setup();

      doneUndo.failure.set({ ...NOT_DONE, canRetry: false });
      await settle();

      expect(undoButton('Try again')).toBeUndefined();
      expect(undoButton('Dismiss')).toBeDefined();
    });

    it('shows the notice layout for a failure closed elsewhere: the sentence and Dismiss only', async () => {
      const { doneUndo, undoBar, undoButton, settle } = await setup();

      doneUndo.failure.set({
        ...NOT_DONE,
        message: REVIEW_SENTENCE,
        canRetry: false,
        closedElsewhere: true,
      });
      await settle();

      expect(undoBar()?.textContent).toContain(REVIEW_SENTENCE);
      expect(undoBar()?.textContent).not.toContain('is not Done');
      expect(undoButton('Undo')).toBeUndefined();
      expect(undoButton('Try again')).toBeUndefined();
      expect(undoButton('Dismiss')).toBeDefined();
    });

    it('goes back to the Done layout when the failure clears while a Done is pending', async () => {
      const { doneUndo, undoButton, settle } = await setup();

      doneUndo.pending.set(PENDING);
      doneUndo.failure.set(NOT_DONE);
      await settle();
      doneUndo.failure.set(null);
      await settle();

      expect(undoButton('Undo')).toBeDefined();
      expect(undoButton('Dismiss')).toBeUndefined();
    });

    it('calls retry for Try again and dismiss for Dismiss', async () => {
      const { doneUndo, undoButton, settle } = await setup();

      doneUndo.failure.set(NOT_DONE);
      await settle();
      undoButton('Try again')?.click();
      await settle();

      expect(doneUndo.retry).toHaveBeenCalledTimes(1);
      expect(doneUndo.dismiss).not.toHaveBeenCalled();

      doneUndo.failure.set(NOT_DONE);
      await settle();
      undoButton('Dismiss')?.click();
      await settle();

      expect(doneUndo.dismiss).toHaveBeenCalledTimes(1);
    });

    it('pauses and resumes the window for the pointer and for focus, with the right reasons', async () => {
      const { doneUndo, undoBar, undoButton, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      undoBar()?.dispatchEvent(new Event('pointerenter'));

      expect(doneUndo.pause).toHaveBeenLastCalledWith(PauseReason.Pointer);

      undoBar()?.dispatchEvent(new Event('pointerleave'));

      expect(doneUndo.resume).toHaveBeenLastCalledWith(PauseReason.Pointer);

      undoButton('Undo')?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      expect(doneUndo.pause).toHaveBeenLastCalledWith(PauseReason.Focus);

      undoButton('Undo')?.dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
      );

      expect(doneUndo.resume).toHaveBeenLastCalledWith(PauseReason.Focus);
      expect(doneUndo.pause).toHaveBeenCalledTimes(2);
      expect(doneUndo.resume).toHaveBeenCalledTimes(2);
    });

    it('pauses the ring while the pointer rests on the bar, and lets it run when it leaves', async () => {
      const { doneUndo, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      expect(undoBar()?.classList.contains('is-paused')).toBe(false);

      undoBar()?.dispatchEvent(new Event('pointerenter'));
      await settle();

      expect(undoBar()?.classList.contains('is-paused')).toBe(true);

      undoBar()?.dispatchEvent(new Event('pointerleave'));
      await settle();

      expect(undoBar()?.classList.contains('is-paused')).toBe(false);
    });
  });

  describe('focus', () => {
    const focusedText = (): string | null => document.activeElement?.textContent?.trim() ?? null;

    it('does not move focus to the bar when a Done is pending without a focus request', async () => {
      const { doneUndo, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      expect(undoBar()?.contains(document.activeElement)).toBe(false);
    });

    it('moves focus to Undo on a focus request, even when the bar renders in the same pass', async () => {
      const { doneUndo, undoButton, settle } = await setup();

      doneUndo.pending.set(PENDING);
      doneUndo.focusRequest.set(1);
      await settle();

      expect(document.activeElement).toBe(undoButton('Undo'));
    });

    it('moves focus to Undo on a later focus request for a bar already shown', async () => {
      const { doneUndo, undoButton, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();
      doneUndo.focusRequest.set(1);
      await settle();

      expect(document.activeElement).toBe(undoButton('Undo'));
    });

    it('moves focus to the h1 on Escape when no Task title is in the page', async () => {
      const { doneUndo, root, pressEscapeInBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();
      await pressEscapeInBar();

      expect(document.activeElement).toBe(root().querySelector('main h1'));
    });

    it('moves focus to the first Task title on Escape', async () => {
      const { doneUndo, root, pressEscapeInBar, settle } = await setup();

      nowItems.set([{ id: 'b' }, { id: 'c' }]);
      doneUndo.pending.set(PENDING);
      await settle();
      await pressEscapeInBar();

      expect(document.activeElement).toBe(root().querySelector('main [data-task-id="b"]'));
    });

    it('skips a leaving title on Escape, even though its own element has no data-leaving', async () => {
      const { doneUndo, root, pressEscapeInBar, settle } = await setup();

      nowItems.set([{ id: 'a', leaving: true }, { id: 'b' }]);
      doneUndo.pending.set(PENDING);
      await settle();
      await pressEscapeInBar();

      expect(document.activeElement).toBe(root().querySelector('main [data-task-id="b"]'));
    });

    it('falls back to the h1 on Escape when every title is leaving', async () => {
      const { doneUndo, root, pressEscapeInBar, settle } = await setup();

      nowItems.set([{ id: 'a', leaving: true }]);
      doneUndo.pending.set(PENDING);
      await settle();
      await pressEscapeInBar();

      expect(document.activeElement).toBe(root().querySelector('main h1'));
    });

    it('focuses the closest link of the title on Escape', async () => {
      const { doneUndo, root, pressEscapeInBar, settle } = await setup();

      nowItems.set([{ id: 'b', linked: true }]);
      doneUndo.pending.set(PENDING);
      await settle();
      await pressEscapeInBar();

      expect(document.activeElement).toBe(root().querySelector('main a'));
    });

    it('ignores a data-task-id outside <main> on Escape', async () => {
      const { doneUndo, root, pressEscapeInBar, settle } = await setup();
      const outside = document.createElement('span');

      outside.tabIndex = -1;
      outside.dataset['taskId'] = 'x';
      must(root().querySelector('nav[aria-label="Primary"]')).appendChild(outside);

      doneUndo.pending.set(PENDING);
      await settle();
      await pressEscapeInBar();

      expect(document.activeElement).not.toBe(outside);
      expect(document.activeElement).toBe(root().querySelector('main h1'));
    });

    it('focuses the restored Task title after an Undo', async () => {
      const { doneUndo, root, settle } = await setup();

      nowItems.set([{ id: 'a' }, { id: 'b' }]);
      await settle();
      doneUndo.undone.set({ taskId: 'b', seq: 1 });
      await settle();

      expect(document.activeElement).toBe(root().querySelector('main [data-task-id="b"]'));
      expect(focusedText()).toBe('b');
    });

    it('focuses the restored title, not a leaving copy of it', async () => {
      const { doneUndo, root, settle } = await setup();

      nowItems.set([{ id: 'a', leaving: true }]);
      await settle();
      doneUndo.undone.set({ taskId: 'a', seq: 1 });
      await settle();

      expect(document.activeElement).toBe(root().querySelector('main h1'));
    });

    it('focuses the h1 after an Undo when the restored Task is not in the page', async () => {
      const { doneUndo, root, settle } = await setup();

      nowItems.set([{ id: 'b' }]);
      await settle();
      doneUndo.undone.set({ taskId: 'a', seq: 1 });
      await settle();

      expect(document.activeElement).toBe(root().querySelector('main h1'));
    });

    it('does not move focus when nothing was undone', async () => {
      const { root, settle } = await setup();

      nowItems.set([{ id: 'a' }]);
      await settle();

      expect(document.activeElement).not.toBe(root().querySelector('main [data-task-id="a"]'));
    });

    describe('after Dismiss or Try again', () => {
      it('moves focus to the bar when Dismiss leaves a pending Done behind', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        doneUndo.pending.set(PENDING);
        doneUndo.failure.set(NOT_DONE);
        await settle();
        undoButton('Dismiss')?.focus();
        undoButton('Dismiss')?.click();
        await settle();

        expect(doneUndo.dismiss).toHaveBeenCalledTimes(1);
        expect(undoButton('Undo')).toBeDefined();
        expect(document.activeElement).toBe(undoButton('Undo'));
      });

      it('moves focus to the bar when Try again leaves a pending Done behind', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        doneUndo.pending.set(PENDING);
        doneUndo.failure.set(NOT_DONE);
        await settle();
        undoButton('Try again')?.focus();
        undoButton('Try again')?.click();
        await settle();

        expect(doneUndo.retry).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(undoButton('Undo'));
      });

      it('leaves focus where it was when a pointer Dismiss leaves a pending Done behind', async () => {
        const { doneUndo, root, undoButton, settle } = await setup();
        const link = must(root().querySelector<HTMLAnchorElement>('nav[aria-label="Primary"] a'));

        doneUndo.pending.set(PENDING);
        doneUndo.failure.set(NOT_DONE);
        await settle();
        link.focus();
        pointerClick(undoButton('Dismiss'));
        await settle();

        expect(undoButton('Undo')).toBeDefined();
        expect(document.activeElement).toBe(link);
      });

      it('moves focus to the next title when a keyboard Dismiss closes the last bar', async () => {
        const { doneUndo, root, undoBar, undoButton, settle } = await setup();

        nowItems.set([{ id: 'b', leaving: false }]);
        doneUndo.failure.set(NOT_DONE);
        await settle();
        undoButton('Dismiss')?.focus();
        undoButton('Dismiss')?.click();
        await settle();

        expect(undoBar()).toBeNull();
        expect(document.activeElement).toBe(root().querySelector('[data-task-id="b"]'));
      });

      it('leaves focus alone when no bar is left', async () => {
        const { doneUndo, root, undoBar, undoButton, settle } = await setup();
        const link = must(root().querySelector<HTMLAnchorElement>('nav[aria-label="Primary"] a'));

        doneUndo.failure.set(NOT_DONE);
        await settle();
        link.focus();
        pointerClick(undoButton('Dismiss'));
        await settle();

        expect(undoBar()).toBeNull();
        expect(document.activeElement).toBe(link);
      });

      it('leaves focus where it fell when a pointer Dismiss leaves a pending Done behind, and resumes the Focus pause', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        nowItems.set([{ id: 'b' }]);
        doneUndo.pending.set(PENDING);
        doneUndo.failure.set(NOT_DONE);
        await settle();
        undoButton('Dismiss')?.focus();
        await settle();

        expect(doneUndo.pause).toHaveBeenLastCalledWith(PauseReason.Focus);
        expect(doneUndo.resume).not.toHaveBeenCalled();

        pointerClick(undoButton('Dismiss'));
        await settle();

        expect(doneUndo.dismiss).toHaveBeenCalledTimes(1);
        expect(undoButton('Undo')).toBeDefined();
        expect(doneUndo.resume).toHaveBeenCalledWith(PauseReason.Focus);
        expect(document.activeElement).toBe(document.body);
      });

      it('leaves focus where it fell when a pointer Try again leaves a pending Done behind, and resumes the Focus pause', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        nowItems.set([{ id: 'b' }]);
        doneUndo.pending.set(PENDING);
        doneUndo.failure.set(NOT_DONE);
        await settle();
        undoButton('Try again')?.focus();
        await settle();
        pointerClick(undoButton('Try again'));
        await settle();

        expect(doneUndo.retry).toHaveBeenCalledTimes(1);
        expect(undoButton('Undo')).toBeDefined();
        expect(doneUndo.resume).toHaveBeenCalledWith(PauseReason.Focus);
        expect(document.activeElement).toBe(document.body);
      });

      it('does not focus the next title when a pointer Dismiss closes the last bar, and resumes the Focus pause', async () => {
        const { doneUndo, root, undoBar, undoButton, settle } = await setup();

        nowItems.set([{ id: 'b' }]);
        doneUndo.failure.set(NOT_DONE);
        await settle();
        undoButton('Dismiss')?.focus();
        await settle();
        pointerClick(undoButton('Dismiss'));
        await settle();

        expect(undoBar()).toBeNull();
        expect(doneUndo.resume).toHaveBeenCalledWith(PauseReason.Focus);
        expect(document.activeElement).not.toBe(root().querySelector('[data-task-id="b"]'));
        expect(document.activeElement).toBe(document.body);
      });

      it('consumes the pointer mark on the next change even when focus was not in the bar', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        doneUndo.pending.set(PENDING);
        doneUndo.failure.set(NOT_DONE);
        await settle();

        // This pointer Dismiss starts with focus outside the bar. It still marks the next guard run,
        // which consumes the mark.
        pointerClick(undoButton('Dismiss'));
        await settle();

        // The mark was consumed by that run, so this keyboard-driven displacement moves focus.
        undoButton('Undo')?.focus();
        doneUndo.failure.set(NOT_DONE);
        await settle();

        expect(document.activeElement).toBe(undoButton('Try again'));
      });
    });

    describe('the guard after the bar loses focus', () => {
      it('moves focus to the failure layout first button when a failure displaces the pending Done', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        doneUndo.pending.set(PENDING);
        await settle();
        undoButton('Undo')?.focus();
        await settle();
        doneUndo.failure.set(NOT_DONE);
        await settle();

        expect(undoButton('Undo')).toBeUndefined();
        expect(document.activeElement).toBe(undoButton('Try again'));
      });

      it('moves focus to Dismiss when the failure cannot be retried', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        doneUndo.pending.set(PENDING);
        await settle();
        undoButton('Undo')?.focus();
        await settle();
        doneUndo.failure.set({ ...NOT_DONE, canRetry: false });
        await settle();

        expect(document.activeElement).toBe(undoButton('Dismiss'));
      });

      it('moves focus to the next title when the bar goes without a failure', async () => {
        const { doneUndo, root, undoBar, undoButton, settle } = await setup();

        nowItems.set([{ id: 'b' }]);
        doneUndo.pending.set(PENDING);
        await settle();
        undoButton('Undo')?.focus();
        await settle();
        doneUndo.pending.set(null);
        await settle();

        expect(undoBar()).toBeNull();
        expect(document.activeElement).toBe(root().querySelector('main [data-task-id="b"]'));
      });

      it('moves focus to the h1 when the bar goes and no title is in the page', async () => {
        const { doneUndo, root, undoButton, settle } = await setup();

        doneUndo.pending.set(PENDING);
        await settle();
        undoButton('Undo')?.focus();
        await settle();
        doneUndo.pending.set(null);
        await settle();

        expect(document.activeElement).toBe(root().querySelector('main h1'));
      });

      it('resumes the Focus pause when the bar goes under focus', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        doneUndo.pending.set(PENDING);
        await settle();
        undoButton('Undo')?.focus();
        await settle();
        doneUndo.pending.set(null);
        await settle();

        expect(doneUndo.resume).toHaveBeenCalledWith(PauseReason.Focus);
      });

      it('does nothing while focus is still inside the bar after another Task replaces the pending one', async () => {
        const { doneUndo, undoButton, settle } = await setup();

        nowItems.set([{ id: 'b' }]);
        doneUndo.pending.set(PENDING);
        await settle();
        undoButton('Undo')?.focus();
        await settle();
        doneUndo.pending.set({
          taskId: 'b',
          title: 'Call Marit',
          origin: DoneOrigin.Button,
          remainingMs: UNDO_WINDOW_MS,
        });
        await settle();

        expect(document.activeElement).toBe(undoButton('Undo'));
        expect(doneUndo.resume).not.toHaveBeenCalled();
      });

      it('does not move focus when it was on a bottom nav link and the layout changes', async () => {
        const { doneUndo, root, undoBar, settle } = await setup();
        const link = must(root().querySelector<HTMLAnchorElement>('nav[aria-label="Primary"] a'));

        nowItems.set([{ id: 'b' }]);
        doneUndo.pending.set(PENDING);
        await settle();
        link.focus();
        doneUndo.failure.set(NOT_DONE);
        await settle();

        expect(document.activeElement).toBe(link);

        doneUndo.failure.set(null);
        await settle();

        expect(document.activeElement).toBe(link);

        doneUndo.pending.set(null);
        await settle();

        expect(undoBar()).toBeNull();
        expect(document.activeElement).toBe(link);
      });

      it('does not move focus when nothing had focus and the bar goes', async () => {
        const { doneUndo, root, settle } = await setup();

        nowItems.set([{ id: 'b' }]);
        doneUndo.pending.set(PENDING);
        await settle();
        doneUndo.pending.set(null);
        await settle();

        expect(document.activeElement).not.toBe(root().querySelector('[data-task-id="b"]'));
        expect(document.activeElement).toBe(document.body);
      });

      it('does not steal focus that someone moved to another title as the bar goes', async () => {
        const { doneUndo, root, undoButton, settle } = await setup();

        nowItems.set([{ id: 'a' }, { id: 'b' }]);
        doneUndo.pending.set(PENDING);
        await settle();
        undoButton('Undo')?.focus();
        await settle();

        const second = must(root().querySelector<HTMLElement>('main [data-task-id="b"]'));

        doneUndo.pending.set(null);
        second.focus();
        await settle();

        expect(document.activeElement).toBe(second);
      });

      it('lets the restored title take focus after an Undo, and the guard leaves it', async () => {
        const { doneUndo, root, undoButton, settle } = await setup();

        nowItems.set([{ id: 'a' }, { id: 'b' }]);
        doneUndo.pending.set(PENDING);
        await settle();
        undoButton('Undo')?.focus();
        await settle();

        const focused: (Element | null)[] = [];
        const nativeFocus = HTMLElement.prototype.focus;
        const spy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
          this: HTMLElement,
          options?: FocusOptions,
        ) {
          focused.push(this);
          nativeFocus.call(this, options);
        });

        // The real undo() clears the pending Done and records `undone` together.
        doneUndo.pending.set(null);
        doneUndo.undone.set({ taskId: 'b', seq: 1 });
        await settle();
        spy.mockRestore();

        expect(document.activeElement).toBe(root().querySelector('main [data-task-id="b"]'));
        // The guard must not flicker focus through another title first.
        expect(focused).not.toContain(root().querySelector('main [data-task-id="a"]'));
      });
    });
  });

  describe('the bar height', () => {
    const heightOf = (host: HTMLElement | null): string =>
      host?.style.getPropertyValue('--shell-undo-height') ?? '';

    it('publishes the observed border-box height on the shell host and observes the bar', async () => {
      const instances = stubResizeObserver(true);
      const { doneUndo, shellHost, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      expect(heightOf(shellHost())).toBe('64px');
      expect(instances.flatMap((instance) => instance.observed)).toContain(undoBar());
    });

    it('sets 0px and disconnects the bar observer once the bar is gone', async () => {
      const instances = stubResizeObserver(true);
      const { doneUndo, shellHost, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      const bar = must(undoBar());

      doneUndo.pending.set(null);
      await settle();

      const barObservers = instances.filter((instance) => instance.observed.includes(bar));

      expect(heightOf(shellHost())).toBe('0px');
      expect(barObservers.length).toBeGreaterThan(0);
      expect(barObservers.every((instance) => instance.disconnect.mock.calls.length > 0)).toBe(
        true,
      );
    });

    it('observes nothing and still shows the bar without ResizeObserver', async () => {
      stubResizeObserver(false);

      const { doneUndo, shellHost, undoBar, settle } = await setup();

      doneUndo.pending.set(PENDING);
      await settle();

      expect(undoBar()).not.toBeNull();
      expect(heightOf(shellHost())).not.toBe('64px');
    });
  });

  describe('the nav height', () => {
    const NAV_HEIGHT = '--shell-nav-height';

    const navHeightOf = (host: HTMLElement | null): string =>
      host?.style.getPropertyValue(NAV_HEIGHT) ?? '';

    /** The observer that watches the nav host, and the host it watches. */
    const navObserver = (instances: ObserverInstance[], root: HTMLElement) => {
      const target = must(root.querySelector<HTMLElement>('.shell__nav'), 'the nav host');

      return { target, observer: instances.find((instance) => instance.observed.includes(target)) };
    };

    it('observes the nav host, which is the bottom nav component', async () => {
      const instances = stubResizeObserver(true, false);
      const { root } = await setup();
      const { target, observer } = navObserver(instances, root());

      expect(target.tagName).toBe('ASYS-BOTTOM-NAV');
      expect(target.querySelector('nav[aria-label="Primary"]')).not.toBeNull();
      expect(observer).toBeDefined();
    });

    it('writes the observed border-box block size on the shell host, and follows later sizes', async () => {
      const instances = stubResizeObserver(true, false);
      const { root, shellHost } = await setup();
      const { target, observer } = navObserver(instances, root());

      expect(navHeightOf(shellHost())).not.toBe('81px');

      observer?.fire(target, 81);

      expect(navHeightOf(shellHost())).toBe('81px');

      observer?.fire(target, 112);

      expect(navHeightOf(shellHost())).toBe('112px');
    });

    it('keeps the nav height apart from the Undo bar height', async () => {
      const instances = stubResizeObserver(true, false);
      const { root, shellHost } = await setup();
      const { target, observer } = navObserver(instances, root());

      observer?.fire(target, 81);

      expect(shellHost()?.style.getPropertyValue('--shell-undo-height')).not.toBe('81px');
    });

    it('measures the nav on a screen that is not a tab too', async () => {
      const instances = stubResizeObserver(true, false);
      const { root, shellHost } = await setup('/settings');
      const { target, observer } = navObserver(instances, root());

      observer?.fire(target, 81);

      expect(navHeightOf(shellHost())).toBe('81px');
    });

    it('resets the property and disconnects the observer when the shell is destroyed', async () => {
      const instances = stubResizeObserver(true, false);
      const { root, shellHost, fixture } = await setup();
      const { target, observer } = navObserver(instances, root());
      const host = must(shellHost());

      observer?.fire(target, 81);

      expect(navHeightOf(host)).toBe('81px');

      fixture.destroy();

      expect(navHeightOf(host)).not.toBe('81px');
      expect(observer?.disconnect).toHaveBeenCalled();
    });

    it('observes nothing and writes no nav height without ResizeObserver', async () => {
      stubResizeObserver(false);

      const { shellHost, nav } = await setup();

      expect(nav()).not.toBeNull();
      expect(navHeightOf(shellHost())).toBe('');
    });
  });
});
