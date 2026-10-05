// SPDX-License-Identifier: EUPL-1.2
import { computed, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import {
  CommandTag,
  NotApplicableReason,
  pick,
  RejectedReason,
  TaskKind,
  TaskStatus,
  type Command,
  type DomainState,
  type Instant,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { outcomeMessage } from '../../core/data/outcome-message';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { Clock } from '../../core/platform/clock';
import { Ids } from '../../core/platform/ids';
import { TaskMorph } from '../../core/platform/task-morph';
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

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

interface SetupOptions {
  readonly state?: DomainState | null;
  readonly status?: SyncStatus;
}

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

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: DataStore, useValue: { state, status, awaitingSync, now, send, refresh } },
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
  const heading = (): HTMLElement => must(root().querySelector('h1.now__title'));
  const statusLine = (): HTMLElement => must(root().querySelector('p.now__status'));
  const topPick = (): HTMLElement | null => root().querySelector('asys-top-pick');
  const topTitle = (): HTMLElement => must(root().querySelector('.asys-top-pick__title'));
  const topButton = (name: string): HTMLButtonElement | undefined =>
    Array.from(topPick()?.querySelectorAll('button') ?? []).find(
      (b) => b.textContent?.trim() === name,
    );
  const click = async (el: HTMLElement | undefined): Promise<void> => {
    must(el).click();
    await settle();
  };
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
  const rows = (): HTMLAnchorElement[] =>
    Array.from(root().querySelectorAll<HTMLAnchorElement>('ul.now__list a.asys-picker-row'));
  const waitingHeader = (): HTMLButtonElement | null =>
    root().querySelector('asys-section-header button');

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
    root,
    text,
    settle,
    heading,
    statusLine,
    topPick,
    topTitle,
    topButton,
    click,
    form,
    formInput,
    formButton,
    typeIntoForm,
    rows,
    waitingHeader,
  };
};

const without = (state: DomainState, ...ids: string[]): DomainState => ({
  ...state,
  tasks: state.tasks.filter((t) => !ids.includes(t.id)),
});

