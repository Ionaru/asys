// SPDX-License-Identifier: EUPL-1.2
import {
  computed,
  ErrorHandler,
  signal,
  type AnimationCallbackEvent,
  type DebugElement,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import {
  CommandTag,
  IsoWeekday,
  pick,
  reasonFact,
  RejectedReason,
  TaskKind,
  TaskStatus,
  waitingSummary,
  type ActiveHours,
  type Area,
  type Command,
  type DomainState,
  type Instant,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { outcomeMessage } from '../../core/data/outcome-message';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { DoneOrigin, DoneUndo, type DoneUndone, type PendingDone } from '../../core/data/done-undo';
import { Clock } from '../../core/platform/clock';
import { Ids } from '../../core/platform/ids';
import { Motion, MotionDuration, MotionEasing } from '../../core/platform/motion';
import { TaskMorph } from '../../core/platform/task-morph';
import { SwipeActions } from '../../ui/swipe-actions/swipe-actions';
import { Now } from './now';

const ZONE = 'Europe/Amsterdam';

// Sunday 4 October 2026, 10:00 in Amsterdam.
const T0 = Date.parse('2026-10-04T08:00:00.000Z') as Instant;

const MINUTE = 60_000;

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const task = (overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task => ({
  kind: TaskKind.Task,
  status: TaskStatus.Open,
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
  createdAt: 1,
  closedAt: null,
  ...overrides,
});

const domainState = (tasks: readonly Task[], extra: Partial<DomainState> = {}): DomainState => ({
  tasks,
  links: [],
  areas: [],
  reviewItems: [],
  settings: { timeZone: ZONE, urgencyWindowDays: 2 },
  ...extra,
});

// Overdue and important, so it ranks first.
const INVOICE = task({
  id: 'invoice',
  title: 'Pay the invoice',
  due: { date: '2026-10-01' },
  estimateMinutes: 30,
  important: true,
  createdAt: 1,
});

const DENTIST = task({
  id: 'dentist',
  title: 'Call the dentist',
  estimateMinutes: 20,
  important: true,
  createdAt: 2,
});

const PLANTS = task({
  id: 'plants',
  title: 'Water the plants',
  estimateMinutes: 1,
  important: false,
  createdAt: 3,
});

const FLIGHTS = task({
  id: 'flights',
  title: 'Book flights',
  availableFrom: { date: '2026-10-10' },
  estimateMinutes: 10,
  createdAt: 4,
});

// Available from tomorrow 09:00 in the test zone, so Waiting reads "Next Available tomorrow 09:00".
const VISA = task({
  id: 'visa',
  title: 'Collect the visa',
  availableFrom: { date: '2026-10-05', time: '09:00' },
  estimateMinutes: 15,
  createdAt: 6,
});

// Overdue and blocked by the dentist call.
const REPORT = task({
  id: 'report',
  title: 'Send the report',
  due: { date: '2026-10-01' },
  estimateMinutes: 45,
  createdAt: 5,
});

const FULL = domainState([INVOICE, DENTIST, PLANTS, FLIGHTS, REPORT], {
  links: [{ id: 'l1', taskId: 'report', blockerId: 'dentist' }],
});

// Active at every minute of the week, so an Area never moves a Task out of the ranking.
const ALL_DAY: ActiveHours = {
  [IsoWeekday.Monday]: [[0, 1440]],
  [IsoWeekday.Tuesday]: [[0, 1440]],
  [IsoWeekday.Wednesday]: [[0, 1440]],
  [IsoWeekday.Thursday]: [[0, 1440]],
  [IsoWeekday.Friday]: [[0, 1440]],
  [IsoWeekday.Saturday]: [[0, 1440]],
  [IsoWeekday.Sunday]: [[0, 1440]],
};

const area = (id: string, name: string): Area => ({
  id,
  name,
  activeHours: ALL_DAY,
  defaultPrivacy: null,
  version: 1,
});

const HOME = area('home', 'Home');

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

/** What a sighted person reads: the text without the icons and the visually hidden parts. */
const visibleText = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;

  for (const part of Array.from(copy.querySelectorAll('svg, .asys-visually-hidden'))) {
    part.remove();
  }

  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

const without = (state: DomainState, ...ids: string[]): DomainState => ({
  ...state,
  tasks: state.tasks.filter((t) => !ids.includes(t.id)),
});

const EXIT_KEYFRAMES = [
  { translate: '0 0', opacity: 1 },
  { translate: '100% 0', opacity: 0 },
];

const RISE_KEYFRAMES = [
  { opacity: 0, translate: '0 8px' },
  { opacity: 1, translate: '0 0' },
];

interface Play {
  readonly el: Element;
  readonly keyframes: unknown;
  readonly options: unknown;
  /** The title the card showed, and the inline opacity it had, when the play started. */
  readonly title: string | null;
  readonly opacity: string | null;
}

/** The handlers of Now that jsdom never reaches through the template. */
interface NowInternals {
  done(task: Task, origin?: DoneOrigin, keyboard?: boolean): unknown;
  expand(event: AnimationCallbackEvent, id: string): unknown;
  collapse(event: AnimationCallbackEvent): unknown;
}

interface SetupOptions {
  readonly state?: DomainState | null;
  readonly status?: SyncStatus;
  /** What `Motion.allowed()` answers; false unless a case needs the exit phase. */
  readonly allowed?: boolean;
  /** Whether `Motion.play` stays pending until `motion.release()`. */
  readonly hold?: boolean;
  /** The value of `DoneUndo.undone` when Now is created. */
  readonly undone?: DoneUndone | null;
  /** Whether Now gets the real `Motion` instead of the fake; `allowed` and `hold` then do nothing. */
  readonly realMotion?: boolean;
}

const fakeAnimationEvent = (height = 56) => {
  const target = document.createElement('li');

  Object.defineProperty(target, 'offsetHeight', { configurable: true, value: height });

  const animationComplete = vi.fn();

  return {
    target,
    animationComplete,
    event: { target, animationComplete } as unknown as AnimationCallbackEvent,
  };
};

const swipeOf = (el: DebugElement): SwipeActions => el.componentInstance as SwipeActions;

const setup = async (options: SetupOptions = {}) => {
  const state = signal<DomainState | null>(options.state === undefined ? FULL : options.state);
  const status = signal<SyncStatus>(options.status ?? SyncStatus.Ready);
  const awaitingSync = signal<ReadonlySet<string>>(new Set());
  const clockNow = signal<Instant>(T0);
  const now = computed(() => {
    const s = state();

    return s === null ? null : pick(s.tasks, s.links, s.areas, s.settings, clockNow());
  });
  const sends: ReturnType<typeof deferred<CommandOutcome>>[] = [];
  const send = vi.fn<(command: Command, key?: string) => Promise<CommandOutcome>>(() => {
    const d = deferred<CommandOutcome>();

    sends.push(d);

    return d.promise;
  });
  const refresh = vi.fn<() => void>();
  let counter = 0;
  const next = vi.fn<() => string>(() => `key-${++counter}`);
  const handleError = vi.fn<(error: unknown) => void>();
  const pending = signal<PendingDone | null>(null);
  const undone = signal<DoneUndone | null>(options.undone ?? null);
  // As a hold would: the Task disappears from the state at once.
  const complete = vi.fn<(task: Task, origin: DoneOrigin) => void>((done) => {
    state.update((s) => (s === null ? s : without(s, done.id)));
  });
  const requestFocus = vi.fn<() => void>();
  const doneUndo = { complete, requestFocus, pending, undone };
  const plays: Play[] = [];
  const held: ReturnType<typeof deferred<void>>[] = [];
  let holding = options.hold ?? false;
  const play = vi.fn((el: Element, keyframes: unknown, playOptions: unknown): Promise<void> => {
    plays.push({
      el,
      keyframes,
      options: playOptions,
      title: el.querySelector('.asys-top-pick__title-text')?.textContent?.trim() ?? null,
      opacity: el instanceof HTMLElement ? el.style.opacity : null,
    });

    if (!holding) {
      return Promise.resolve();
    }

    const d = deferred<void>();

    held.push(d);

    return d.promise;
  });
  const motion = {
    plays,
    play,
    /** Resolves every pending play, and lets later ones resolve at once. */
    release: (): void => {
      holding = false;
      held.splice(0).forEach((d) => d.resolve());
    },
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: DataStore, useValue: { state, status, awaitingSync, now, send, refresh } },
      { provide: DoneUndo, useValue: doneUndo },
      ...(options.realMotion === true
        ? []
        : [
            {
              provide: Motion,
              useValue: {
                allowed: () => options.allowed ?? false,
                reduced: signal(false),
                play,
                // The real `leave` over the fake `play`: it only uses `this.play`.
                leave: Motion.prototype.leave,
              },
            },
          ]),
      { provide: Clock, useValue: { now: clockNow } },
      { provide: Ids, useValue: { next } },
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  });

  const fixture = TestBed.createComponent(Now);

  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const text = (el: Element = root()): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const nowHeader = (): HTMLElement => must(root().querySelector('asys-now-header'));
  const heading = (): HTMLElement => must(root().querySelector('asys-now-header h1'));
  const moreLink = (): HTMLAnchorElement => must(root().querySelector('asys-now-header a'));
  const statusLine = (): HTMLElement => must(root().querySelector('p.now__status'));
  const topPick = (): HTMLElement | null => root().querySelector('asys-top-pick');
  // The title text carries the Task id and morph hooks; the link around it takes focus.
  const topTitle = (): HTMLElement => must(root().querySelector('.asys-top-pick__title-text'));
  const topLink = (): HTMLAnchorElement => must(root().querySelector('a.asys-top-pick__link'));
  const topFacts = (): HTMLElement[] =>
    Array.from(root().querySelectorAll('asys-top-pick ul.asys-facts > li'));
  const topButton = (name: string): HTMLButtonElement | undefined =>
    Array.from(topPick()?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === name,
    );
  const click = async (el: HTMLElement | undefined): Promise<void> => {
    must(el).click();
    await settle();
  };
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement | undefined): Promise<void> => {
    must(el).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await settle();
  };
  const article = (): HTMLElement => must(root().querySelector('.asys-top-pick'));
  const internals = (): NowInternals => fixture.componentInstance as unknown as NowInternals;
  const form = (): HTMLFormElement | null => root().querySelector('asys-log-progress-form form');
  const formInput = (): HTMLInputElement | null =>
    root().querySelector('asys-log-progress-form input');
  const formButton = (name: string): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll('asys-log-progress-form button')).find(
      (b) => (b.textContent ?? '').trim() === name,
    ) as HTMLButtonElement | undefined;
  const typeIntoForm = async (value: string): Promise<void> => {
    must(formInput()).value = value;
    must(formInput()).dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  // The ranked list only: the Waiting list is also a `ul.now__list`, inside the section card.
  const rankedList = (): HTMLElement | null =>
    root().querySelector('ul.now__list:not(.now__list--waiting)');
  const rows = (): HTMLAnchorElement[] =>
    Array.from(
      root().querySelectorAll<HTMLAnchorElement>(
        'ul.now__list:not(.now__list--waiting) a.asys-picker-row',
      ),
    );
  const waitingSection = (): HTMLElement | null =>
    root().querySelector('asys-section-header section.asys-section');
  const waitingHeader = (): HTMLButtonElement | null =>
    root().querySelector('asys-section-header button');
  const waitingBody = (): HTMLElement | null =>
    root().querySelector('asys-section-header .asys-section__body');
  const waitingList = (): HTMLElement | null => root().querySelector('ul.now__list--waiting');
  const waitingRows = (): HTMLAnchorElement[] =>
    Array.from(
      root().querySelectorAll<HTMLAnchorElement>('ul.now__list--waiting a.asys-picker-row'),
    );
  const waitingSummaryText = (): string | undefined =>
    root().querySelector('asys-section-header .asys-section-header__summary')?.textContent?.trim();
  const swipes = (): DebugElement[] => fixture.debugElement.queryAll(By.directive(SwipeActions));
  const swipe = (id: string): DebugElement =>
    must(
      swipes().find((s) => swipeOf(s).taskId() === id),
      `swipe for ${id}`,
    );
  const topSwipe = (): DebugElement =>
    must(fixture.debugElement.query(By.css('asys-swipe-actions.now__top-swipe')), 'top swipe');
  // As the gesture would: a commit of the swipe for `id` emits the id it recorded, here `emitted`.
  const swipeEnd = async (id: string, emitted = id): Promise<void> => {
    swipeOf(swipe(id)).commitEnd.emit(emitted);
    await settle();
  };
  const swipeStart = async (id: string, emitted = id): Promise<void> => {
    swipeOf(swipe(id)).commitStart.emit(emitted);
    await settle();
  };
  const rowLink = (id: string): HTMLAnchorElement =>
    must(
      rows().find((a) => a.getAttribute('href') === `/tasks/${id}`),
      `row link for ${id}`,
    );
  const rowItem = (id: string): HTMLElement =>
    must(rowLink(id).closest('li'), `row item for ${id}`);

  return {
    fixture,
    state,
    status,
    awaitingSync,
    clockNow,
    now: () => must(now()),
    send,
    sends,
    refresh,
    next,
    handleError,
    doneUndo,
    motion,
    internals,
    article,
    press,
    root,
    text,
    settle,
    nowHeader,
    heading,
    moreLink,
    statusLine,
    topPick,
    topTitle,
    topLink,
    topFacts,
    topButton,
    click,
    form,
    formInput,
    formButton,
    typeIntoForm,
    rankedList,
    rows,
    waitingSection,
    waitingHeader,
    waitingBody,
    waitingList,
    waitingRows,
    waitingSummaryText,
    swipes,
    swipe,
    topSwipe,
    swipeEnd,
    swipeStart,
    rowLink,
    rowItem,
  };
};

