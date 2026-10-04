// SPDX-License-Identifier: EUPL-1.2
import { ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import {
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  TaskKind,
  TaskStatus,
  WORK_ACTIVE_HOURS,
  type Area,
  type Command,
  type DomainState,
  type ReviewItem,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Ids } from '../../core/platform/ids';
import { Inbox } from './inbox';

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const NOT_APPLICABLE: CommandOutcome = {
  _tag: CommandOutcomeTag.NotApplicable,
  reason: NotApplicableReason.ExpectationFailed,
  reviewItemId: 'rx',
};

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

const area = (id: string, name: string): Area => ({
  id,
  name,
  activeHours: WORK_ACTIVE_HOURS,
  defaultPrivacy: null,
  version: 1,
});

const reviewItem = (
  id: string,
  taskId: string,
  createdAt: number,
  command: Record<string, unknown> = { _tag: CommandTag.CompleteTask },
): ReviewItem => ({
  id,
  kind: 'command_not_applicable',
  subjects: [],
  payload: {
    command: {
      ...command,
      taskId,
      expect: { status: 'open' },
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    },
    reason: 'expectation_failed',
  },
  dedupeKey: null,
  createdAt,
  resolvedAt: null,
});

const domainState = (tasks: readonly Task[], extra: Partial<DomainState> = {}): DomainState => ({
  tasks,
  links: [],
  areas: [],
  reviewItems: [],
  settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
  ...extra,
});

// Inbox Tasks, oldest first: the Importance is missing on A, the Estimate on B, both on C.
const A = task({
  id: 'a',
  title: 'Alpha',
  important: null,
  estimateMinutes: 25,
  captureText: 'alpha raw text',
  createdAt: 1,
});

const B = task({ id: 'b', title: 'Bravo', important: true, estimateMinutes: null, createdAt: 2 });

const C = task({ id: 'c', title: 'Charlie', important: null, estimateMinutes: null, createdAt: 3 });

// Not in the Inbox: open, with both fields set.
const CALL = task({ id: 't1', title: 'Call Marit', createdAt: 10 });

const THREE = domainState([A, B, C]);

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
  const state = signal<DomainState | null>(options.state === undefined ? THREE : options.state);
  const status = signal<SyncStatus>(options.status ?? SyncStatus.Ready);
  const awaitingSync = signal<ReadonlySet<string>>(new Set());
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
      { provide: DataStore, useValue: { state, status, awaitingSync, send, refresh } },
      { provide: Ids, useValue: { next } },
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  });

  const fixture = TestBed.createComponent(Inbox);

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
  const heading = (): HTMLElement => must(root().querySelector('h1.inbox__title'));
  const statusLine = (): HTMLElement => must(root().querySelector('p.inbox__status'));
  const card = (): HTMLElement | null => root().querySelector('asys-triage-card');
  const cardTitle = (): HTMLElement => must(root().querySelector('.asys-triage__title'));
  const progress = (): string | undefined =>
    root().querySelector('.asys-triage__progress')?.textContent?.trim();
  const cardButton = (name: string): HTMLButtonElement | undefined =>
    Array.from(card()?.querySelectorAll('button') ?? []).find(
      (b) => (b.textContent ?? '').trim() === name,
    );
  const confirmButton = (name: string): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll('.asys-confirm button')).find(
      (b) => (b.textContent ?? '').trim() === name,
    ) as HTMLButtonElement | undefined;
  const reviews = (): HTMLElement[] =>
    Array.from(root().querySelectorAll<HTMLElement>('ul.inbox__reviews > li'));
  const dismissButton = (index = 0): HTMLButtonElement | undefined =>
    Array.from(reviews()[index]?.querySelectorAll('button') ?? []).find(
      (b) => (b.textContent ?? '').trim() === 'Dismiss',
    );
  const click = async (el: HTMLElement | undefined): Promise<void> => {
    must(el).click();
    await settle();
  };
  const important = async (value: boolean): Promise<void> => {
    await click(root().querySelectorAll<HTMLElement>('.asys-segmented__option')[value ? 0 : 1]);
  };
  // The chips are 5, 15, 25, 45, 60 and 120 minutes.
  const chip = async (index: number): Promise<void> => {
    await click(root().querySelectorAll<HTMLElement>('.asys-estimate__chip--num')[index]);
  };
  // The pressed Importance option and Estimate chip, as 'importance:<index>' and 'chip:<index>'.
  const pressed = (): string[] => {
    const mark = (selector: string, name: string): string[] =>
      Array.from(root().querySelectorAll(selector))
        .map((b, i) => (b.getAttribute('aria-pressed') === 'true' ? `${name}:${i}` : ''))
        .filter((m) => m !== '');

    return [
      ...mark('.asys-segmented__option', 'importance'),
      ...mark('.asys-estimate__chip--num', 'chip'),
    ];
  };
  const chooseArea = async (value: string): Promise<void> => {
    await click(cardButton('Change'));

    const select = must(root().querySelector<HTMLSelectElement>('asys-select-field select'));

    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  };
  const areaOptions = (): string[] =>
    Array.from(root().querySelectorAll<HTMLOptionElement>('asys-select-field option')).map(
      (o) => o.value,
    );
  // Resolves the n-th send; the state is updated first, as the store does after its follow-up sync.
  const finish = async (
    n: number,
    outcome: CommandOutcome,
    nextState?: DomainState,
  ): Promise<void> => {
    if (nextState !== undefined) {
      state.set(nextState);
    }

    must(sends[n]).resolve(outcome);
    await settle();
  };

  return {
    fixture,
    state,
    status,
    awaitingSync,
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
    card,
    cardTitle,
    progress,
    cardButton,
    confirmButton,
    reviews,
    dismissButton,
    click,
    important,
    chip,
    pressed,
    chooseArea,
    areaOptions,
    finish,
  };
};