const doneTask = (t: Task): Task => ({ ...t, status: TaskStatus.Done, closedAt: T0 });

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
      const { heading, statusLine } = await setup({ state: null });

      expect(heading().textContent?.trim()).toBe('Now');
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

  describe('the status line', () => {
    it('sits directly under the heading when there is state', async () => {
      const { heading, statusLine } = await setup();

      expect(heading().nextElementSibling).toBe(statusLine());
      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('stays displayed while it is empty, so later messages are announced', async () => {
      const { statusLine } = await setup();

      expect(statusLine().textContent?.trim()).toBe('');
      expect(getComputedStyle(statusLine()).display).not.toBe('none');
    });

    it('sits directly under the heading without state', async () => {
      const { heading, statusLine } = await setup({ state: null });

      expect(heading().nextElementSibling).toBe(statusLine());
    });
  });

  describe('the top pick', () => {
    it('shows the first ranked Task with its reason from the domain, chip, estimate and badge', async () => {
      const { topPick, topTitle, now } = await setup();
      const first = must(now().ranked[0]);

      expect(first.task.id).toBe('invoice');
      expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
      expect(must(topPick()).querySelector('.asys-top-pick__reason')?.textContent?.trim()).toBe(
        first.reasonText,
      );
      expect(first.reasonText).toContain('Due');
      expect(first.reasonText).toContain('important');
      expect(
        must(topPick()).querySelector('asys-quadrant-chip')?.textContent?.trim().toLowerCase(),
      ).toBe(first.reason.quadrant);
      expect(must(topPick()).querySelector('.asys-top-pick__estimate')?.textContent?.trim()).toBe(
        '30 min',
      );
      expect(must(topPick()).querySelector('asys-status-badge')?.textContent?.trim()).toBe(
        'Overdue',
      );
    });

    it('shows no Overdue badge for a Task that is not overdue', async () => {
      const { topPick, topTitle, now } = await setup({ state: without(FULL, 'invoice') });

      expect(must(now().ranked[0]).task.id).toBe('dentist');
      expect(topTitle().textContent?.trim()).toBe('Call the dentist');
      expect(must(topPick()).querySelector('asys-status-badge')).toBeNull();
      expect(must(topPick()).querySelector('.asys-top-pick__estimate')?.textContent?.trim()).toBe(
        '20 min',
      );
    });

    it('offers Done, Log progress and Open, enabled', async () => {
      const { topButton } = await setup();

      expect(topButton('Done')?.disabled).toBe(false);
      expect(topButton('Log progress')?.disabled).toBe(false);
      expect(topButton('Open')?.disabled).toBe(false);
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

    it('Open navigates to the Task', async () => {
      const { fixture, topButton, click } = await setup();
      const router = fixture.debugElement.injector.get(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      await click(topButton('Open'));

      expect(navigate).toHaveBeenCalledTimes(1);

      const target = must(navigate.mock.calls[0])[0];

      expect(typeof target === 'string' ? target : router.serializeUrl(target as UrlTree)).toBe(
        '/tasks/invoice',
      );
    });
  });

  describe('when the server has not confirmed yet', () => {
    it('shows Saved. Waiting for the server. in the top pick and disables its actions', async () => {
      const { topPick, topButton, awaitingSync, settle } = await setup();

      expect(must(topPick()).querySelector('.now__sync')).toBeNull();

      awaitingSync.set(new Set(['invoice']));
      await settle();

      expect(must(topPick()).querySelector('p.now__sync')?.textContent?.trim()).toBe(
        'Saved. Waiting for the server.',
      );
      expect(topButton('Done')?.disabled).toBe(true);
      expect(topButton('Log progress')?.disabled).toBe(true);
    });

    it('ignores ids of other Tasks', async () => {
      const { topPick, topButton, awaitingSync, settle } = await setup();

      awaitingSync.set(new Set(['dentist']));
      await settle();

      expect(must(topPick()).querySelector('.now__sync')).toBeNull();
      expect(topButton('Done')?.disabled).toBe(false);
    });

    it('sends nothing for Done', async () => {
      const { topButton, awaitingSync, send, click } = await setup();

      awaitingSync.set(new Set(['invoice']));
      await click(topButton('Done'));

      expect(send).not.toHaveBeenCalled();
    });

    it('shows the note before the Log progress form', async () => {
      const { topPick, topButton, click, awaitingSync, settle } = await setup();

      await click(topButton('Log progress'));
      awaitingSync.set(new Set(['invoice']));
      await settle();

      const note = must(must(topPick()).querySelector('.now__sync'));
      const form = must(must(topPick()).querySelector('asys-log-progress-form'));

      expect(note.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('with nothing ranked', () => {
    it('says Nothing to do right now. and has no top pick, no list and no Triage line', async () => {
      const { root, topPick } = await setup({ state: domainState([]) });

      expect(root().querySelector('p.now__text')?.textContent?.trim()).toBe(
        'Nothing to do right now.',
      );
      expect(topPick()).toBeNull();
      expect(root().querySelector('ul.now__list')).toBeNull();
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

    it('show the reason from the domain, the estimate and the quadrant chip', async () => {
      const { rows, now } = await setup();
      const [dentist, plants] = now().ranked.slice(1);

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
      expect(
        must(rows()[0]).querySelector('asys-quadrant-chip')?.textContent?.trim().toLowerCase(),
      ).toBe(must(dentist).reason.quadrant);
      expect(
        must(rows()[1]).querySelector('asys-quadrant-chip')?.textContent?.trim().toLowerCase(),
      ).toBe(must(plants).reason.quadrant);
      expect(must(dentist).reason.quadrant).not.toBe(must(plants).reason.quadrant);
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
      const { root } = await setup({ state: domainState([INVOICE]) });

      expect(root().querySelector('ul.now__list')).toBeNull();
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
      const { root, waitingHeader } = await setup({ state: domainState([INVOICE]) });

      expect(waitingHeader()).toBeNull();
      expect(root().querySelector('asys-section-header')).toBeNull();
    });

    it('shows a collapsed header with the count', async () => {
      const { waitingHeader, rows, text } = await setup();

      expect(
        must(waitingHeader()).querySelector('.asys-section-header__title')?.textContent?.trim(),
      ).toBe('Waiting');
      expect(
        must(waitingHeader()).querySelector('.asys-section-header__count')?.textContent?.trim(),
      ).toBe('2');
      expect(must(waitingHeader()).getAttribute('aria-expanded')).toBe('false');
      expect(text()).not.toContain('Book flights');
      expect(text()).not.toContain('Send the report');
      expect(rows().map((a) => a.getAttribute('href'))).not.toContain('/tasks/flights');
    });

    it('lists the Tasks that wait with their reason and estimate when expanded', async () => {
      const { waitingHeader, click, rows, now } = await setup();

      await click(must(waitingHeader()));

      expect(must(waitingHeader()).getAttribute('aria-expanded')).toBe('true');

      const waitingRows = rows().filter((a) => a.classList.contains('asys-picker-row--waiting'));
      const [flights, report] = now().waiting;

      expect(waitingRows.map((a) => a.getAttribute('href'))).toEqual([
        '/tasks/flights',
        '/tasks/report',
      ]);
      expect(
        waitingRows.map((a) => a.querySelector('.asys-picker-row__title')?.textContent?.trim()),
      ).toEqual(['Book flights', 'Send the report']);
      expect(
        must(waitingRows[0]).querySelector('.asys-picker-row__reason-text')?.textContent?.trim(),
      ).toBe(must(flights).reasonText);
      expect(must(flights).reasonText).toContain('Available from');
      expect(
        must(waitingRows[1]).querySelector('.asys-picker-row__reason-text')?.textContent?.trim(),
      ).toBe(must(report).reasonText);
      expect(must(report).reasonText).toContain('Blocked by Call the dentist');
      expect(
        waitingRows.map((a) => a.querySelector('.asys-picker-row__estimate')?.textContent?.trim()),
      ).toEqual(['10 min', '45 min']);
    });

    it('shows no quadrant chip and an Overdue badge only for overdue Tasks', async () => {
      const { waitingHeader, click, rows } = await setup();

      await click(must(waitingHeader()));

      const waitingRows = rows().filter((a) => a.classList.contains('asys-picker-row--waiting'));

      expect(waitingRows).toHaveLength(2);
      expect(waitingRows.every((a) => a.querySelector('asys-quadrant-chip') === null)).toBe(true);
      expect(
        waitingRows.map((a) => a.querySelector('asys-status-badge')?.textContent?.trim() ?? null),
      ).toEqual([null, 'Overdue']);
    });

    it('collapses again', async () => {
      const { waitingHeader, click, text } = await setup();

      await click(must(waitingHeader()));
      await click(must(waitingHeader()));

      expect(text()).not.toContain('Book flights');
    });

    it('is shown even when no Task is ranked', async () => {
      const { waitingHeader, text } = await setup({ state: domainState([FLIGHTS]) });

      expect(waitingHeader()).not.toBeNull();
      expect(text()).toContain('Nothing to do right now.');
    });
  });

  describe('Done', () => {
    const DONE: Command = {
      _tag: CommandTag.CompleteTask,
      taskId: 'invoice',
      expect: { status: TaskStatus.Open },
    };

    it('sends the command with the key from the attempts and disables the actions meanwhile', async () => {
      const { send, topButton, click } = await setup();

      await click(topButton('Done'));

      expect(send).toHaveBeenCalledExactlyOnceWith(DONE, 'key-1');
      expect(topButton('Done')?.disabled).toBe(true);
      expect(topButton('Log progress')?.disabled).toBe(true);
    });

    it('sends nothing for a second Done while the first is pending', async () => {
      const { send, topButton, click } = await setup();

      await click(topButton('Done'));
      await click(topButton('Done'));

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('announces the Task as Done and moves focus to the next top pick', async () => {
      const { state, sends, statusLine, topTitle, topButton, click, settle } = await setup();

      await click(topButton('Done'));
      must(sends[0]).resolve(APPLIED);
      state.update((s) => ({
        ...must(s),
        tasks: must(s).tasks.map((t) => (t.id === 'invoice' ? doneTask(t) : t)),
      }));
      await settle();

      expect(statusLine().textContent?.trim()).toBe('\u201cPay the invoice\u201d is Done.');
      expect(topTitle().textContent?.trim()).toBe('Call the dentist');
      expect(document.activeElement).toBe(topTitle());
    });

    it('does nothing when the screen is destroyed while the send is pending', async () => {
      const { fixture, sends, statusLine, handleError, topButton, click } = await setup();
      const line = statusLine();

      await click(topButton('Done'));
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
    });

    it('moves focus to the heading when no Task is ranked any more', async () => {
      const { state, sends, statusLine, heading, topPick, topButton, click, settle } = await setup({
        state: domainState([INVOICE]),
      });

      await click(topButton('Done'));
      must(sends[0]).resolve(APPLIED);
      state.set(domainState([doneTask(INVOICE)]));
      await settle();

      expect(statusLine().textContent?.trim()).toBe('\u201cPay the invoice\u201d is Done.');
      expect(topPick()).toBeNull();
      expect(document.activeElement).toBe(heading());
    });

    it('clears an earlier message when the next Done starts', async () => {
      const { sends, statusLine, topButton, click, settle } = await setup();

      await click(topButton('Done'));
      must(sends[0]).resolve(FAILED);
      await settle();

      expect(statusLine().textContent?.trim()).not.toBe('');

      await click(topButton('Done'));

      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('shows the message of a Failed outcome and keeps the Task as top pick', async () => {
      const { sends, statusLine, topTitle, topButton, click, settle } = await setup();

      await click(topButton('Done'));
      must(sends[0]).resolve(FAILED);
      await settle();

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));
      expect(statusLine().textContent?.trim()).not.toBe('');
      expect(topTitle().textContent?.trim()).toBe('Pay the invoice');
      expect(topButton('Done')?.disabled).toBe(false);
    });

    it('retries a Failed Done with the same command and the same key', async () => {
      const { send, sends, topButton, click, settle } = await setup();

      await click(topButton('Done'));
      must(sends[0]).resolve(FAILED);
      await settle();
      await click(topButton('Done'));

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual([DONE, 'key-1']);
    });

    it('uses a new key for a new Done after the first one was settled without failing', async () => {
      const { send, sends, topButton, click, settle } = await setup();

      await click(topButton('Done'));
      must(sends[0]).resolve({
        _tag: CommandOutcomeTag.Rejected,
        reason: RejectedReason.NotFound,
      });
      await settle();
      await click(topButton('Done'));

      expect(must(send.mock.calls[1])[1]).toBe('key-2');
    });

    it.each<[string, CommandOutcome]>([
      [
        'NotApplicable',
        {
          _tag: CommandOutcomeTag.NotApplicable,
          reason: NotApplicableReason.NotOpen,
          reviewItemId: 'r1',
        },
      ],
      ['Rejected', { _tag: CommandOutcomeTag.Rejected, reason: RejectedReason.NotFound }],
      ['KeyReused', { _tag: CommandOutcomeTag.KeyReused }],
    ])('shows the outcome message for %s', async (_name, outcome) => {
      const { sends, statusLine, topButton, click, settle } = await setup();

      await click(topButton('Done'));
      must(sends[0]).resolve(outcome);
      await settle();

      expect(outcomeMessage(outcome)).not.toBeNull();
      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(outcome));
    });

    it('shows nothing for SignedOut', async () => {
      const { sends, statusLine, topButton, click, settle } = await setup();

      await click(topButton('Done'));
      must(sends[0]).resolve({ _tag: CommandOutcomeTag.SignedOut });
      await settle();

      expect(statusLine().textContent?.trim()).toBe('');
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
        topTitle,
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
      expect(document.activeElement).toBe(topTitle());
      expect(document.querySelector('.asys-top-pick__estimate')?.textContent?.trim()).toBe(
        '15 min',
      );
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

    it('sends nothing from the form while a Done is pending', async () => {
      const { send, topButton, click, typeIntoForm, form, formButton, settle } = await setup();

      await click(topButton('Log progress'));
      await click(topButton('Done'));
      await typeIntoForm('15');

      expect(formButton('Save')?.disabled).toBe(true);

      must(form()).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
      expect((must(send.mock.calls[0])[0] as Command)._tag).toBe(CommandTag.CompleteTask);
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
      const { clockNow, topButton, click, form, formInput, topTitle, settle } =
        await setup(options);

      await click(topButton('Log progress'));

      expect(document.activeElement).toBe(formInput());

      clockNow.set(T0 + 16 * MINUTE);
      await settle();

      expect(topTitle().textContent?.trim()).toBe('Early bird');
      expect(form()).toBeNull();
      expect(document.activeElement).toBe(topTitle());
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

  describe('the task title hooks', () => {
    const titleIdOf = (row: Element): string | null | undefined =>
      row.querySelector('.asys-picker-row__title')?.getAttribute('data-task-id');
    const waitingRows = (rows: () => HTMLAnchorElement[]): HTMLAnchorElement[] =>
      rows().filter((a) => a.classList.contains('asys-picker-row--waiting'));
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
      const { root, waitingHeader, click, rows } = await setup();

      expect(root().querySelector('[data-task-id="flights"]')).toBeNull();
      expect(root().querySelector('[data-task-id="report"]')).toBeNull();

      await click(must(waitingHeader()));

      expect(waitingRows(rows).map(titleIdOf)).toEqual(['flights', 'report']);
    });

    it('marks only the second ranked row title while TaskMorph holds its id', async () => {
      const { root, now, settle } = await setup();
      const secondId = must(now().ranked[1]).task.id;

      TestBed.inject(TaskMorph).taskId.set(secondId);
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

      TestBed.inject(TaskMorph).taskId.set(topId);
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

      TestBed.inject(TaskMorph).taskId.set('not-a-task');
      await settle();

      expect(marked(root)).toEqual([]);

      TestBed.inject(TaskMorph).taskId.set('flights');
      await settle();

      expect(marked(root)).toEqual([]);
    });

    it('marks nothing for null, also after an id was set', async () => {
      const { root, settle } = await setup();

      expect(marked(root)).toEqual([]);

      TestBed.inject(TaskMorph).taskId.set('dentist');
      await settle();

      expect(marked(root)).toHaveLength(1);

      TestBed.inject(TaskMorph).taskId.set(null);
      await settle();

      expect(marked(root)).toEqual([]);
    });

    it('marks only a Waiting row title while TaskMorph holds its id', async () => {
      const { root, waitingHeader, click, rows, settle } = await setup();

      await click(must(waitingHeader()));
      TestBed.inject(TaskMorph).taskId.set('report');
      await settle();

      const elements = marked(root);

      expect(elements).toHaveLength(1);
      expect(elements[0]).toBe(must(waitingRows(rows)[1]).querySelector('.asys-picker-row__title'));
      expect(elements[0]?.getAttribute('data-task-id')).toBe('report');
    });
  });
});