describe('Now', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('without state', () => {
    it('shows Loading… and no alert while there is no state', async () => {
      const { root, text } = await setup({ state: null, status: SyncStatus.Loading });

      expect(text()).toContain('Loading…');
      expect(root().querySelector('[role="alert"]')).toBeNull();
      expect(root().querySelector('asys-top-pick')).toBeNull();
    });

    it.each([SyncStatus.Idle, SyncStatus.Ready, SyncStatus.Stale])(
      'shows Loading… for status %s',
      async (status) => {
        const { text } = await setup({ state: null, status });

        expect(text()).toContain('Loading…');
        expect(text()).not.toContain('Nothing to show yet.');
      },
    );

    it('shows an alert and Try again when loading failed, and Try again refreshes', async () => {
      const { root, text, topButton, refresh, settle } = await setup({
        state: null,
        status: SyncStatus.Failed,
      });

      expect(root().querySelector('p[role="alert"]')?.textContent?.trim()).toBe(
        'ASYS could not load your Tasks.',
      );
      expect(text()).not.toContain('Loading…');

      const retry = Array.from(root().querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Try again',
      );

      must(retry).click();
      await settle();

      expect(refresh).toHaveBeenCalledTimes(1);
      expect(topButton('Done')).toBeUndefined();
    });

    it('always has the heading and an empty status line', async () => {
      const { heading, statusLine, text } = await setup({ state: null });

      expect(text(heading())).toMatch(/^Now, \S/);
      expect(heading().tagName).toBe('H1');
      expect(heading().getAttribute('tabindex')).toBe('-1');
      expect(statusLine().getAttribute('role')).toBe('status');
      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('shows the Tasks, not the alert, when there is state although the status is Failed', async () => {
      const { root, topPick } = await setup({ status: SyncStatus.Failed });

      expect(root().querySelector('[role="alert"]')).toBeNull();
      expect(topPick()).not.toBeNull();
    });
  });

  describe('the header', () => {
    const STATES: [string, SetupOptions][] = [
      ['loaded', {}],
      ['loading', { state: null, status: SyncStatus.Loading }],
      ['failed', { state: null, status: SyncStatus.Failed }],
    ];

    it.each(STATES)(
      'is the NowHeader, first in the template, in the %s state',
      async (_, options) => {
        const { root, nowHeader, heading, statusLine } = await setup(options);

        expect(root().firstElementChild).toBe(nowHeader());
        expect(root().querySelectorAll('asys-now-header')).toHaveLength(1);
        expect(root().querySelectorAll('h1')).toHaveLength(1);
        expect(heading().closest('asys-now-header')).toBe(nowHeader());
        expect(nowHeader().nextElementSibling).toBe(statusLine());
      },
    );

    it('reads Now and the moment from the clock in the zone of the Settings', async () => {
      const { heading, text } = await setup();
      const time = must(heading().querySelector('time'));

      expect(text(heading())).toBe('Now, Sun 4 Oct · 10:00');
      expect(time.getAttribute('datetime')).toBe('2026-10-04T10:00');
      expect(text(time)).toBe('Sun 4 Oct · 10:00');
    });

    it('shows another day and time when the clock says so', async () => {
      const { heading, clockNow, text, settle } = await setup();

      // Friday 9 October 2026, 14:05 in Amsterdam.
      clockNow.set(Date.parse('2026-10-09T12:05:00.000Z') as Instant);
      await settle();

      expect(text(heading())).toBe('Now, Fri 9 Oct · 14:05');
      expect(must(heading().querySelector('time')).getAttribute('datetime')).toBe(
        '2026-10-09T14:05',
      );
    });

    it('follows each tick of the clock', async () => {
      const { heading, clockNow, text, settle } = await setup();

      clockNow.set(T0 + MINUTE);
      await settle();

      expect(text(heading())).toBe('Now, Sun 4 Oct · 10:01');
      expect(must(heading().querySelector('time')).getAttribute('datetime')).toBe(
        '2026-10-04T10:01',
      );

      clockNow.set(T0 + 60 * MINUTE);
      await settle();

      expect(text(heading())).toBe('Now, Sun 4 Oct · 11:00');
    });

    it('uses the time zone of the Settings', async () => {
      const { heading, text } = await setup({
        state: domainState([INVOICE], {
          settings: { timeZone: 'America/New_York', urgencyWindowDays: 2 },
        }),
      });

      expect(text(heading())).toBe('Now, Sun 4 Oct · 04:00');
      expect(must(heading().querySelector('time')).getAttribute('datetime')).toBe(
        '2026-10-04T04:00',
      );
    });

    it('shows UTC while there is no state', async () => {
      const { heading, text } = await setup({ state: null, status: SyncStatus.Loading });

      expect(text(heading())).toBe('Now, Sun 4 Oct · 08:00');
    });

    it.each(STATES)(
      'has a More link to Settings after the heading in the %s state',
      async (_, options) => {
        const { heading, moreLink, text } = await setup(options);
        const link = moreLink();

        expect(link.getAttribute('href')).toBe('/settings');
        expect(link.getAttribute('aria-label')).toBe('More: Settings');
        expect(link.classList.contains('asys-button--icon')).toBe(true);
        expect(link.classList.contains('asys-button--quiet')).toBe(true);
        expect(link.querySelector('svg[data-icon]')?.getAttribute('data-icon')).toBe('ellipsis');
        expect(text(link)).toBe('');
        expect(heading().nextElementSibling).toBe(link);
        expect(link.parentElement).toBe(heading().parentElement);
      },
    );
  });

  describe('the status line', () => {
    it('follows the header when there is state', async () => {
      const { nowHeader, statusLine } = await setup();

      expect(nowHeader().nextElementSibling).toBe(statusLine());
      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('stays displayed while it is empty, so later messages are announced', async () => {
      const { statusLine } = await setup();

      expect(statusLine().textContent?.trim()).toBe('');
      expect(getComputedStyle(statusLine()).display).not.toBe('none');
    });

    it('follows the header without state', async () => {
      const { nowHeader, statusLine } = await setup({ state: null });

      expect(nowHeader().nextElementSibling).toBe(statusLine());
    });
  });

  describe('the top pick', () => {
    it('shows the first ranked Task with its reason from the domain, chip, estimate and badge', async () => {
      const { topPick, topTitle, topFacts, now, text } = await setup();
      const first = must(now().ranked[0]);

      expect(first.task.id).toBe('invoice');
      expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
      expect(text(must(must(topPick()).querySelector('.asys-top-pick__reason')))).toBe(
        first.reasonText,
      );
      expect(first.reasonText).toContain('Due');
      expect(first.reasonText).toContain('important');
      expect(text(must(must(topPick()).querySelector('li.asys-quadrant'))).toLowerCase()).toBe(
        `quadrant: ${first.reason.quadrant}`,
      );
      expect(must(topFacts()[0]).querySelector('.asys-num')?.textContent?.trim()).toBe('30 min');
      expect(
        must(topPick())
          .querySelector('.asys-top-pick__flags asys-status-badge')
          ?.textContent?.trim(),
      ).toBe('Overdue');
    });

    it('shows no flags and no Overdue badge for a Task that is not overdue', async () => {
      const { topPick, topTitle, topFacts, now } = await setup({ state: without(FULL, 'invoice') });

      expect(must(now().ranked[0]).task.id).toBe('dentist');
      expect(topTitle().textContent?.trim()).toBe('Call the dentist');
      expect(must(topPick()).querySelector('.asys-top-pick__flags')).toBeNull();
      expect(must(topPick()).querySelector('asys-status-badge')).toBeNull();
      expect(must(topFacts()[0]).querySelector('.asys-num')?.textContent?.trim()).toBe('20 min');
    });

    it('offers Done and Log progress, enabled, and no Open', async () => {
      const { topPick, topButton } = await setup();

      expect(
        Array.from(must(topPick()).querySelectorAll('button'), (b) => b.textContent?.trim()),
      ).toEqual(['Done', 'Log progress']);
      expect(topButton('Done')?.disabled).toBe(false);
      expect(topButton('Log progress')?.disabled).toBe(false);
      expect(topButton('Open')).toBeUndefined();
    });

    it('hides Log progress when the Estimate is 1', async () => {
      const { topButton, topTitle } = await setup({
        state: without(FULL, 'invoice', 'dentist', 'report'),
      });

      expect(topTitle().textContent?.trim()).toBe('Water the plants');
      expect(topButton('Done')).toBeDefined();
      expect(topButton('Log progress')).toBeUndefined();
    });

    it('shows Log progress for an Estimate of 2', async () => {
      const { topButton } = await setup({
        state: domainState([task({ id: 't', title: 'Two minutes', estimateMinutes: 2 })]),
      });

      expect(topButton('Log progress')).toBeDefined();
    });

    it('links the title to the Task, with href /tasks/<id>', async () => {
      const { topLink, topPick } = await setup();

      expect(topLink().getAttribute('href')).toBe('/tasks/invoice');
      expect(topLink().textContent?.trim()).toBe('Pay the invoice');
      expect(topLink().closest('h2')).not.toBeNull();
      expect(must(topPick()).querySelectorAll('a')).toHaveLength(1);
    });

    it('points the title link at the next Task once the top pick changes', async () => {
      const { state, topLink, settle } = await setup();

      state.set(without(FULL, 'invoice'));
      await settle();

      expect(topLink().getAttribute('href')).toBe('/tasks/dentist');
      expect(topLink().textContent?.trim()).toBe('Call the dentist');
    });

    describe('the Area', () => {
      const withArea = (areaId: string | null, ...areas: Area[]): DomainState =>
        domainState([task({ id: 'tap', title: 'Fix the tap', areaId })], { areas });

      const kinds = (facts: HTMLElement[]): string[] =>
        facts.map((li) =>
          li.matches('.asys-quadrant')
            ? 'quadrant'
            : (li.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? ''),
        );

      it('is the name of the Area of the Task, between the Estimate and the quadrant', async () => {
        const { topFacts, text } = await setup({ state: withArea('home', HOME) });
        const fact = must(topFacts()[1]);

        expect(kinds(topFacts())).toEqual(['stopwatch', 'folder', 'quadrant']);
        expect(text(must(fact.querySelector('.asys-visually-hidden')))).toBe('Area:');
        expect(visibleText(fact)).toBe('Home');
      });

      it('is picked by id among the Areas', async () => {
        const { topFacts } = await setup({
          state: withArea('home', area('work', 'Work'), HOME, area('other', 'Other')),
        });

        expect(topFacts()[1]?.textContent).toContain('Home');
        expect(topFacts()[1]?.textContent).not.toContain('Work');
        expect(topFacts()[1]?.textContent).not.toContain('Other');
      });

      it('is absent for a Task without an Area', async () => {
        const { topFacts } = await setup({ state: withArea(null, HOME) });

        expect(kinds(topFacts())).toEqual(['stopwatch', 'quadrant']);
      });

      it('is absent when no listed Area has the id of the Task', async () => {
        const { topTitle, topFacts } = await setup({ state: withArea('gone', HOME) });

        expect(topTitle().textContent?.trim()).toBe('Fix the tap');
        expect(kinds(topFacts())).toEqual(['stopwatch', 'quadrant']);
      });

      it('follows the store when the Area is renamed', async () => {
        const { state, topFacts, settle } = await setup({ state: withArea('home', HOME) });

        state.update((s) => ({ ...must(s), areas: [{ ...HOME, name: 'House' }] }));
        await settle();

        expect(topFacts()[1]?.textContent).toContain('House');
        expect(topFacts()[1]?.textContent).not.toContain('Home');
      });
    });

    describe('the Due fact', () => {
      const dangerOf = (topPick: () => HTMLElement | null): HTMLElement[] =>
        Array.from(must(topPick()).querySelectorAll('.asys-top-pick__reason .asys-danger-text'));

      it('is drawn in danger for an Overdue Task, the reason text staying whole', async () => {
        const { topPick, now, text } = await setup();
        const first = must(now().ranked[0]);
        const fact = reasonFact(first.task, first.reason, T0, ZONE);
        const reason = must(must(topPick()).querySelector('.asys-top-pick__reason'));

        expect(first.reason.overdue).toBe(true);
        expect(fact).toContain('Due');
        expect(first.reasonText.startsWith(fact)).toBe(true);
        expect(dangerOf(topPick)).toHaveLength(1);
        expect(dangerOf(topPick)[0]?.textContent).toBe(fact);
        expect(text(reason)).toBe(first.reasonText);
      });

      it('is not drawn for a Task that is not overdue', async () => {
        const { topPick, now, text } = await setup({ state: without(FULL, 'invoice') });
        const first = must(now().ranked[0]);

        expect(first.reason.overdue).toBe(false);
        expect(dangerOf(topPick)).toEqual([]);
        expect(text(must(must(topPick()).querySelector('.asys-top-pick__reason')))).toBe(
          first.reasonText,
        );
      });

      it('follows the clock: a Task becoming overdue takes the danger fact', async () => {
        const steady = task({ id: 'steady', title: 'Steady one', createdAt: 1 });
        const early = task({
          id: 'early',
          title: 'Early bird',
          important: false,
          due: { date: '2026-10-04', time: '10:15' },
          estimateMinutes: 20,
          createdAt: 2,
        });
        const { topPick, clockNow, now, settle } = await setup({
          state: domainState([steady, early]),
        });

        expect(dangerOf(topPick)).toEqual([]);

        clockNow.set(T0 + 16 * MINUTE);
        await settle();

        const first = must(now().ranked[0]);

        expect(first.task.id).toBe('early');
        expect(dangerOf(topPick)).toHaveLength(1);
        expect(dangerOf(topPick)[0]?.textContent).toBe(
          reasonFact(first.task, first.reason, T0 + 16 * MINUTE, ZONE),
        );
      });
    });
  });

  describe('when the server has not confirmed yet', () => {
    it('shows Saved. Waiting for the server. in the top pick and disables its actions', async () => {
      const { topPick, topButton, awaitingSync, settle } = await setup();

      expect(must(topPick()).querySelector('p[asys-sync-note]')).toBeNull();

      awaitingSync.set(new Set(['invoice']));
      await settle();

      expect(must(topPick()).querySelector('p[asys-sync-note]')?.textContent?.trim()).toBe(
        'Saved. Waiting for the server.',
      );
      expect(topButton('Done')?.disabled).toBe(true);
      expect(topButton('Log progress')?.disabled).toBe(true);
    });

    it('ignores ids of other Tasks', async () => {
      const { topPick, topButton, awaitingSync, settle } = await setup();

      awaitingSync.set(new Set(['dentist']));
      await settle();

      expect(must(topPick()).querySelector('p[asys-sync-note]')).toBeNull();
      expect(topButton('Done')?.disabled).toBe(false);
    });

    it('sends and holds nothing for Done', async () => {
      const { doneUndo, internals, topButton, awaitingSync, send, press, settle } = await setup();

      awaitingSync.set(new Set(['invoice']));
      await press(topButton('Done'));
      await internals().done(INVOICE, DoneOrigin.Button, false);
      await settle();

      expect(send).not.toHaveBeenCalled();
      expect(doneUndo.complete).not.toHaveBeenCalled();
    });

    it('shows the note before the Log progress form', async () => {
      const { topPick, topButton, click, awaitingSync, settle } = await setup();

      await click(topButton('Log progress'));
      awaitingSync.set(new Set(['invoice']));
      await settle();

      const note = must(must(topPick()).querySelector('p[asys-sync-note]'));
      const form = must(must(topPick()).querySelector('asys-log-progress-form'));

      expect(note.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('with nothing ranked', () => {
    it('says Nothing to do right now. and has no top pick, no list and no Triage line', async () => {
      const { root, topPick, rankedList } = await setup({ state: domainState([]) });

      expect(root().querySelector('p.now__text')?.textContent?.trim()).toBe(
        'Nothing to do right now.',
      );
      expect(topPick()).toBeNull();
      expect(rankedList()).toBeNull();
      expect(root().querySelector('a[href="/inbox"]')).toBeNull();
    });

    it('links to the Inbox for one Task that waits for Triage', async () => {
      const { root } = await setup({
        state: domainState([task({ id: 'x', title: 'X', important: null })]),
      });
      const link = must(root().querySelector('p.now__text a'));

      expect(link.getAttribute('href')).toBe('/inbox');
      expect(link.textContent?.trim()).toBe('1 Task waits for Triage.');
    });

    it('links to the Inbox for several Tasks that wait for Triage', async () => {
      const { root } = await setup({
        state: domainState([
          task({ id: 'x', title: 'X', important: null }),
          task({ id: 'y', title: 'Y', estimateMinutes: null, createdAt: 2 }),
        ]),
      });

      expect(root().querySelector('p.now__text a')?.textContent?.trim()).toBe(
        '2 Tasks wait for Triage.',
      );
    });

    it('does not count Review items', async () => {
      const { root } = await setup({
        state: domainState([], {
          reviewItems: [
            {
              id: 'r1',
              kind: 'whatever',
              subjects: [],
              payload: null,
              dedupeKey: null,
              createdAt: 1,
              resolvedAt: null,
            },
          ],
        }),
      });

      expect(root().querySelector('a[href="/inbox"]')).toBeNull();
    });

    it('does not say it when a Task is ranked', async () => {
      const { text } = await setup();

      expect(text()).not.toContain('Nothing to do right now.');
    });
  });

  describe('the other ranked Tasks', () => {
    it('are rows in rank order that link to their Task', async () => {
      const { rows, now } = await setup();

      expect(now().ranked.map((r) => r.task.id)).toEqual(['invoice', 'dentist', 'plants']);
      expect(rows().map((a) => a.getAttribute('href'))).toEqual([
        '/tasks/dentist',
        '/tasks/plants',
      ]);
      expect(
        rows().map((a) => a.querySelector('.asys-picker-row__title')?.textContent?.trim()),
      ).toEqual(['Call the dentist', 'Water the plants']);
    });

    it('show the reason from the domain, the estimate and a compact quadrant chip in the reason', async () => {
      const { rows, now } = await setup();
      const [dentist, plants] = now().ranked.slice(1);
      const chipOf = (row: HTMLAnchorElement | undefined): Element | null | undefined =>
        row?.querySelector('.asys-picker-row__reason asys-quadrant-chip');

      expect(
        must(rows()[0]).querySelector('.asys-picker-row__reason-text')?.textContent?.trim(),
      ).toBe(must(dentist).reasonText);
      expect(
        must(rows()[1]).querySelector('.asys-picker-row__reason-text')?.textContent?.trim(),
      ).toBe(must(plants).reasonText);
      expect(must(rows()[0]).querySelector('.asys-picker-row__estimate')?.textContent?.trim()).toBe(
        '20 min',
      );
      expect(must(rows()[1]).querySelector('.asys-picker-row__estimate')?.textContent?.trim()).toBe(
        '1 min',
      );
      expect(chipOf(rows()[0])?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase()).toBe(
        `quadrant: ${must(dentist).reason.quadrant}.`,
      );
      expect(chipOf(rows()[1])?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase()).toBe(
        `quadrant: ${must(plants).reason.quadrant}.`,
      );
      expect(must(dentist).reason.quadrant).not.toBe(must(plants).reason.quadrant);
      expect(rows().every((a) => chipOf(a)?.classList.contains('asys-quadrant--compact'))).toBe(
        true,
      );
      expect(
        rows().some((a) => a.querySelector('.asys-picker-row__side asys-quadrant-chip') !== null),
      ).toBe(false);
    });

    it('show an Overdue badge only for overdue Tasks', async () => {
      const { rows, now } = await setup({
        state: domainState([
          INVOICE,
          task({ id: 'second', title: 'Second late', due: { date: '2026-10-02' }, createdAt: 2 }),
          DENTIST,
        ]),
      });

      expect(now().ranked.map((r) => r.reason.overdue)).toEqual([true, true, false]);
      expect(
        rows().map((a) => a.querySelector('asys-status-badge')?.textContent?.trim() ?? null),
      ).toEqual(['Overdue', null]);
    });

    it('are absent when only the top pick is ranked', async () => {
      const { rankedList } = await setup({ state: domainState([INVOICE]) });

      expect(rankedList()).toBeNull();
    });

    it('stay absent when only the top pick is ranked, although Tasks wait', async () => {
      const { rankedList, waitingList, waitingHeader, click } = await setup({
        state: domainState([INVOICE, FLIGHTS]),
      });

      await click(must(waitingHeader()));

      expect(rankedList()).toBeNull();
      expect(waitingList()).not.toBeNull();
    });

    it('follow the clock: a Task becoming overdue moves up', async () => {
      const early = task({
        id: 'early',
        title: 'Early bird',
        important: false,
        due: { date: '2026-10-04', time: '10:15' },
        estimateMinutes: 20,
        createdAt: 2,
      });
      const { topTitle, clockNow, settle } = await setup({
        state: domainState([task({ id: 'steady', title: 'Steady one', createdAt: 1 }), early]),
      });

      expect(topTitle().textContent?.trim()).toBe('Steady one');

      clockNow.set(T0 + 16 * MINUTE);
      await settle();

      expect(topTitle().textContent?.trim()).toBe('Early bird');
    });
  });

  describe('Waiting', () => {
    it('has no section when nothing waits', async () => {
      const { root, waitingHeader, waitingSection } = await setup({
        state: domainState([INVOICE]),
      });

      expect(waitingHeader()).toBeNull();
      expect(waitingSection()).toBeNull();
      expect(root().querySelector('asys-section-header')).toBeNull();
    });

    it('shows a collapsed section card with the hourglass, the title and the count', async () => {
      const { waitingSection, waitingHeader, waitingBody, waitingList, waitingRows, text } =
        await setup();
      const header = must(waitingHeader());
      const title = must(header.querySelector('.asys-section-header__title'));

      expect(must(waitingSection()).getAttribute('aria-label')).toBe('Waiting');
      expect(
        header
          .querySelector('.asys-section-header__icon svg[data-icon]')
          ?.getAttribute('data-icon'),
      ).toBe('hourglass-half');
      expect(text(title)).toMatch(/^Waiting\s*2$/);
      expect(title.querySelector('.asys-section-header__count')?.textContent?.trim()).toBe('2');
      expect(header.getAttribute('aria-expanded')).toBe('false');
      expect(header.getAttribute('aria-controls')).toBe(must(waitingBody()).id);
      expect(must(waitingBody()).hidden).toBe(true);
      expect(waitingList()).toBeNull();
      expect(waitingRows()).toEqual([]);
      expect(text()).not.toContain('Book flights');
      expect(text()).not.toContain('Send the report');
    });

    it('puts the Waiting list inside the section body once expanded', async () => {
      const { waitingSection, waitingHeader, waitingBody, waitingList, waitingRows, rows, click } =
        await setup();

      await click(must(waitingHeader()));

      const body = must(waitingBody());
      const list = must(waitingList());

      expect(must(waitingHeader()).getAttribute('aria-expanded')).toBe('true');
      expect(body.hidden).toBe(false);
      expect(body.closest('section.asys-section')).toBe(waitingSection());
      expect(list.classList.contains('now__list')).toBe(true);
      expect(list.classList.contains('now__list--waiting')).toBe(true);
      expect(list.closest('.asys-section__body')).toBe(body);
      expect(waitingRows()).toHaveLength(2);
      expect(waitingRows().every((a) => body.contains(a))).toBe(true);
      expect(rows().some((a) => body.contains(a))).toBe(false);
    });

    it('keeps the Waiting rows out of the ranked rows, and the ranked rows out of the card', async () => {
      const { root, waitingHeader, waitingSection, waitingRows, rows, click } = await setup();

      await click(must(waitingHeader()));

      expect(rows().map((a) => a.getAttribute('href'))).toEqual([
        '/tasks/dentist',
        '/tasks/plants',
      ]);
      expect(waitingRows().map((a) => a.getAttribute('href'))).toEqual([
        '/tasks/flights',
        '/tasks/report',
      ]);
      expect(
        must(root().querySelector('ul.now__list:not(.now__list--waiting)')).closest(
          'asys-section-header',
        ),
      ).toBeNull();
      expect(rows().some((a) => must(waitingSection()).contains(a))).toBe(false);
    });

    it('lists the Tasks that wait with their reason and estimate when expanded', async () => {
      const { waitingHeader, click, waitingRows, now } = await setup();

      await click(must(waitingHeader()));

      const rows = waitingRows();
      const [flights, report] = now().waiting;

      expect(rows.every((a) => a.classList.contains('asys-picker-row--waiting'))).toBe(true);
      expect(rows.map((a) => a.getAttribute('href'))).toEqual(['/tasks/flights', '/tasks/report']);
      expect(
        rows.map((a) => a.querySelector('.asys-picker-row__title')?.textContent?.trim()),
      ).toEqual(['Book flights', 'Send the report']);
      expect(
        must(rows[0]).querySelector('.asys-picker-row__reason-text')?.textContent?.trim(),
      ).toBe(must(flights).reasonText);
      expect(must(flights).reasonText).toContain('Available from');
      expect(
        must(rows[1]).querySelector('.asys-picker-row__reason-text')?.textContent?.trim(),
      ).toBe(must(report).reasonText);
      expect(must(report).reasonText).toContain('Blocked by Call the dentist');
      expect(
        rows.map((a) => a.querySelector('.asys-picker-row__estimate')?.textContent?.trim()),
      ).toEqual(['10 min', '45 min']);
    });

    it('shows no quadrant chip and an Overdue badge only for overdue Tasks', async () => {
      const { waitingHeader, click, waitingRows } = await setup();

      await click(must(waitingHeader()));

      const rows = waitingRows();
      const reasonKinds = (row: HTMLAnchorElement | undefined): string[] =>
        Array.from(must(row).querySelector('.asys-picker-row__reason')?.children ?? [], (c) =>
          c.tagName === 'ASYS-STATUS-BADGE' ? 'badge' : 'text',
        );

      expect(rows).toHaveLength(2);
      expect(rows.every((a) => a.querySelector('asys-quadrant-chip') === null)).toBe(true);
      expect(
        rows.map((a) => a.querySelector('asys-status-badge')?.textContent?.trim() ?? null),
      ).toEqual([null, 'Overdue']);
      expect(reasonKinds(rows[0])).toEqual(['text']);
      expect(reasonKinds(rows[1])).toEqual(['badge', 'text']);
    });

    it('collapses again', async () => {
      const { waitingHeader, waitingBody, waitingList, waitingRows, click, text } = await setup();

      await click(must(waitingHeader()));
      await click(must(waitingHeader()));

      expect(must(waitingHeader()).getAttribute('aria-expanded')).toBe('false');
      expect(must(waitingBody()).hidden).toBe(true);
      expect(waitingList()).toBeNull();
      expect(waitingRows()).toEqual([]);
      expect(text()).not.toContain('Book flights');
    });

    it('is shown even when no Task is ranked', async () => {
      const { waitingHeader, text } = await setup({ state: domainState([FLIGHTS]) });

      expect(waitingHeader()).not.toBeNull();
      expect(text()).toContain('Nothing to do right now.');
    });

    describe('the summary', () => {
      it('reads the next Available from beside the title, collapsed and expanded', async () => {
        const { waitingHeader, waitingSummaryText, click, now } = await setup();
        const summary = (): Element | null | undefined =>
          waitingHeader()?.querySelector('.asys-section-header__summary');

        expect(waitingSummaryText()).toBe('Next Available Sat 10 Oct');
        expect(waitingSummaryText()).toBe(waitingSummary(now().waiting, T0, ZONE));
        expect(summary()?.parentElement?.classList.contains('asys-section-header__text')).toBe(
          true,
        );

        await click(must(waitingHeader()));

        expect(must(waitingHeader()).getAttribute('aria-expanded')).toBe('true');
        expect(waitingSummaryText()).toBe('Next Available Sat 10 Oct');
      });

      it('reads Next Available tomorrow 09:00 for a Task Available from tomorrow 09:00', async () => {
        const { waitingHeader, waitingSummaryText, waitingRows, click, now } = await setup({
          state: domainState([DENTIST, VISA]),
        });

        expect(now().waiting.map((w) => w.task.id)).toEqual(['visa']);
        expect(waitingSummaryText()).toBe('Next Available tomorrow 09:00');

        await click(must(waitingHeader()));

        expect(
          must(waitingRows()[0])
            .querySelector('.asys-picker-row__reason-text')
            ?.textContent?.trim(),
        ).toBe('Available from tomorrow 09:00');
      });

      it('follows the clock and the time zone of the Settings, and goes with the section', async () => {
        const { clockNow, waitingSection, waitingSummaryText, settle } = await setup({
          state: domainState([DENTIST, VISA]),
        });

        expect(waitingSummaryText()).toBe('Next Available tomorrow 09:00');

        // Monday 5 October, 01:30 in Amsterdam, but still Sunday in UTC.
        clockNow.set(Date.parse('2026-10-04T23:30:00.000Z') as Instant);
        await settle();

        expect(waitingSummaryText()).toBe('Next Available today 09:00');

        // 09:30 in Amsterdam: the Task is Available and no longer waits.
        clockNow.set(Date.parse('2026-10-05T07:30:00.000Z') as Instant);
        await settle();

        expect(waitingSection()).toBeNull();
        expect(waitingSummaryText()).toBeUndefined();
      });

      it('shows no summary for a Waiting list that is only Blocked', async () => {
        const { waitingHeader, waitingSummaryText, now } = await setup({
          state: domainState([DENTIST, REPORT], {
            links: [{ id: 'l1', taskId: 'report', blockerId: 'dentist' }],
          }),
        });
        const text = must(waitingHeader()).querySelector('.asys-section-header__text');

        expect(now().waiting.map((w) => w.task.id)).toEqual(['report']);
        expect(waitingSummaryText()).toBeUndefined();
        expect(must(waitingHeader()).querySelector('.asys-section-header__summary')).toBeNull();
        expect(Array.from(must(text).children, (c) => c.className)).toEqual([
          'asys-section-header__title',
        ]);
        expect(
          must(waitingHeader()).querySelector('.asys-section-header__count')?.textContent?.trim(),
        ).toBe('1');
      });
    });
  });

  describe('Done', () => {
    it('hands the Task to DoneUndo as a Button Done and sends nothing itself', async () => {
      const { doneUndo, send, topButton, press } = await setup();

      await press(topButton('Done'));

      expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(INVOICE, DoneOrigin.Button);
      expect(doneUndo.requestFocus).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    });

    it('shows a check and Done in place of the actions while the exit is playing', async () => {
      const { doneUndo, motion, topPick, topTitle, topButton, press } = await setup({
        allowed: true,
        hold: true,
      });

      await press(topButton('Done'));

      expect(doneUndo.complete).toHaveBeenCalledTimes(1);
      expect(topPick()).not.toBeNull();
      expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
      expect(must(topPick()).querySelector('.asys-top-pick__done')?.textContent?.trim()).toBe(
        'Done',
      );
      expect(topButton('Done')).toBeUndefined();
      expect(topButton('Log progress')).toBeUndefined();

      motion.release();
    });

    it('marks the leaving card inert and with data-leaving, and only while it leaves', async () => {
      const { motion, topPick, topButton, press, settle } = await setup({
        allowed: true,
        hold: true,
      });

      expect(must(topPick()).hasAttribute('inert')).toBe(false);
      expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);

      await press(topButton('Done'));

      expect(must(topPick()).hasAttribute('inert')).toBe(true);
      expect(must(topPick()).hasAttribute('data-leaving')).toBe(true);

      motion.release();
      await settle();

      expect(must(topPick()).hasAttribute('inert')).toBe(false);
      expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
    });

    it('keeps the promoted Task as a row while the old card leaves, and shows it once only', async () => {
      const { motion, rows, topButton, press, settle } = await setup({
        allowed: true,
        hold: true,
      });

      await press(topButton('Done'));

      expect(rows().map((a) => a.getAttribute('href'))).toEqual([
        '/tasks/dentist',
        '/tasks/plants',
      ]);

      motion.release();
      await settle();

      expect(rows().map((a) => a.getAttribute('href'))).toEqual(['/tasks/plants']);
    });

    it('plays the exit on the card after 100 ms, then the rise on the new content', async () => {
      const { motion, article, topTitle, topButton, press } = await setup({ allowed: true });
      const card = article();

      await press(topButton('Done'));

      const [exit, rise] = motion.plays;

      expect(motion.plays).toHaveLength(2);
      expect(must(exit).el).toBe(card);
      expect(must(exit).keyframes).toEqual(EXIT_KEYFRAMES);
      expect(must(exit).options).toEqual({
        duration: MotionDuration.Quick,
        easing: MotionEasing.In,
        delay: 100,
      });
      expect(must(exit).title).toBe('Pay the invoice');
      expect(must(rise).el).toBe(card);
      expect(must(rise).keyframes).toEqual(RISE_KEYFRAMES);
      expect(must(rise).options).toEqual({
        duration: MotionDuration.Moderate,
        easing: MotionEasing.Out,
      });
      // The new content is rendered, and hidden until the rise starts.
      expect(must(rise).title).toBe('Call the dentist');
      expect(must(rise).opacity).toBe('0');
      expect(topTitle().textContent?.trim()).toBe('Call the dentist');
      expect(card.style.opacity).toBe('');
    });

    it('moves focus to the new top pick title once the exit is over, and clears the status line', async () => {
      const { statusLine, topTitle, topLink, topButton, press } = await setup({ allowed: true });

      await press(topButton('Done'));

      expect(statusLine().textContent?.trim()).toBe('');
      expect(topTitle().textContent?.trim()).toBe('Call the dentist');
      expect(document.activeElement).toBe(topLink());
    });

    it('still hands over to the next top pick when motion is not allowed', async () => {
      const { doneUndo, topTitle, topLink, topButton, press } = await setup({ allowed: false });

      await press(topButton('Done'));

      expect(doneUndo.complete).toHaveBeenCalledTimes(1);
      expect(topTitle().textContent?.trim()).toBe('Call the dentist');
      expect(document.activeElement).toBe(topLink());
    });

    it('leaves focus on the Undo bar for a keyboard Done and asks for it once', async () => {
      const { doneUndo, topTitle, topLink, topButton, settle } = await setup({ allowed: true });

      must(topButton('Done')).click();
      await settle();

      expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(INVOICE, DoneOrigin.Button);
      expect(doneUndo.requestFocus).toHaveBeenCalledTimes(1);
      expect(topTitle().textContent?.trim()).toBe('Call the dentist');
      expect(document.activeElement).not.toBe(topLink());
    });

    describe('when the real Motion cannot animate the card', () => {
      afterEach(() => {
        vi.restoreAllMocks();
        Reflect.deleteProperty(Element.prototype, 'animate');
        document.documentElement.style.removeProperty('--duration-quick');
        document.documentElement.style.removeProperty('--ease-in');
      });

      it('still ends the exit, so the card shows the next top pick and is not inert', async () => {
        const failure = new TypeError('Keyframes are not loosely sorted by offset');
        const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const animate = vi.fn(() => {
          throw failure;
        });

        Object.defineProperty(Element.prototype, 'animate', {
          value: animate,
          configurable: true,
          writable: true,
        });
        // Without these tokens the real Motion resolves at once and never reaches `animate`.
        document.documentElement.style.setProperty('--duration-quick', '120ms');
        document.documentElement.style.setProperty('--ease-in', 'cubic-bezier(0.3, 0, 0.8, 0.15)');

        const { doneUndo, topPick, topTitle, topLink, topButton, press } = await setup({
          realMotion: true,
        });

        await press(topButton('Done'));

        expect(animate).toHaveBeenCalledTimes(1);
        expect(doneUndo.complete).toHaveBeenCalledTimes(1);
        expect(must(topPick()).hasAttribute('inert')).toBe(false);
        expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
        expect(must(topPick()).querySelector('.asys-top-pick__done')).toBeNull();
        expect(topTitle().textContent?.trim()).toBe('Call the dentist');
        expect(document.activeElement).toBe(topLink());
        expect(report).toHaveBeenCalledExactlyOnceWith(failure);
      });
    });

    it('does nothing for a second Done of the Task that is leaving', async () => {
      const { doneUndo, motion, internals, topButton, press } = await setup({
        allowed: true,
        hold: true,
      });

      await press(topButton('Done'));
      await internals().done(INVOICE, DoneOrigin.Button, false);

      expect(doneUndo.complete).toHaveBeenCalledTimes(1);

      motion.release();
    });

    it('takes over from a running exit when a new Done arrives, and shows the next top pick', async () => {
      const { doneUndo, motion, internals, topPick, topTitle, topButton, press, settle } =
        await setup({ allowed: true, hold: true });

      await press(topButton('Done'));
      const second = internals().done(DENTIST, DoneOrigin.Button, false);
      motion.release();
      await second;
      await settle();

      expect(doneUndo.complete).toHaveBeenCalledTimes(2);
      expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
      expect(must(topPick()).hasAttribute('inert')).toBe(false);
      expect(topTitle().textContent?.trim()).toBe('Send the report');
      expect(topPick()?.querySelector('.asys-top-pick__done')).toBeNull();
      expect(
        motion.plays.some((p) => JSON.stringify(p.keyframes) === JSON.stringify(RISE_KEYFRAMES)),
      ).toBe(true);
    });

    it('takes over from a running exit for a Swipe, rising the next content and moving focus', async () => {
      const { motion, internals, topPick, topTitle, topLink, topButton, press, settle } =
        await setup({
          allowed: true,
          hold: true,
        });

      await press(topButton('Done'));
      await internals().done(DENTIST, DoneOrigin.Swipe, false);
      motion.release();
      await settle();

      expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
      expect(must(topPick()).hasAttribute('inert')).toBe(false);
      expect(topTitle().textContent?.trim()).toBe('Send the report');
      expect(
        motion.plays.some((p) => JSON.stringify(p.keyframes) === JSON.stringify(RISE_KEYFRAMES)),
      ).toBe(true);
      expect(document.activeElement).toBe(topLink());
    });

    it('shows the Task again, not leaving, when it is undone during its exit, and the exit then does nothing more', async () => {
      const { state, doneUndo, motion, topPick, topTitle, topButton, press, settle } = await setup({
        allowed: true,
        hold: true,
      });

      await press(topButton('Done'));
      state.set(FULL);
      doneUndo.undone.set({ taskId: 'invoice', seq: 1 });
      await settle();

      expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
      expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
      expect(topPick()?.querySelector('.asys-top-pick__done')).toBeNull();

      const played = motion.plays.length;

      motion.release();
      await settle();

      expect(motion.plays).toHaveLength(played);
      expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
      expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
      expect(must(topPick()).hasAttribute('inert')).toBe(false);
    });

    it('does nothing for a Done of the Task that DoneUndo already holds', async () => {
      const { doneUndo, internals, settle } = await setup();

      doneUndo.pending.set({
        taskId: 'invoice',
        title: 'Pay the invoice',
        origin: DoneOrigin.Button,
        remainingMs: 5_000,
      });
      await internals().done(INVOICE, DoneOrigin.Button, false);
      await settle();

      expect(doneUndo.complete).not.toHaveBeenCalled();
    });

    it('does nothing when the screen is destroyed while the exit is playing', async () => {
      const { fixture, motion, handleError, doneUndo, topButton, press } = await setup({
        allowed: true,
        hold: true,
      });

      await press(topButton('Done'));
      fixture.destroy();
      motion.release();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(doneUndo.requestFocus).not.toHaveBeenCalled();
      // Only the exit was played: no rise starts on a destroyed screen.
      expect(motion.plays).toHaveLength(1);
    });

    it('keeps the card while the exit plays and moves focus to the heading when no Task is ranked any more', async () => {
      const { motion, root, heading, topPick, topButton, press, settle } = await setup({
        state: domainState([INVOICE]),
        allowed: true,
        hold: true,
      });

      await press(topButton('Done'));

      expect(topPick()).not.toBeNull();
      expect(root().querySelector('.asys-top-pick__done')).not.toBeNull();
      expect(root().textContent).not.toContain('Nothing to do right now.');

      motion.release();
      await settle();

      expect(topPick()).toBeNull();
      expect(root().querySelector('p.now__text')?.textContent?.trim()).toBe(
        'Nothing to do right now.',
      );
      expect(document.activeElement).toBe(heading());
      // There is no card to rise: only the exit was played.
      expect(motion.plays).toHaveLength(1);
    });

    it('clears an earlier Log progress message', async () => {
      const { sends, statusLine, topButton, press, click, typeIntoForm, formButton, settle } =
        await setup();

      await click(topButton('Log progress'));
      await typeIntoForm('15');
      await click(formButton('Save'));
      must(sends[0]).resolve(FAILED);
      await settle();

      expect(statusLine().textContent?.trim()).not.toBe('');

      await press(topButton('Done'));

      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('shows a released Task as the top pick again, with Done enabled, and moves no focus', async () => {
      const { state, heading, topTitle, topButton, press, settle } = await setup({
        allowed: true,
      });

      await press(topButton('Done'));

      expect(topTitle().textContent?.trim()).toBe('Call the dentist');

      heading().focus();
      state.set(FULL);
      await settle();

      expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
      expect(topButton('Done')?.disabled).toBe(false);
      expect(document.activeElement).toBe(heading());
    });

    describe('on a ranked row', () => {
      it('holds that Task and leaves the card, focus and motion alone', async () => {
        const { doneUndo, motion, internals, heading, topPick, topTitle, now, settle } =
          await setup({ allowed: true });
        const plants = must(now().ranked[2]).task;

        heading().focus();
        await internals().done(plants, DoneOrigin.Button, false);
        await settle();

        expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(PLANTS, DoneOrigin.Button);
        expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
        expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
        expect(topPick()?.querySelector('.asys-top-pick__done')).toBeNull();
        expect(motion.plays).toEqual([]);
        expect(document.activeElement).toBe(heading());
      });
    });

    describe('as a Swipe', () => {
      it('skips the exit and rises the next content at once', async () => {
        const { doneUndo, motion, internals, article, root, topTitle, topLink, now, settle } =
          await setup({
            allowed: true,
            hold: true,
          });
        const card = article();
        const invoice = must(now().ranked[0]).task;

        await internals().done(invoice, DoneOrigin.Swipe, false);
        await settle();

        expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(INVOICE, DoneOrigin.Swipe);
        expect(root().querySelector('.asys-top-pick__done')).toBeNull();
        expect(topTitle().textContent?.trim()).toBe('Call the dentist');
        expect(motion.plays).toHaveLength(1);
        expect(must(motion.plays[0]).el).toBe(card);
        expect(must(motion.plays[0]).keyframes).toEqual(RISE_KEYFRAMES);
        expect(card.style.opacity).toBe('');
        expect(document.activeElement).toBe(topLink());

        motion.release();
      });
    });

    describe('the row handlers', () => {
      it('collapse always plays the collapse and completes the animation', async () => {
        const { motion, internals } = await setup({ allowed: true });
        const { event, target, animationComplete } = fakeAnimationEvent(64);

        await internals().collapse(event);

        expect(motion.plays).toHaveLength(1);
        expect(must(motion.plays[0]).el).toBe(target);
        expect(must(motion.plays[0]).keyframes).toEqual([
          { height: '64px', overflow: 'clip' },
          { height: '0px', overflow: 'clip' },
        ]);
        expect(animationComplete).toHaveBeenCalledTimes(1);
      });

      it('expand plays nothing before any Undo', async () => {
        const { motion, internals } = await setup({ allowed: true });

        await internals().expand(fakeAnimationEvent().event, 'dentist');
        await internals().expand(fakeAnimationEvent().event, 'plants');

        expect(motion.plays).toEqual([]);
      });

      describe('collapse and focus', () => {
        const eventFor = (target: Element) => {
          const animationComplete = vi.fn();

          return {
            animationComplete,
            event: { target, animationComplete } as unknown as AnimationCallbackEvent,
          };
        };
        const rowOf = (link: HTMLAnchorElement | undefined): HTMLElement =>
          must(must(link).closest('li'));

        it('moves focus to the top pick title when the collapsing row holds focus', async () => {
          const { motion, internals, rows, topTitle, topLink, settle } = await setup({
            allowed: true,
          });
          const row = rowOf(rows()[0]);

          must(rows()[0]).focus();

          expect(document.activeElement).toBe(rows()[0]);

          const { event, animationComplete } = eventFor(row);

          await internals().collapse(event);
          await settle();

          expect(document.activeElement).toBe(topLink());
          expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
          // The collapse itself still runs and still completes.
          expect(motion.plays).toHaveLength(1);
          expect(must(motion.plays[0]).el).toBe(row);
          expect(animationComplete).toHaveBeenCalledTimes(1);
        });

        it('moves focus to the top pick title when the focus is deeper inside the collapsing row', async () => {
          const { internals, topLink, settle } = await setup({ allowed: true });
          const row = document.createElement('li');
          const button = document.createElement('button');

          row.appendChild(button);
          document.body.appendChild(row);
          button.focus();

          await internals().collapse(eventFor(row).event);
          await settle();

          expect(document.activeElement).toBe(topLink());
        });

        it('moves focus to the h1 when the collapsing row holds focus and no card is displayed', async () => {
          const { internals, heading, topPick, settle } = await setup({
            allowed: true,
            state: domainState([]),
          });
          const row = document.createElement('li');
          const button = document.createElement('button');

          row.appendChild(button);
          document.body.appendChild(row);
          button.focus();

          expect(topPick()).toBeNull();

          await internals().collapse(eventFor(row).event);
          await settle();

          expect(document.activeElement).toBe(heading());
        });

        it('moves nothing when the focus is elsewhere in the page', async () => {
          const { internals, rows, heading, settle } = await setup({ allowed: true });

          heading().focus();
          await internals().collapse(eventFor(rowOf(rows()[0])).event);
          await settle();

          expect(document.activeElement).toBe(heading());
        });

        it('moves nothing when another row holds focus', async () => {
          const { internals, rows, settle } = await setup({ allowed: true });
          const other = must(rows()[1]);

          other.focus();
          await internals().collapse(eventFor(rowOf(rows()[0])).event);
          await settle();

          expect(document.activeElement).toBe(other);
        });

        it('moves nothing when nothing has focus', async () => {
          const { internals, rows, settle } = await setup({ allowed: true });

          await internals().collapse(eventFor(rowOf(rows()[0])).event);
          await settle();

          expect(document.activeElement).toBe(document.body);
        });
      });
    });
  });

  describe('Undo', () => {
    it('plays the rise on the card for the Task that comes back', async () => {
      const { state, doneUndo, motion, article, topButton, press, settle } = await setup({
        allowed: true,
      });
      const card = article();

      await press(topButton('Done'));
      motion.plays.length = 0;
      state.set(FULL);
      doneUndo.undone.set({ taskId: 'invoice', seq: 1 });
      await settle();

      expect(motion.plays).toHaveLength(1);
      expect(must(motion.plays[0]).el).toBe(card);
      expect(must(motion.plays[0]).keyframes).toEqual(RISE_KEYFRAMES);
      expect(must(motion.plays[0]).options).toEqual({
        duration: MotionDuration.Moderate,
        easing: MotionEasing.Out,
      });
      expect(must(motion.plays[0]).title).toBe('Pay the invoice');
    });

    it('ignores an Undo from before Now was created, and reacts to a later one', async () => {
      const { doneUndo, motion, article, settle } = await setup({
        allowed: true,
        undone: { taskId: 'invoice', seq: 1 },
      });
      const card = article();

      await settle();

      expect(motion.plays).toEqual([]);

      doneUndo.undone.set({ taskId: 'invoice', seq: 2 });
      await settle();

      expect(motion.plays).toHaveLength(1);
      expect(must(motion.plays[0]).el).toBe(card);
      expect(must(motion.plays[0]).keyframes).toEqual(RISE_KEYFRAMES);
    });

    it('plays no rise when the restored Task is not the one on the card', async () => {
      const { doneUndo, motion, settle } = await setup({ allowed: true });

      doneUndo.undone.set({ taskId: 'plants', seq: 1 });
      await settle();

      expect(motion.plays).toEqual([]);
    });

    it('expands only the row of the Task that the Done promoted, and only once', async () => {
      const { state, doneUndo, motion, internals, topButton, press, settle } = await setup({
        allowed: true,
      });

      await press(topButton('Done'));
      motion.plays.length = 0;
      state.set(FULL);
      doneUndo.undone.set({ taskId: 'invoice', seq: 1 });
      await settle();
      motion.plays.length = 0;

      const plants = fakeAnimationEvent(40);
      const dentist = fakeAnimationEvent(56);
      const again = fakeAnimationEvent(56);

      await internals().expand(plants.event, 'plants');
      await internals().expand(dentist.event, 'dentist');
      await internals().expand(again.event, 'dentist');

      expect(motion.plays).toHaveLength(1);
      expect(must(motion.plays[0]).el).toBe(dentist.target);
      expect(must(motion.plays[0]).keyframes).toEqual([
        { height: '0px', overflow: 'clip' },
        { height: '56px', overflow: 'clip' },
      ]);
      expect(must(motion.plays[0]).options).toEqual({
        duration: MotionDuration.Moderate,
        easing: MotionEasing.Out,
      });
      expect(dentist.animationComplete).toHaveBeenCalledTimes(1);
    });

    it('expands the row of a ranked Task that was held and comes back, without a card rise', async () => {
      const { state, doneUndo, motion, internals, now, settle } = await setup({ allowed: true });
      const dentist = must(now().ranked[1]).task;

      await internals().done(dentist, DoneOrigin.Button, false);
      await settle();
      state.set(FULL);
      doneUndo.undone.set({ taskId: 'dentist', seq: 1 });
      await settle();

      expect(motion.plays).toEqual([]);

      const plants = fakeAnimationEvent();
      const row = fakeAnimationEvent(48);

      await internals().expand(plants.event, 'plants');
      await internals().expand(row.event, 'dentist');

      expect(motion.plays).toHaveLength(1);
      expect(must(motion.plays[0]).el).toBe(row.target);
    });
  });

  describe('Log progress', () => {
    const LOG_15: Command = {
      _tag: CommandTag.LogProgress,
      taskId: 'invoice',
      remainingMinutes: 15,
      expect: { status: TaskStatus.Open },
    };

    it('opens the form inside the top pick, with the hint for the stored Estimate, and focuses its input', async () => {
      const { topPick, topButton, click, formInput, root } = await setup();

      expect(root().querySelector('asys-log-progress-form')).toBeNull();

      await click(topButton('Log progress'));

      expect(must(topPick()).querySelector('asys-log-progress-form')).not.toBeNull();
      expect(must(topPick()).querySelector('.asys-field__hint')?.textContent?.trim()).toBe(
        'Whole minutes, less than 30 min.',
      );
      expect(document.activeElement).toBe(formInput());
    });

    it.each(['0', '30', 'abc'])('shows the error and sends nothing for %j', async (value) => {
      const { send, topButton, click, typeIntoForm, formButton, root } = await setup();

      await click(topButton('Log progress'));
      await typeIntoForm(value);
      await click(formButton('Save'));

      expect(send).not.toHaveBeenCalled();
      expect(
        root().querySelector('.asys-field__error')?.textContent?.replace(/\s+/g, ' ').trim(),
      ).toBe('Error: Use whole minutes from 1 to 29.');
    });

    it('sends the LogProgress command with the key from the attempts and marks the form busy', async () => {
      const { send, topButton, click, typeIntoForm, formButton } = await setup();

      await click(topButton('Log progress'));
      await typeIntoForm('15');
      await click(formButton('Save'));

      expect(send).toHaveBeenCalledExactlyOnceWith(LOG_15, 'key-1');
      expect(formButton('Save')?.disabled).toBe(true);
    });

    it('closes the form, announces the new Estimate and focuses the title when applied', async () => {
      const {
        state,
        sends,
        statusLine,
        topLink,
        topFacts,
        topButton,
        click,
        typeIntoForm,
        formButton,
        form,
        settle,
      } = await setup();

      await click(topButton('Log progress'));
      await typeIntoForm('15');
      await click(formButton('Save'));
      must(sends[0]).resolve(APPLIED);
      state.update((s) => ({
        ...must(s),
        tasks: must(s).tasks.map((t) => (t.id === 'invoice' ? { ...t, estimateMinutes: 15 } : t)),
      }));
      await settle();

      expect(form()).toBeNull();
      expect(statusLine().textContent?.trim()).toBe('Estimate is now 15 min.');
      expect(document.activeElement).toBe(topLink());
      expect(must(topFacts()[0]).querySelector('.asys-num')?.textContent?.trim()).toBe('15 min');
    });

    it('does nothing when the screen is destroyed while the send is pending', async () => {
      const {
        fixture,
        sends,
        statusLine,
        handleError,
        topButton,
        click,
        typeIntoForm,
        formButton,
      } = await setup();
      const line = statusLine();

      await click(topButton('Log progress'));
      await typeIntoForm('15');
      await click(formButton('Save'));
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
    });

    it('keeps the form open with its text and shows the message for another outcome', async () => {
      const {
        sends,
        statusLine,
        topButton,
        click,
        typeIntoForm,
        formButton,
        form,
        formInput,
        settle,
      } = await setup();
      const outcome: CommandOutcome = {
        _tag: CommandOutcomeTag.Rejected,
        reason: RejectedReason.InvalidRemaining,
      };

      await click(topButton('Log progress'));
      await typeIntoForm('15');
      await click(formButton('Save'));
      must(sends[0]).resolve(outcome);
      await settle();

      expect(form()).not.toBeNull();
      expect(must(formInput()).value).toBe('15');
      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(outcome));
      expect(formButton('Save')?.disabled).toBe(false);
    });

    it('closes with Cancel and returns focus to the Log progress button', async () => {
      const { topButton, click, formButton, form } = await setup();

      await click(topButton('Log progress'));
      await click(formButton('Cancel'));

      expect(form()).toBeNull();
      expect(document.activeElement).toBe(topButton('Log progress'));
    });

    it('closes with Escape and returns focus to the Log progress button', async () => {
      const { topButton, click, formInput, form, settle } = await setup();

      await click(topButton('Log progress'));
      must(formInput()).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await settle();

      expect(form()).toBeNull();
      expect(document.activeElement).toBe(topButton('Log progress'));
    });

    it('closes the form when Done is pressed while it is open, and sends nothing', async () => {
      const { doneUndo, send, topButton, press, form, settle } = await setup();

      await press(topButton('Log progress'));

      expect(form()).not.toBeNull();

      await press(topButton('Done'));
      await settle();

      expect(doneUndo.complete).toHaveBeenCalledTimes(1);
      expect(form()).toBeNull();
      expect(send).not.toHaveBeenCalled();
    });

    it('sends nothing from the form while the Task awaits the server', async () => {
      const { send, topButton, click, typeIntoForm, form, formButton, awaitingSync, settle } =
        await setup();

      await click(topButton('Log progress'));
      await typeIntoForm('15');
      awaitingSync.set(new Set(['invoice']));
      await settle();

      expect(formButton('Save')?.disabled).toBe(true);

      must(form()).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle();

      expect(send).not.toHaveBeenCalled();
    });

    it('closes the form when the Estimate drops to 1 and the button goes', async () => {
      const { state, topButton, click, form, settle } = await setup();

      await click(topButton('Log progress'));
      state.update((s) => ({
        ...must(s),
        tasks: must(s).tasks.map((t) => (t.id === 'invoice' ? { ...t, estimateMinutes: 1 } : t)),
      }));
      await settle();

      expect(form()).toBeNull();
      expect(topButton('Log progress')).toBeUndefined();
    });
  });

  describe('when the top pick changes by itself', () => {
    const STEADY = task({ id: 'steady', title: 'Steady one', createdAt: 1 });

    // Becomes overdue 15 minutes into the test, so it takes over from Steady.
    const EARLY = task({
      id: 'early',
      title: 'Early bird',
      important: false,
      due: { date: '2026-10-04', time: '10:15' },
      estimateMinutes: 20,
      createdAt: 2,
    });

    const options = { state: domainState([STEADY, EARLY]) };

    it('closes the form and moves focus from inside it to the new top pick', async () => {
      const { clockNow, topButton, click, form, formInput, topTitle, topLink, settle } =
        await setup(options);

      await click(topButton('Log progress'));

      expect(document.activeElement).toBe(formInput());

      clockNow.set(T0 + 16 * MINUTE);
      await settle();

      expect(topTitle().textContent?.trim()).toBe('Early bird');
      expect(form()).toBeNull();
      expect(document.activeElement).toBe(topLink());
    });

    it('leaves focus alone when it was not inside the form', async () => {
      const { clockNow, topButton, click, form, heading, topTitle, settle } = await setup(options);

      await click(topButton('Log progress'));
      heading().focus();
      clockNow.set(T0 + 16 * MINUTE);
      await settle();

      expect(topTitle().textContent?.trim()).toBe('Early bird');
      expect(form()).toBeNull();
      expect(document.activeElement).toBe(heading());
    });

    it('does not reopen the form when the top pick changes back', async () => {
      const { clockNow, topButton, click, form, topTitle, settle } = await setup(options);

      await click(topButton('Log progress'));
      clockNow.set(T0 + 16 * MINUTE);
      await settle();
      clockNow.set(T0);
      await settle();

      expect(topTitle().textContent?.trim()).toBe('Steady one');
      expect(form()).toBeNull();
    });
  });

  describe('swipes', () => {
    const LOG_15: Command = {
      _tag: CommandTag.LogProgress,
      taskId: 'dentist',
      remainingMinutes: 15,
      expect: { status: TaskStatus.Open },
    };

    const inputsOf = (el: DebugElement) => ({
      taskId: swipeOf(el).taskId(),
      startEnabled: swipeOf(el).startEnabled(),
      disabled: swipeOf(el).disabled(),
    });

    const idsRanked = (now: () => { ranked: readonly { task: Task }[] }): string[] =>
      now().ranked.map((r) => r.task.id);

    it('wraps the top pick card and each ranked row in a swipe, and keeps the rows in rank order', async () => {
      const { root, rows, rankedList, topPick } = await setup();
      const top = must(root().querySelector('asys-swipe-actions.now__top-swipe'));
      const items = Array.from(
        root().querySelectorAll('ul.now__list:not(.now__list--waiting) > li'),
      );

      expect(top.querySelector('article.asys-top-pick')).not.toBeNull();
      expect(top.contains(topPick())).toBe(true);
      expect(rankedList()).not.toBeNull();
      expect(items).toHaveLength(2);
      expect(items.map((li) => li.querySelectorAll('asys-swipe-actions').length)).toEqual([1, 1]);
      expect(
        items.map((li) => li.querySelectorAll('asys-swipe-actions a.asys-picker-row').length),
      ).toEqual([1, 1]);
      expect(items.map((li) => li.querySelectorAll('a.asys-picker-row').length)).toEqual([1, 1]);
      expect(root().querySelectorAll('asys-swipe-actions')).toHaveLength(3);
      expect(rows().map((a) => a.getAttribute('href'))).toEqual([
        '/tasks/dentist',
        '/tasks/plants',
      ]);
    });

    it('does not wrap the Waiting rows', async () => {
      const { root, waitingHeader, waitingList, waitingRows, click } = await setup();

      await click(must(waitingHeader()));

      expect(waitingRows()).toHaveLength(2);
      expect(must(waitingList()).querySelectorAll('asys-swipe-actions')).toHaveLength(0);
      expect(root().querySelectorAll('asys-swipe-actions')).toHaveLength(3);
    });

    it('gives each swipe its Task, enables Log progress only where the Estimate leaves room, and disables none', async () => {
      const { swipes } = await setup();

      expect(swipes().map(inputsOf)).toEqual([
        { taskId: 'invoice', startEnabled: true, disabled: false },
        { taskId: 'dentist', startEnabled: true, disabled: false },
        { taskId: 'plants', startEnabled: false, disabled: false },
      ]);
    });

    describe('toward the end', () => {
      it('hands the top pick to DoneUndo as a Swipe Done, and hands over to the next top pick', async () => {
        const { doneUndo, send, swipeEnd, topTitle, topLink } = await setup();

        await swipeEnd('invoice');

        expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(INVOICE, DoneOrigin.Swipe);
        expect(send).not.toHaveBeenCalled();
        expect(topTitle().textContent?.trim()).toBe('Call the dentist');
        expect(document.activeElement).toBe(topLink());
      });

      it('hands a ranked row to DoneUndo as a Swipe Done, without the card leaving', async () => {
        const { doneUndo, send, swipeEnd, topPick } = await setup();

        // No assertion on which Task is the top pick afterwards: Report was blocked by Dentist.
        await swipeEnd('dentist');

        expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(DENTIST, DoneOrigin.Swipe);
        expect(send).not.toHaveBeenCalled();
        expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
      });

      it.each(['flights', 'nope'])('does nothing for %j, which is not ranked', async (id) => {
        const { doneUndo, send, swipeEnd } = await setup();

        await swipeEnd('dentist', id);

        expect(doneUndo.complete).not.toHaveBeenCalled();
        expect(doneUndo.requestFocus).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
      });
    });

    describe('toward the start', () => {
      it('opens the Log progress form inside the row, with the hint for its Estimate, and focuses its input', async () => {
        const { root, topPick, swipe, swipeStart, rowItem, formInput } = await setup();

        await swipeStart('dentist');

        const rowForm = must(rowItem('dentist').querySelector('.now__row-form'));
        const form = must(rowForm.querySelector('asys-log-progress-form'));

        expect(rowForm.querySelector('.asys-field__hint')?.textContent?.trim()).toBe(
          'Whole minutes, less than 20 min.',
        );
        expect(document.activeElement).toBe(formInput());
        expect(rowForm.contains(formInput())).toBe(true);
        // The form sits after the swipe, not inside it, so a press in the form never starts a swipe.
        expect(swipe('dentist').nativeElement.contains(form)).toBe(false);
        expect(
          swipe('dentist').nativeElement.compareDocumentPosition(form) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(must(topPick()).querySelector('asys-log-progress-form')).toBeNull();
        expect(root().querySelectorAll('asys-log-progress-form')).toHaveLength(1);
      });

      it('sends the LogProgress command for the row and, once applied, closes the form, announces the Estimate and focuses the row link', async () => {
        const {
          state,
          sends,
          send,
          statusLine,
          swipeStart,
          typeIntoForm,
          click,
          formButton,
          form,
          rowLink,
          settle,
        } = await setup();

        await swipeStart('dentist');
        await typeIntoForm('15');
        await click(formButton('Save'));

        expect(send).toHaveBeenCalledExactlyOnceWith(LOG_15, 'key-1');

        must(sends[0]).resolve(APPLIED);
        state.update((s) => ({
          ...must(s),
          tasks: must(s).tasks.map((t) => (t.id === 'dentist' ? { ...t, estimateMinutes: 15 } : t)),
        }));
        await settle();

        expect(form()).toBeNull();
        expect(statusLine().textContent?.trim()).toBe('Estimate is now 15 min.');
        expect(
          rowLink('dentist').querySelector('.asys-picker-row__estimate')?.textContent?.trim(),
        ).toBe('15 min');
        expect(document.activeElement).toBe(rowLink('dentist'));
      });

      it('closes with Cancel and focuses the row link', async () => {
        const { swipeStart, click, formButton, form, rowLink } = await setup();

        await swipeStart('dentist');
        await click(formButton('Cancel'));

        expect(form()).toBeNull();
        expect(document.activeElement).toBe(rowLink('dentist'));
      });

      it('closes with Escape and focuses the row link', async () => {
        const { swipeStart, formInput, form, rowLink, settle } = await setup();

        await swipeStart('dentist');
        must(formInput()).dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
        await settle();

        expect(form()).toBeNull();
        expect(document.activeElement).toBe(rowLink('dentist'));
      });

      it('moves the form from the top pick to the row', async () => {
        const { root, topPick, topButton, swipeStart, rowItem, formInput, click } = await setup();

        await click(topButton('Log progress'));

        expect(must(topPick()).querySelector('asys-log-progress-form')).not.toBeNull();

        await swipeStart('dentist');

        expect(must(topPick()).querySelector('asys-log-progress-form')).toBeNull();
        expect(
          rowItem('dentist').querySelector('.now__row-form asys-log-progress-form'),
        ).not.toBeNull();
        expect(root().querySelectorAll('asys-log-progress-form')).toHaveLength(1);
        expect(topButton('Log progress')).toBeDefined();
        expect(document.activeElement).toBe(formInput());
      });
    });

    describe('a row form', () => {
      it('stays open, with its text and focus, when the top pick changes by itself', async () => {
        const steady = task({ id: 'steady', title: 'Steady one', createdAt: 1 });
        const early = task({
          id: 'early',
          title: 'Early bird',
          important: false,
          due: { date: '2026-10-04', time: '10:15' },
          estimateMinutes: 20,
          createdAt: 2,
        });
        const calm = task({
          id: 'calm',
          title: 'Calm one',
          important: false,
          estimateMinutes: 20,
          createdAt: 3,
        });
        const state = domainState([steady, early, calm]);
        const later = T0 + 16 * MINUTE;
        const rankedAt = (at: Instant): string[] =>
          pick(state.tasks, state.links, state.areas, state.settings, at).ranked.map(
            (r) => r.task.id,
          );

        // A ranking change would show up here, as a failure of the setup and not of Now.
        expect(rankedAt(T0)[0]).toBe('steady');
        expect(rankedAt(T0).slice(1)).toContain('calm');
        expect(rankedAt(later)[0]).toBe('early');
        expect(rankedAt(later).slice(1)).toContain('calm');

        const {
          clockNow,
          topPick,
          topTitle,
          swipeStart,
          typeIntoForm,
          rowItem,
          form,
          formInput,
          settle,
        } = await setup({ state });

        await swipeStart('calm');
        await typeIntoForm('7');

        expect(topTitle().textContent?.trim()).toBe('Steady one');
        expect(document.activeElement).toBe(formInput());

        clockNow.set(later);
        await settle();

        expect(topTitle().textContent?.trim()).toBe('Early bird');
        expect(form()).not.toBeNull();
        expect(rowItem('calm').querySelector('.now__row-form')?.contains(form())).toBe(true);
        expect(must(formInput()).value).toBe('7');
        expect(document.activeElement).toBe(formInput());
        expect(must(topPick()).querySelector('asys-log-progress-form')).toBeNull();
      });

      it('closes when its Task leaves the ranking, and focus from inside it goes to the top pick title', async () => {
        const { state, now, root, topLink, swipeStart, formInput, settle } = await setup();

        await swipeStart('dentist');

        expect(document.activeElement).toBe(formInput());

        state.set(without(FULL, 'dentist'));
        await settle();

        expect(idsRanked(now)).not.toContain('dentist');
        expect(root().querySelector('asys-log-progress-form')).toBeNull();
        expect(topLink().getAttribute('href')).toBe(`/tasks/${idsRanked(now)[0]}`);
        expect(document.activeElement).toBe(topLink());
      });

      it('closes when its Task becomes the top pick, and focus from inside it goes to the new top pick title', async () => {
        const { state, root, topButton, topLink, swipeStart, formInput, settle } = await setup();

        await swipeStart('dentist');

        expect(document.activeElement).toBe(formInput());

        state.set(without(FULL, 'invoice'));
        await settle();

        expect(topLink().getAttribute('href')).toBe('/tasks/dentist');
        expect(root().querySelector('asys-log-progress-form')).toBeNull();
        expect(topButton('Log progress')).toBeDefined();
        expect(document.activeElement).toBe(topLink());
      });
    });

    describe('the disabled input', () => {
      it('is true for a row while its LogProgress send is pending and while it awaits the server, and false otherwise', async () => {
        const {
          sends,
          awaitingSync,
          swipes,
          swipe,
          swipeStart,
          typeIntoForm,
          click,
          formButton,
          settle,
        } = await setup();
        const disabled = (id: string): boolean => swipeOf(swipe(id)).disabled();

        expect(swipes().map((s) => swipeOf(s).disabled())).toEqual([false, false, false]);

        await swipeStart('dentist');
        await typeIntoForm('15');
        await click(formButton('Save'));

        expect(disabled('dentist')).toBe(true);
        expect(disabled('invoice')).toBe(false);
        expect(disabled('plants')).toBe(false);

        must(sends[0]).resolve(FAILED);
        await settle();

        expect(disabled('dentist')).toBe(false);

        awaitingSync.set(new Set(['dentist']));
        await settle();

        expect(disabled('dentist')).toBe(true);
        expect(disabled('invoice')).toBe(false);
        expect(disabled('plants')).toBe(false);

        awaitingSync.set(new Set());
        await settle();

        expect(disabled('dentist')).toBe(false);
      });

      it('is true for the top pick while the leaving card is displayed after a Done press, and false again once it has gone', async () => {
        const { motion, topPick, topSwipe, topButton, press, settle } = await setup({
          allowed: true,
          hold: true,
        });
        const disabled = (): boolean => swipeOf(topSwipe()).disabled();

        expect(disabled()).toBe(false);

        await press(topButton('Done'));

        expect(must(topPick()).hasAttribute('data-leaving')).toBe(true);
        expect(swipeOf(topSwipe()).taskId()).toBe('invoice');
        expect(disabled()).toBe(true);

        motion.release();
        await settle();

        expect(must(topPick()).hasAttribute('data-leaving')).toBe(false);
        expect(swipeOf(topSwipe()).taskId()).toBe('dentist');
        expect(disabled()).toBe(false);
      });
    });

    describe('focus after Done toward the end on a row', () => {
      it('goes to the next row when focus was on the row', async () => {
        const { swipeEnd, rowLink } = await setup();

        rowLink('dentist').focus();
        await swipeEnd('dentist');

        expect(document.activeElement).toBe(rowLink('plants'));
      });

      it('goes to the previous row when focus was on the last row', async () => {
        const { swipeEnd, rowLink } = await setup();

        rowLink('plants').focus();
        await swipeEnd('plants');

        expect(document.activeElement).toBe(rowLink('dentist'));
      });

      it('goes to the top pick title when focus was on the only row', async () => {
        const { swipeEnd, rowLink, topLink } = await setup({
          state: domainState([INVOICE, DENTIST]),
        });

        rowLink('dentist').focus();
        await swipeEnd('dentist');

        expect(topLink().getAttribute('href')).toBe('/tasks/invoice');
        expect(document.activeElement).toBe(topLink());
      });

      it('does not move when focus was elsewhere', async () => {
        const { doneUndo, swipeEnd, heading } = await setup();

        heading().focus();
        await swipeEnd('dentist');

        expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(DENTIST, DoneOrigin.Swipe);
        expect(document.activeElement).toBe(heading());
      });

      it('does nothing for a row whose Done is refused, and leaves focus on its link', async () => {
        const { doneUndo, awaitingSync, swipe, swipeEnd, rowLink, settle } = await setup();

        awaitingSync.set(new Set(['dentist']));
        await settle();
        rowLink('dentist').focus();

        // The swipe is disabled, but the output is fired directly, as a late commit could.
        expect(swipeOf(swipe('dentist')).disabled()).toBe(true);

        await swipeEnd('dentist');

        expect(doneUndo.complete).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(rowLink('dentist'));
      });
    });
  });

  describe('the task title hooks', () => {
    const titleIdOf = (row: Element): string | null | undefined =>
      row.querySelector('.asys-picker-row__title')?.getAttribute('data-task-id');
    const marked = (root: () => HTMLElement): Element[] =>
      Array.from(root().querySelectorAll('[data-morph]'));

    it('gives the top pick title and each ranked row title their own Task id', async () => {
      const { root, topTitle, rows, now } = await setup();

      expect(now().ranked.map((r) => r.task.id)).toEqual(['invoice', 'dentist', 'plants']);
      expect(topTitle().getAttribute('data-task-id')).toBe('invoice');
      expect(rows().map(titleIdOf)).toEqual(['dentist', 'plants']);
      expect(
        Array.from(root().querySelectorAll('[data-task-id]')).map((el) =>
          el.getAttribute('data-task-id'),
        ),
      ).toEqual(['invoice', 'dentist', 'plants']);
    });

    it('gives each Waiting row title its own Task id once Waiting is expanded', async () => {
      const { root, waitingHeader, click, rows, waitingRows } = await setup();

      expect(root().querySelector('[data-task-id="flights"]')).toBeNull();
      expect(root().querySelector('[data-task-id="report"]')).toBeNull();

      await click(must(waitingHeader()));

      expect(waitingRows().map(titleIdOf)).toEqual(['flights', 'report']);
      expect(rows().map(titleIdOf)).toEqual(['dentist', 'plants']);
    });

    it('marks only the second ranked row title while TaskMorph holds its id', async () => {
      const { root, now, settle } = await setup();
      const secondId = must(now().ranked[1]).task.id;

      TestBed.inject(TaskMorph).set(secondId);
      await settle();

      const elements = marked(root);

      expect(secondId).toBe('dentist');
      expect(elements).toHaveLength(1);
      expect(elements[0]).toBe(root().querySelector('.asys-picker-row__title'));
      expect(elements[0]?.getAttribute('data-task-id')).toBe(secondId);
      expect(elements[0]?.getAttribute('data-morph')).toBe('');
    });

    it('marks only the top pick title while TaskMorph holds the top id', async () => {
      const { root, topTitle, now, settle } = await setup();
      const topId = must(now().ranked[0]).task.id;

      TestBed.inject(TaskMorph).set(topId);
      await settle();

      const elements = marked(root);

      expect(topId).toBe('invoice');
      expect(elements).toHaveLength(1);
      expect(elements[0]).toBe(topTitle());
      expect(elements[0]?.getAttribute('data-task-id')).toBe(topId);
      expect(elements[0]?.getAttribute('data-morph')).toBe('');
    });

    it('marks nothing for an id that is not listed, nor for a Waiting id while Waiting is collapsed', async () => {
      const { root, settle } = await setup();

      TestBed.inject(TaskMorph).set('not-a-task');
      await settle();

      expect(marked(root)).toEqual([]);

      TestBed.inject(TaskMorph).set('flights');
      await settle();

      expect(marked(root)).toEqual([]);
    });

    it('marks nothing for null, also after an id was set', async () => {
      const { root, settle } = await setup();

      expect(marked(root)).toEqual([]);

      TestBed.inject(TaskMorph).set('dentist');
      await settle();

      expect(marked(root)).toHaveLength(1);

      TestBed.inject(TaskMorph).set(null);
      await settle();

      expect(marked(root)).toEqual([]);
    });

    it('marks only a Waiting row title while TaskMorph holds its id', async () => {
      const { root, waitingHeader, click, waitingRows, settle } = await setup();

      await click(must(waitingHeader()));
      TestBed.inject(TaskMorph).set('report');
      await settle();

      const elements = marked(root);

      expect(elements).toHaveLength(1);
      expect(elements[0]).toBe(must(waitingRows()[1]).querySelector('.asys-picker-row__title'));
      expect(elements[0]?.getAttribute('data-task-id')).toBe('report');
    });
  });
});