const sent = (send: { mock: { calls: unknown[][] } }, n: number): Command =>
  must(send.mock.calls[n])[0] as Command;

const without = (state: DomainState, ...ids: string[]): DomainState => ({
  ...state,
  tasks: state.tasks.filter((t) => !ids.includes(t.id)),
});

describe('Inbox', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('without state', () => {
    it('shows Loading… and no alert while there is no state', async () => {
      const { root, text, card } = await setup({ state: null, status: SyncStatus.Loading });

      expect(text()).toContain('Loading…');
      expect(root().querySelector('[role="alert"]')).toBeNull();
      expect(card()).toBeNull();
    });

    it('shows an alert and Try again when loading failed, and Try again refreshes', async () => {
      const { root, text, refresh, settle } = await setup({
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
    });

    it('always has the heading and an empty status line right after it', async () => {
      const { heading, statusLine } = await setup({ state: null });

      expect(heading().textContent?.trim()).toBe('Inbox');
      expect(heading().tagName).toBe('H1');
      expect(heading().getAttribute('tabindex')).toBe('-1');
      expect(statusLine().getAttribute('role')).toBe('status');
      expect(statusLine().textContent?.trim()).toBe('');
      expect(heading().nextElementSibling).toBe(statusLine());
    });

    it('shows the Tasks, not the alert, when there is state although the status is Failed', async () => {
      const { root, card } = await setup({ status: SyncStatus.Failed });

      expect(root().querySelector('[role="alert"]')).toBeNull();
      expect(card()).not.toBeNull();
    });
  });

  describe('the layout', () => {
    it('shows the Review items before the card, under the heading and the status line', async () => {
      const { reviews, card, heading, statusLine } = await setup({
        state: domainState([A, B, CALL], { reviewItems: [reviewItem('r1', 't1', 1)] }),
      });

      expect(reviews()).toHaveLength(1);
      expect(heading().nextElementSibling).toBe(statusLine());
      expect(
        must(reviews()[0]).compareDocumentPosition(must(card())) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('says Nothing waits here. when there is no Review item and no Inbox Task', async () => {
      const { root, card, reviews } = await setup({ state: domainState([CALL]) });

      expect(root().querySelector('p.inbox__text')?.textContent?.trim()).toBe(
        'Nothing waits here.',
      );
      expect(card()).toBeNull();
      expect(reviews()).toHaveLength(0);
    });

    it('does not say it while a Review item waits', async () => {
      const { text } = await setup({
        state: domainState([CALL], { reviewItems: [reviewItem('r1', 't1', 1)] }),
      });

      expect(text()).not.toContain('Nothing waits here.');
    });

    it('does not say it while an Inbox Task waits', async () => {
      const { text } = await setup();

      expect(text()).not.toContain('Nothing waits here.');
    });

    it('does not list a resolved Review item', async () => {
      const { reviews } = await setup({
        state: domainState([CALL], {
          reviewItems: [{ ...reviewItem('r1', 't1', 1), resolvedAt: 5 }],
        }),
      });

      expect(reviews()).toHaveLength(0);
    });

    it('says Nothing waits here. when the Inbox empties from outside', async () => {
      const { state, root, card, settle } = await setup();

      state.set(domainState([CALL]));
      await settle();

      expect(root().querySelector('p.inbox__text')?.textContent?.trim()).toBe(
        'Nothing waits here.',
      );
      expect(card()).toBeNull();
    });
  });

  describe('the Review items', () => {
    const WITH_REVIEWS = domainState([CALL], {
      reviewItems: [
        reviewItem('r1', 't1', 1),
        reviewItem('r2', 'gone', 2),
        reviewItem('r3', 't1', 3),
      ],
    });

    it('show the question, the reason and the Dismiss action, oldest first', async () => {
      const { reviews, text, dismissButton } = await setup({ state: WITH_REVIEWS });

      expect(reviews()).toHaveLength(3);
      expect(text(must(reviews()[0]))).toContain('Marking “Call Marit” Done no longer applies.');
      expect(text(must(reviews()[0]))).toContain('It was closed or changed elsewhere first.');
      expect(text(must(reviews()[1]))).toContain('Marking a Task Done no longer applies.');
      expect(dismissButton(0)?.disabled).toBe(false);
    });

    it('link to the Task with Open Task when it is in the working set', async () => {
      const { reviews } = await setup({ state: WITH_REVIEWS });
      const link = must(must(reviews()[0]).querySelector('a'));

      expect(link.textContent?.trim()).toBe('Open Task');
      expect(link.getAttribute('href')).toBe('/tasks/t1');
      expect(
        must(must(reviews()[0]).querySelector('button')).compareDocumentPosition(link) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('have no Open Task link when the Task is not in the working set', async () => {
      const { reviews } = await setup({ state: WITH_REVIEWS });

      expect(must(reviews()[1]).querySelector('a')).toBeNull();
    });

    it('fall back to a decision for an unknown kind', async () => {
      const { reviews, text } = await setup({
        state: domainState([CALL], {
          reviewItems: [{ ...reviewItem('r1', 't1', 1), kind: 'other', payload: null }],
        }),
      });

      expect(text(must(reviews()[0]))).toContain('ASYS needs a decision.');
      expect(must(reviews()[0]).querySelector('a')).toBeNull();
    });

    it('send ResolveReviewItem with the key from the attempts on Dismiss, and are busy meanwhile', async () => {
      const { send, dismissButton, click } = await setup({ state: WITH_REVIEWS });

      await click(dismissButton(0));

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.ResolveReviewItem, reviewItemId: 'r1' },
        'key-1',
      );
      expect(dismissButton(0)?.disabled).toBe(true);
      expect(dismissButton(1)?.disabled).toBe(false);

      await click(dismissButton(0));

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('do nothing when the screen is destroyed while Dismiss is pending', async () => {
      const { fixture, sends, statusLine, handleError, dismissButton, click } = await setup({
        state: WITH_REVIEWS,
      });
      const line = statusLine();

      await click(dismissButton(0));
      fixture.destroy();
      must(sends[0]).resolve(FAILED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
    });

    it('are busy and show the sync note after them while their id awaits the server', async () => {
      const { reviews, dismissButton, awaitingSync, send, click, settle } = await setup({
        state: WITH_REVIEWS,
      });

      awaitingSync.set(new Set(['r2']));
      await settle();

      const note = must(must(reviews()[1]).querySelector('p.inbox__sync'));

      expect(note.textContent?.trim()).toBe('Saved. Waiting for the server.');
      expect(
        must(must(reviews()[1]).querySelector('asys-review-item')).compareDocumentPosition(note) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(dismissButton(1)?.disabled).toBe(true);
      expect(dismissButton(0)?.disabled).toBe(false);
      expect(must(reviews()[0]).querySelector('.inbox__sync')).toBeNull();

      await click(dismissButton(1));

      expect(send).not.toHaveBeenCalled();
    });

    it('move focus to the next Review item when Dismiss is applied', async () => {
      const { finish, dismissButton, reviews, click, text } = await setup({
        state: WITH_REVIEWS,
      });

      await click(dismissButton(0));
      await finish(0, APPLIED, {
        ...WITH_REVIEWS,
        reviewItems: WITH_REVIEWS.reviewItems.filter((i) => i.id !== 'r1'),
      });

      expect(reviews()).toHaveLength(2);
      expect(text(must(reviews()[0]))).toContain('Marking a Task Done');
      expect(document.activeElement).toBe(
        must(reviews()[0]).querySelector('.asys-review__question'),
      );
    });

    it('move focus to the heading when the last Review item is dismissed', async () => {
      const { finish, dismissButton, reviews, heading, click } = await setup({
        state: domainState([CALL], {
          reviewItems: [reviewItem('r1', 't1', 1), reviewItem('r2', 't1', 2)],
        }),
      });

      await click(dismissButton(1));
      await finish(0, APPLIED, domainState([CALL], { reviewItems: [reviewItem('r1', 't1', 1)] }));

      expect(reviews()).toHaveLength(1);
      expect(document.activeElement).toBe(heading());
    });

    it('show the outcome message on Failed and retry with the same key', async () => {
      const { send, finish, statusLine, dismissButton, click } = await setup({
        state: WITH_REVIEWS,
      });

      await click(dismissButton(0));
      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));
      expect(dismissButton(0)?.disabled).toBe(false);

      await click(dismissButton(0));

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual([
        { _tag: CommandTag.ResolveReviewItem, reviewItemId: 'r1' },
        'key-1',
      ]);
      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('show the outcome message for another outcome and leave focus alone', async () => {
      const { finish, statusLine, dismissButton, click } = await setup({ state: WITH_REVIEWS });
      const outcome: CommandOutcome = {
        _tag: CommandOutcomeTag.Rejected,
        reason: RejectedReason.NotFound,
      };

      must(dismissButton(0)).focus();
      await click(dismissButton(0));
      await finish(0, outcome);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(outcome));
      expect(statusLine().textContent?.trim()).not.toBe('');
      expect(document.activeElement).toBe(dismissButton(0));
    });
  });

  describe('the Triage card', () => {
    it('shows the oldest Inbox Task with its progress and its capture text', async () => {
      const { card, cardTitle, progress, root } = await setup();

      expect(card()).not.toBeNull();
      expect(root().querySelectorAll('asys-triage-card')).toHaveLength(1);
      expect(cardTitle().textContent?.trim()).toBe('Alpha');
      expect(progress()).toBe('1 of 3');
      expect(root().querySelector('.asys-triage__raw')?.textContent?.trim()).toBe('alpha raw text');
    });

    it('starts the draft from the stored Task', async () => {
      const { state, pressed, settle, cardButton } = await setup({ state: domainState([B, C]) });

      expect(pressed()).toEqual(['importance:0']);
      expect(cardButton('Triage')?.disabled).toBe(true);

      state.set(domainState([A]));
      await settle();

      expect(pressed()).toEqual(['chip:2']);
    });

    it('offers the Areas ordered by name, then id, by code units', async () => {
      const { chooseArea, areaOptions } = await setup({
        state: domainState([A], {
          areas: [
            area('z1', 'beta'),
            area('a2', 'Work'),
            area('a1', 'Work'),
            area('m1', 'Zed'),
            area('n1', 'Alpha'),
          ],
        }),
      });

      await chooseArea('');

      expect(areaOptions()).toEqual(['', 'n1', 'a1', 'a2', 'm1', 'z1']);
    });

    it('shows Later only while more than one Inbox Task exists', async () => {
      const { cardButton, state, settle } = await setup();

      expect(cardButton('Later')).toBeDefined();

      state.set(domainState([A]));
      await settle();

      expect(cardButton('Later')).toBeUndefined();
    });

    it('Edit navigates to the Task', async () => {
      const { fixture, cardButton, click } = await setup();
      const router = fixture.debugElement.injector.get(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      await click(cardButton('Edit'));

      expect(navigate).toHaveBeenCalledTimes(1);

      const target = must(navigate.mock.calls[0])[0];

      expect(typeof target === 'string' ? target : router.serializeUrl(target as UrlTree)).toBe(
        '/tasks/a',
      );
    });

    describe('Triage', () => {
      const TRIAGE_A: Command = {
        _tag: CommandTag.TriageTask,
        taskId: 'a',
        important: true,
        estimateMinutes: 25,
        expect: { status: TaskStatus.Open },
      };

      it('sends the chosen Importance and Estimate without an Area when the Area is unchanged', async () => {
        const { send, important, cardButton, click } = await setup();

        await important(true);
        await click(cardButton('Triage'));

        expect(send).toHaveBeenCalledExactlyOnceWith(TRIAGE_A, 'key-1');
        expect(Object.keys(sent(send, 0))).not.toContain('areaId');
      });

      it('sends the Estimate chosen with a chip', async () => {
        const { send, important, chip, cardButton, click } = await setup();

        await important(false);
        await chip(1);
        await click(cardButton('Triage'));

        expect(sent(send, 0)).toEqual({
          ...TRIAGE_A,
          important: false,
          estimateMinutes: 15,
        });
      });

      it('sends the Area when it differs from the stored one', async () => {
        const { send, important, chooseArea, cardButton, click } = await setup({
          state: domainState([A], { areas: [area('a1', 'Work')] }),
        });

        await important(true);
        await chooseArea('a1');
        await click(cardButton('Triage'));

        expect(sent(send, 0)).toEqual({ ...TRIAGE_A, areaId: 'a1' });
      });

      it('sends no Area when the stored Area is kept', async () => {
        const { send, important, cardButton, click } = await setup({
          state: domainState([{ ...A, areaId: 'a1' }], { areas: [area('a1', 'Work')] }),
        });

        await important(true);
        await click(cardButton('Triage'));

        expect(Object.keys(sent(send, 0))).not.toContain('areaId');
        expect(sent(send, 0)).toEqual(TRIAGE_A);
      });

      it('sends areaId null when the stored Area is removed', async () => {
        const { send, important, chooseArea, cardButton, click } = await setup({
          state: domainState([{ ...A, areaId: 'a1' }], { areas: [area('a1', 'Work')] }),
        });

        await important(true);
        await chooseArea('');
        await click(cardButton('Triage'));

        expect(sent(send, 0)).toEqual({ ...TRIAGE_A, areaId: null });
      });

      it('does nothing when the screen is destroyed while the send is pending', async () => {
        const { fixture, sends, statusLine, handleError, important, cardButton, click } =
          await setup();
        const line = statusLine();

        await important(true);
        await click(cardButton('Triage'));
        fixture.destroy();
        must(sends[0]).resolve(FAILED);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handleError).not.toHaveBeenCalled();
        expect(line.textContent?.trim()).toBe('');
      });

      it('disables the card while it is pending and sends once', async () => {
        const { send, important, cardButton, click } = await setup();

        await important(true);
        await click(cardButton('Triage'));

        expect(cardButton('Triage')?.disabled).toBe(true);

        await click(cardButton('Triage'));

        expect(send).toHaveBeenCalledTimes(1);
      });

      it('counts the Task as handled when applied: 2 of 3, then moves focus to the next title', async () => {
        const { state, important, cardButton, click, finish, progress, cardTitle } = await setup();

        await important(true);
        await click(cardButton('Triage'));

        expect(progress()).toBe('1 of 3');

        await finish(0, APPLIED, without(must(state()), 'a'));

        expect(cardTitle().textContent?.trim()).toBe('Bravo');
        expect(progress()).toBe('2 of 3');
        expect(document.activeElement).toBe(cardTitle());
      });

      it('moves focus to the heading when no card is left', async () => {
        const { important, cardButton, click, finish, card, heading, root } = await setup({
          state: domainState([A]),
        });

        await important(true);
        await click(cardButton('Triage'));
        await finish(0, APPLIED, domainState([{ ...A, important: true }]));

        expect(card()).toBeNull();
        expect(root().querySelector('p.inbox__text')?.textContent?.trim()).toBe(
          'Nothing waits here.',
        );
        expect(document.activeElement).toBe(heading());
      });

      it('keeps the progress while the triaged Task stays in the Inbox, and shows the sync note', async () => {
        const {
          important,
          cardButton,
          click,
          finish,
          progress,
          awaitingSync,
          card,
          state,
          settle,
        } = await setup();

        await important(true);
        await click(cardButton('Triage'));
        awaitingSync.set(new Set(['a']));
        await finish(0, APPLIED);

        expect(progress()).toBe('1 of 3');
        expect(cardButton('Triage')?.disabled).toBe(true);
        expect(must(card()).nextElementSibling?.matches('p.inbox__sync')).toBe(true);
        expect(must(card()).nextElementSibling?.textContent?.trim()).toBe(
          'Saved. Waiting for the server.',
        );

        awaitingSync.set(new Set());
        state.set(without(must(state()), 'a'));
        await settle();

        expect(progress()).toBe('2 of 3');
      });

      it('shows no sync note for the id of another Task', async () => {
        const { awaitingSync, root, cardButton, important, settle } = await setup();

        await important(true);
        awaitingSync.set(new Set(['b']));
        await settle();

        expect(root().querySelector('.inbox__sync')).toBeNull();
        expect(cardButton('Triage')?.disabled).toBe(false);
      });

      it('disables the card and sends nothing while the Task awaits the server', async () => {
        const { awaitingSync, important, cardButton, send, settle, root } = await setup();

        await important(true);
        awaitingSync.set(new Set(['a']));
        await settle();

        expect(root().querySelector('p.inbox__sync')?.textContent?.trim()).toBe(
          'Saved. Waiting for the server.',
        );
        expect(cardButton('Triage')?.disabled).toBe(true);
        expect(send).not.toHaveBeenCalled();
      });

      it('shows the message on NotApplicable, does not count it as handled and focuses the title', async () => {
        const { important, cardButton, click, finish, progress, cardTitle, statusLine } =
          await setup();

        await important(true);
        await click(cardButton('Triage'));
        await finish(
          0,
          NOT_APPLICABLE,
          domainState([B, C], { reviewItems: [reviewItem('rx', 'a', 5, { _tag: 'TriageTask' })] }),
        );

        expect(statusLine().textContent?.trim()).toBe(outcomeMessage(NOT_APPLICABLE));
        expect(cardTitle().textContent?.trim()).toBe('Bravo');
        expect(progress()).toBe('1 of 2');
        expect(document.activeElement).toBe(cardTitle());
      });

      it('shows the message on Failed, keeps the draft and retries with the same key', async () => {
        const { send, important, cardButton, click, finish, statusLine, pressed, progress } =
          await setup();

        await important(true);
        await click(cardButton('Triage'));
        await finish(0, FAILED);

        expect(statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));
        expect(progress()).toBe('1 of 3');
        expect(pressed()).toEqual(['importance:0', 'chip:2']);
        expect(cardButton('Triage')?.disabled).toBe(false);

        await click(cardButton('Triage'));

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1]).toEqual([TRIAGE_A, 'key-1']);
        expect(statusLine().textContent?.trim()).toBe('');
      });

      it('shows the message of a Rejected outcome', async () => {
        const { important, cardButton, click, finish, statusLine } = await setup();
        const outcome: CommandOutcome = {
          _tag: CommandOutcomeTag.Rejected,
          reason: RejectedReason.UnknownArea,
        };

        await important(true);
        await click(cardButton('Triage'));
        await finish(0, outcome);

        expect(statusLine().textContent?.trim()).toBe(outcomeMessage(outcome));
        expect(statusLine().textContent?.trim()).not.toBe('');
      });

      it('uses a new key for a new Triage once the first settled without failing', async () => {
        const { send, important, cardButton, click, finish } = await setup();
        const outcome: CommandOutcome = {
          _tag: CommandOutcomeTag.Rejected,
          reason: RejectedReason.NotFound,
        };

        await important(true);
        await click(cardButton('Triage'));
        await finish(0, outcome);
        await click(cardButton('Triage'));

        expect(must(send.mock.calls[1])[1]).toBe('key-2');
      });
    });

    describe('Later', () => {
      it('moves on to the next Task, keeps the progress and focuses the new title', async () => {
        const { cardButton, click, cardTitle, progress } = await setup();

        await click(cardButton('Later'));

        expect(cardTitle().textContent?.trim()).toBe('Bravo');
        expect(progress()).toBe('1 of 3');
        expect(document.activeElement).toBe(cardTitle());
      });

      it('wraps around to the oldest Task once every Task is deferred', async () => {
        const { cardButton, click, cardTitle } = await setup();

        await click(cardButton('Later'));
        await click(cardButton('Later'));

        expect(cardTitle().textContent?.trim()).toBe('Charlie');

        await click(cardButton('Later'));

        expect(cardTitle().textContent?.trim()).toBe('Alpha');

        await click(cardButton('Later'));

        expect(cardTitle().textContent?.trim()).toBe('Bravo');
      });

      it('wraps with two Tasks', async () => {
        const { cardButton, click, cardTitle } = await setup({ state: domainState([A, B]) });

        await click(cardButton('Later'));
        await click(cardButton('Later'));

        expect(cardTitle().textContent?.trim()).toBe('Alpha');
      });

      it('skips a deferred Task after another one was triaged', async () => {
        const { state, cardButton, click, cardTitle, chip, finish } = await setup();

        await click(cardButton('Later'));
        await chip(2);
        await click(cardButton('Triage'));
        await finish(0, APPLIED, without(must(state()), 'b'));

        expect(cardTitle().textContent?.trim()).toBe('Charlie');
      });

      it('with A and B deferred and C triaged elsewhere, shows A and then B on Later', async () => {
        const { state, cardButton, click, cardTitle, settle } = await setup();

        await click(cardButton('Later'));
        await click(cardButton('Later'));

        expect(cardTitle().textContent?.trim()).toBe('Charlie');

        state.set(without(must(state()), 'c'));
        await settle();

        expect(cardTitle().textContent?.trim()).toBe('Alpha');

        await click(cardButton('Later'));

        expect(cardTitle().textContent?.trim()).toBe('Bravo');
      });
    });

    describe('Drop', () => {
      const DROP_A: Command = {
        _tag: CommandTag.DropTask,
        taskId: 'a',
        expect: { status: TaskStatus.Open },
      };

      it('asks for confirmation first and sends nothing', async () => {
        const { cardButton, click, root, send } = await setup();

        await click(cardButton('Drop'));

        expect(root().querySelector('.asys-confirm')).not.toBeNull();
        expect(root().querySelector('.asys-confirm')?.textContent).toContain('Drop “Alpha”?');
        expect(send).not.toHaveBeenCalled();
      });

      it('ignores a native DOM drop event on the card', async () => {
        const { card, cardButton, click, send, settle } = await setup();

        must(card()).dispatchEvent(new Event('drop', { bubbles: true }));
        await settle();

        expect(send).not.toHaveBeenCalled();

        await click(cardButton('Drop'));
        must(card()).dispatchEvent(new Event('drop', { bubbles: true }));
        await settle();

        expect(send).not.toHaveBeenCalled();
      });

      it('does nothing when the screen is destroyed while the drop is pending', async () => {
        const { fixture, sends, statusLine, handleError, cardButton, click, confirmButton } =
          await setup();
        const line = statusLine();

        await click(cardButton('Drop'));
        await click(confirmButton('Drop'));
        fixture.destroy();
        must(sends[0]).resolve(APPLIED);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(handleError).not.toHaveBeenCalled();
        expect(line.textContent?.trim()).toBe('');
      });

      it('sends nothing on Cancel', async () => {
        const { cardButton, click, confirmButton, root, send } = await setup();

        await click(cardButton('Drop'));
        await click(confirmButton('Cancel'));

        expect(root().querySelector('.asys-confirm')).toBeNull();
        expect(send).not.toHaveBeenCalled();
      });

      it('sends DropTask on confirm and counts it as handled when applied', async () => {
        const { state, send, cardButton, click, confirmButton, finish, progress, cardTitle, root } =
          await setup();

        await click(cardButton('Drop'));
        await click(confirmButton('Drop'));

        expect(send).toHaveBeenCalledExactlyOnceWith(DROP_A, 'key-1');

        await finish(0, APPLIED, without(must(state()), 'a'));

        expect(cardTitle().textContent?.trim()).toBe('Bravo');
        expect(progress()).toBe('2 of 3');
        expect(document.activeElement).toBe(cardTitle());
        expect(root().querySelector('.asys-confirm')).toBeNull();
      });

      it('moves focus to the heading when the last Task is dropped', async () => {
        const { cardButton, click, confirmButton, finish, heading, card } = await setup({
          state: domainState([A]),
        });

        await click(cardButton('Drop'));
        await click(confirmButton('Drop'));
        await finish(0, APPLIED, domainState([]));

        expect(card()).toBeNull();
        expect(document.activeElement).toBe(heading());
      });

      it('shows the message and focuses the title on NotApplicable', async () => {
        const { cardButton, click, confirmButton, finish, statusLine, cardTitle, progress } =
          await setup();

        await click(cardButton('Drop'));
        await click(confirmButton('Drop'));
        await finish(0, NOT_APPLICABLE, domainState([B, C]));

        expect(statusLine().textContent?.trim()).toBe(outcomeMessage(NOT_APPLICABLE));
        expect(document.activeElement).toBe(cardTitle());
        expect(cardTitle().textContent?.trim()).toBe('Bravo');
        expect(progress()).toBe('1 of 2');
      });

      it('retries a Failed drop with the same key', async () => {
        const { send, cardButton, click, confirmButton, finish, statusLine } = await setup();

        await click(cardButton('Drop'));
        await click(confirmButton('Drop'));
        await finish(0, FAILED);

        expect(statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));

        if (confirmButton('Drop') === undefined) {
          await click(cardButton('Drop'));
        }

        await click(confirmButton('Drop'));

        expect(send).toHaveBeenCalledTimes(2);
        expect(send.mock.calls[1]).toEqual([DROP_A, 'key-1']);
      });

      it('shows the next card with its confirmation closed', async () => {
        const { state, cardButton, click, confirmButton, finish, root } = await setup();

        await click(cardButton('Drop'));
        await click(confirmButton('Drop'));
        await finish(0, APPLIED, without(must(state()), 'a'));

        expect(root().querySelector('.asys-confirm')).toBeNull();
      });
    });

    describe('when the state changes from outside', () => {
      it('moves on when the Task was triaged elsewhere, and resets the draft to the next Task', async () => {
        const { state, important, cardTitle, progress, pressed, settle } = await setup();

        await important(false);

        expect(pressed()).toEqual(['importance:1', 'chip:2']);

        state.set(without(must(state()), 'a'));
        await settle();

        expect(cardTitle().textContent?.trim()).toBe('Bravo');
        expect(pressed()).toEqual(['importance:0']);
        expect(progress()).toBe('1 of 2');
      });

      it('moves on when the Task was closed elsewhere', async () => {
        const { state, cardTitle, progress, settle } = await setup();

        state.set({
          ...must(state()),
          tasks: must(state()).tasks.map((t) =>
            t.id === 'a' ? { ...t, status: TaskStatus.Done, closedAt: 9 } : t,
          ),
        });
        await settle();

        expect(cardTitle().textContent?.trim()).toBe('Bravo');
        expect(progress()).toBe('1 of 2');
      });

      it('resets the draft when the Task was triaged elsewhere into a different one with the same values', async () => {
        const { state, important, pressed, settle } = await setup({
          state: domainState([A, { ...A, id: 'a2', title: 'Alpha two', createdAt: 2 }]),
        });

        await important(false);
        state.set(without(must(state()), 'a'));
        await settle();

        expect(pressed()).toEqual(['chip:2']);
      });

      it('keeps the draft while the same Task changes underneath', async () => {
        const { state, important, pressed, cardTitle, settle } = await setup();

        await important(true);
        state.set({
          ...must(state()),
          tasks: must(state()).tasks.map((t) =>
            t.id === 'a' ? { ...t, title: 'Alpha renamed' } : t,
          ),
        });
        await settle();

        expect(cardTitle().textContent?.trim()).toBe('Alpha renamed');
        expect(pressed()).toEqual(['importance:0', 'chip:2']);
      });

      it('lets the total follow Tasks that come and go', async () => {
        const { state, progress, settle } = await setup();

        expect(progress()).toBe('1 of 3');

        state.set(without(must(state()), 'c'));
        await settle();

        expect(progress()).toBe('1 of 2');

        state.set({
          ...must(state()),
          tasks: [
            ...must(state()).tasks,
            task({ id: 'd', title: 'Delta', important: null, createdAt: 4 }),
            task({ id: 'e', title: 'Echo', important: null, createdAt: 5 }),
          ],
        });
        await settle();

        expect(progress()).toBe('1 of 4');
      });

      it('shows the card again when a Task appears in an empty Inbox', async () => {
        const { state, card, cardTitle, settle } = await setup({ state: domainState([CALL]) });

        expect(card()).toBeNull();

        state.set(domainState([CALL, A]));
        await settle();

        expect(cardTitle().textContent?.trim()).toBe('Alpha');
      });
    });
  });

  describe('the status line', () => {
    it('stays displayed while it is empty, so later messages are announced', async () => {
      const { statusLine } = await setup();

      expect(statusLine().textContent?.trim()).toBe('');
      expect(getComputedStyle(statusLine()).display).not.toBe('none');
    });

    it('is cleared when the next action starts', async () => {
      const { important, cardButton, click, finish, statusLine, send } = await setup();

      await important(true);
      await click(cardButton('Triage'));
      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).not.toBe('');

      await click(cardButton('Triage'));

      expect(send).toHaveBeenCalledTimes(2);
      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('shows nothing for SignedOut', async () => {
      const { important, cardButton, click, finish, statusLine } = await setup();

      await important(true);
      await click(cardButton('Triage'));
      await finish(0, { _tag: CommandOutcomeTag.SignedOut });

      expect(statusLine().textContent?.trim()).toBe('');
    });
  });
});
