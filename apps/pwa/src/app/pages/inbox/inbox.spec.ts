// SPDX-License-Identifier: EUPL-1.2
import { Component, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import {
  CommandTag,
  explainTask,
  type Instant,
  RejectedReason,
  TaskExplanationTag,
  TaskKind,
  TaskStatus,
  WORK_ACTIVE_HOURS,
  type Area,
  type Command,
  type CurrentArea,
  type DomainState,
  type ReviewItem,
  type Task,
  type TriageTask,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { type PendingUndo, type Undone, UndoWindow } from '../../core/data/undo-window';
import { Clock } from '../../core/platform/clock';
import { Ids } from '../../core/platform/ids';
import { Inbox } from './inbox';

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

/** 10:00 in Amsterdam on 2026-10-04. */
const T0 = Date.parse('2026-10-04T08:00:00.000Z') as Instant;

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
  palette: null,
  version: 1,
});

const reviewItem = (id: string, taskId: string, createdAt: number): ReviewItem => ({
  id,
  kind: 'command_not_applicable',
  subjects: [],
  payload: {
    command: {
      _tag: CommandTag.CompleteTask,
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

const THREE = domainState([A, B, C, CALL]);

const TRIAGE_A: TriageTask = {
  _tag: CommandTag.TriageTask,
  taskId: 'a',
  important: true,
  estimateMinutes: 25,
  expect: { status: TaskStatus.Open, version: 1 },
};

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

const without = (state: DomainState, id: string): DomainState => ({
  ...state,
  tasks: state.tasks.filter((t) => t.id !== id),
});

@Component({ template: '' })
class Stub {}

interface SetupOptions {
  readonly state?: DomainState | null;
  readonly status?: SyncStatus;
  readonly currentArea?: CurrentArea | null;
}

const setup = async (options: SetupOptions = {}) => {
  const state = signal<DomainState | null>(options.state === undefined ? THREE : options.state);
  const status = signal<SyncStatus>(options.status ?? SyncStatus.Ready);
  const awaitingSync = signal<ReadonlySet<string>>(new Set());
  const currentArea = signal<CurrentArea | null>(options.currentArea ?? null);
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
  // As a hold would: the Task leaves the state at once, and an Undo puts the stored Task back.
  const held: Task[] = [];
  const hide = (heldTask: Task): void => {
    const stored = state()?.tasks.find((t) => t.id === heldTask.id);

    if (stored !== undefined) {
      held.push(stored);
    }

    state.update((current) => (current === null ? current : without(current, heldTask.id)));
  };
  const triage = vi.fn<(task: Task, command: TriageTask, quadrantWord: string) => void>(hide);
  const drop = vi.fn<(task: Task) => void>(hide);
  const undoWindow = {
    triage,
    drop,
    pending: signal<PendingUndo | null>(null),
    undone: signal<Undone | null>(null),
  };

  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'tasks/:id', component: Stub }]),
      { provide: DataStore, useValue: { state, status, awaitingSync, currentArea, send, refresh } },
      { provide: UndoWindow, useValue: undoWindow },
      { provide: Clock, useValue: { now: signal(T0) } },
      { provide: Ids, useValue: { next } },
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  });

  const fixture = TestBed.createComponent(Inbox);
  const router = TestBed.inject(Router);

  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const text = (el: Element | null | undefined = root()): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const heading = (): HTMLElement => must(root().querySelector('h1.inbox__title'));
  const statusLine = (): HTMLElement => must(root().querySelector('p.inbox__status'));
  const card = (): HTMLElement | null => root().querySelector('asys-triage-card');
  const section = (): HTMLElement | null => root().querySelector('section.asys-triage');
  const titleField = (): HTMLTextAreaElement =>
    must(root().querySelector<HTMLTextAreaElement>('textarea.asys-triage__title'));
  const progress = (): string => text(root().querySelector('.asys-triage__progress'));
  const hint = (): HTMLElement | null => root().querySelector('p.asys-triage__hint');
  const buttonIn = (scope: ParentNode, name: string): HTMLButtonElement | undefined =>
    Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((b) => text(b) === name);
  const barButton = (name: string): HTMLButtonElement | undefined =>
    buttonIn(must(root().querySelector('footer.inbox__actions'), 'the action bar'), name);
  const triageButton = (): HTMLButtonElement =>
    must(root().querySelector<HTMLButtonElement>('button.inbox__triage'));
  const reviews = (): HTMLElement[] =>
    Array.from(root().querySelectorAll<HTMLElement>('ul.inbox__reviews > li'));
  const dismissButton = (index = 0): HTMLButtonElement | undefined =>
    buttonIn(must(reviews()[index]), 'Dismiss');
  const click = async (el: HTMLElement | undefined): Promise<void> => {
    must(el).click();
    await settle();
  };
  const important = async (value: boolean): Promise<void> => {
    await click(buttonIn(must(card()), value ? 'Important' : 'Not important'));
  };
  const estimate = async (label: string): Promise<void> => {
    await click(
      must(
        root().querySelector<HTMLElement>(
          `asys-estimate-picker .asys-segment[aria-label="${label}"]`,
        ),
      ),
    );
  };
  const pressedEstimate = (): string | null =>
    root()
      .querySelector('asys-estimate-picker .asys-segment[aria-pressed="true"]')
      ?.getAttribute('aria-label') ?? null;
  const pressedImportance = (): string | null =>
    text(root().querySelector('asys-segmented-control .asys-segment[aria-pressed="true"]')) || null;
  const typeTitle = async (value: string): Promise<void> => {
    const field = titleField();

    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const shownArea = (): string => text(root().querySelector('asys-choice-row'));
  const chooseArea = async (name: string): Promise<void> => {
    await click(
      Array.from(root().querySelectorAll<HTMLButtonElement>('button.asys-choice-row__open')).find(
        (b) => text(b).startsWith('Area'),
      ),
    );
    await click(
      Array.from(
        root().querySelectorAll<HTMLButtonElement>('ul.asys-option-list button.asys-field-row'),
      ).find((b) => text(b) === name),
    );
  };
  const sheet = (heading: string): HTMLDialogElement =>
    must(
      Array.from(root().querySelectorAll<HTMLDialogElement>('dialog.asys-sheet')).find(
        (d) => text(d.querySelector('h2.asys-sheet__heading')) === heading,
      ),
      `the ${heading} sheet`,
    );
  const openMore = async (): Promise<HTMLDialogElement> => {
    await click(
      must(root().querySelector<HTMLButtonElement>('button[aria-label="More for this Task"]')),
    );

    return sheet('More');
  };
  const undo = async (): Promise<void> => {
    const back = must(held.pop(), 'a held Task');

    state.update((current) =>
      current === null ? current : { ...current, tasks: [...current.tasks, back] },
    );
    await settle();
  };
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
    router,
    state,
    awaitingSync,
    currentArea,
    send,
    sends,
    refresh,
    handleError,
    triage,
    drop,
    root,
    text,
    settle,
    heading,
    statusLine,
    card,
    section,
    titleField,
    progress,
    hint,
    barButton,
    triageButton,
    reviews,
    dismissButton,
    click,
    important,
    estimate,
    pressedEstimate,
    pressedImportance,
    typeTitle,
    shownArea,
    chooseArea,
    sheet,
    openMore,
    undo,
    finish,
  };
};

describe('Inbox', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('without state', () => {
    it('shows Loading… and no card while there is no state', async () => {
      const { root, text, card } = await setup({ state: null, status: SyncStatus.Loading });

      expect(text()).toContain('Loading…');
      expect(root().querySelector('[role="alert"]')).toBeNull();
      expect(card()).toBeNull();
      expect(root().querySelector('footer.inbox__actions')).toBeNull();
    });

    it('shows an alert and Try again when loading failed, and Try again refreshes', async () => {
      const { root, refresh, click } = await setup({ state: null, status: SyncStatus.Failed });

      expect(root().querySelector('p[role="alert"]')?.textContent?.trim()).toBe(
        'ASYS could not load your Tasks.',
      );

      await click(
        Array.from(root().querySelectorAll('button')).find(
          (b) => b.textContent?.trim() === 'Try again',
        ),
      );

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('always has the heading and an empty status line right after it', async () => {
      const { heading, statusLine } = await setup({ state: null });

      expect(heading().textContent?.trim()).toBe('Inbox');
      expect(heading().getAttribute('tabindex')).toBe('-1');
      expect(statusLine().getAttribute('role')).toBe('status');
      expect(statusLine().textContent?.trim()).toBe('');
      expect(heading().nextElementSibling).toBe(statusLine());
    });
  });

  describe('the layout', () => {
    it('shows the card before the Review items', async () => {
      const { reviews, card } = await setup({
        state: domainState([A, B, CALL], { reviewItems: [reviewItem('r1', 't1', 1)] }),
      });

      expect(reviews()).toHaveLength(1);
      expect(
        must(card()).compareDocumentPosition(must(reviews()[0])) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('shows the empty card, without progress, when there is no Review item and no Inbox Task', async () => {
      const { root, text, card } = await setup({ state: domainState([CALL]) });
      const empty = must(root().querySelector('section.inbox__empty'));

      expect(text(empty)).toBe('Inbox is empty New captures land here.');
      expect(card()).toBeNull();
      expect(root().querySelector('footer.inbox__actions')).toBeNull();
    });

    it('does not show the empty card while a Review item waits', async () => {
      const { root } = await setup({
        state: domainState([CALL], { reviewItems: [reviewItem('r1', 't1', 1)] }),
      });

      expect(root().querySelector('section.inbox__empty')).toBeNull();
    });
  });

  describe('the card', () => {
    it('shows the oldest Inbox Task with its progress and its capture text', async () => {
      const { root, titleField, progress, section } = await setup();

      expect(root().querySelectorAll('asys-triage-card')).toHaveLength(1);
      expect(titleField().value).toBe('Alpha');
      expect(section()?.getAttribute('data-focus-title')).toBe('a');
      expect(progress()).toBe('1 of 3');
      expect(root().querySelector('.asys-triage__captured-text')?.textContent?.trim()).toBe(
        'alpha raw text',
      );
    });

    it('hides the capture text when it is blank or the title', async () => {
      const { root, state, settle } = await setup({ state: domainState([B]) });

      expect(root().querySelector('.asys-triage__captured')).toBeNull();

      state.set(domainState([{ ...B, captureText: 'Bravo' }]));
      await settle();

      expect(root().querySelector('.asys-triage__captured')).toBeNull();
    });

    it('starts the draft from the stored Task', async () => {
      const { pressedImportance, pressedEstimate } = await setup({ state: domainState([B, C]) });

      expect(pressedImportance()).toBe('Important');
      expect(pressedEstimate()).toBeNull();
    });

    it('lets fields the person did not change follow the store', async () => {
      const { state, settle, important, titleField, pressedImportance, pressedEstimate } =
        await setup();

      await important(false);
      state.set(
        domainState([{ ...A, title: 'Alpha renamed', estimateMinutes: 45, version: 2 }, B]),
      );
      await settle();

      expect(titleField().value).toBe('Alpha renamed');
      expect(pressedEstimate()).toBe('45 min');
      expect(pressedImportance()).toBe('Not important');
    });

    it('keeps a changed field over the store', async () => {
      const { state, settle, typeTitle, titleField } = await setup();

      await typeTitle('Alpha, mine');
      state.set(domainState([{ ...A, title: 'Alpha renamed', version: 2 }, B]));
      await settle();

      expect(titleField().value).toBe('Alpha, mine');
    });

    it('is disabled, with Drop and Triage, while the Task awaits the server', async () => {
      const { awaitingSync, settle, titleField, barButton, triageButton, root } = await setup();

      awaitingSync.set(new Set(['a']));
      await settle();

      expect(titleField().disabled).toBe(true);
      expect(barButton('Drop')?.disabled).toBe(true);
      expect(triageButton().disabled).toBe(true);
      expect(root().querySelector('p.inbox__sync')).not.toBeNull();
    });

    it('offers the Areas ordered by name', async () => {
      const { root, click, text } = await setup({
        state: domainState([A], {
          areas: [area('z1', 'beta'), area('a2', 'Work'), area('m1', 'Zed'), area('n1', 'Alpha')],
        }),
      });

      await click(must(root().querySelector<HTMLButtonElement>('button.asys-choice-row__open')));

      expect(
        Array.from(root().querySelectorAll('ul.asys-option-list button.asys-field-row')).map((b) =>
          text(b),
        ),
      ).toEqual(['No Area', 'Alpha', 'Work', 'Zed', 'beta']);
    });
  });

  describe('the reason preview', () => {
    it('asks for what is missing, then shows what Now would say', async () => {
      const { root, hint, important, text, triageButton } = await setup();

      expect(text(hint())).toBe('Pick an Importance to triage.');
      expect(text(triageButton())).toBe('Triage');

      await important(true);

      const preview = { ...A, important: true };
      const explanation = explainTask(
        preview,
        [preview, B, C, CALL],
        [],
        { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
        T0,
      );

      expect(explanation._tag).toBe(TaskExplanationTag.Available);
      if (explanation._tag !== TaskExplanationTag.Available) return;

      const line = must(root().querySelector('p.asys-triage__reason'));

      expect(hint()).toBeNull();
      expect(text(line)).toContain(explanation.reasonText);
      expect(text(line.querySelector('asys-quadrant-label'))).toBe('Quadrant: Plan');
      expect(text(triageButton())).toBe('Triage as Plan');
    });

    it('previews the dates on the card', async () => {
      const { root, state, settle, important, text } = await setup({ state: domainState([A]) });

      state.set(domainState([{ ...A, due: { date: '2026-10-05' } }]));
      await settle();
      await important(true);

      expect(text(root().querySelector('p.asys-triage__reason asys-quadrant-label'))).toBe(
        'Quadrant: Do',
      );
    });
  });

  describe('Triage', () => {
    it('counts a refused Triage and sends nothing while Importance or an Estimate is missing', async () => {
      const { click, triageButton, triage, hint } = await setup();

      expect(hint()?.classList.contains('asys-triage__hint--missing')).toBe(false);

      await click(triageButton());

      expect(triage).not.toHaveBeenCalled();
      expect(hint()?.classList.contains('asys-triage__hint--missing')).toBe(true);
      expect(triageButton().disabled).toBe(false);
    });

    it('starts the attempts again for the next card', async () => {
      const { click, triageButton, barButton, hint, progress } = await setup();

      await click(triageButton());
      await click(barButton('Drop'));

      expect(progress()).toBe('2 of 3');
      expect(hint()?.classList.contains('asys-triage__hint--missing')).toBe(false);
    });

    it('holds a TriageTask through the Undo window with the Quadrant word', async () => {
      const { click, triageButton, important, triage, send } = await setup();

      await important(true);
      await click(triageButton());

      expect(triage).toHaveBeenCalledOnce();

      const [heldTask, command, word] = must(triage.mock.calls[0]);

      expect(heldTask.id).toBe('a');
      expect(command).toEqual(TRIAGE_A);
      expect(word).toBe('Plan');
      expect(send).not.toHaveBeenCalled();
    });

    it('carries the card’s edits, and names the Task by its new title', async () => {
      const { click, triageButton, important, estimate, typeTitle, chooseArea, triage } =
        await setup({ state: domainState([A], { areas: [area('a1', 'Work')] }) });

      await typeTitle('  Alpha, sharper ');
      await important(false);
      await estimate('5 min');
      await chooseArea('Work');
      await click(triageButton());

      const [heldTask, command] = must(triage.mock.calls[0]);

      expect(command).toEqual({
        ...TRIAGE_A,
        important: false,
        estimateMinutes: 5,
        title: 'Alpha, sharper',
        areaId: 'a1',
      });
      expect(heldTask.title).toBe('Alpha, sharper');
    });

    it('moves on to the next card and focuses it, not its Title', async () => {
      const { click, triageButton, important, section, progress, titleField } = await setup();

      await important(true);
      await click(triageButton());

      expect(titleField().value).toBe('Bravo');
      expect(progress()).toBe('2 of 3');
      expect(document.activeElement).toBe(section());
      expect(section()?.getAttribute('data-focus-title')).toBe('b');
    });

    it('focuses the heading and shows the empty card once the last Task is triaged', async () => {
      const { click, triageButton, important, heading, root, text } = await setup({
        state: domainState([A]),
      });

      await important(true);
      await click(triageButton());

      expect(document.activeElement).toBe(heading());
      expect(text(root().querySelector('section.inbox__empty .inbox__progress'))).toBe(
        '1 of 1 triaged',
      );
    });

    it('does nothing while the card is busy', async () => {
      const { awaitingSync, settle, important, triageButton, triage } = await setup();

      await important(true);
      awaitingSync.set(new Set(['a']));
      await settle();
      triageButton().click();
      await settle();

      expect(triage).not.toHaveBeenCalled();
    });
  });

  describe('Drop', () => {
    it('holds the stored Task through the Undo window, from the bar or the More sheet', async () => {
      const { click, barButton, drop, typeTitle, openMore, progress } = await setup();

      await typeTitle('Edited');
      await click(barButton('Drop'));

      expect(drop).toHaveBeenCalledOnce();
      expect(must(drop.mock.calls[0])[0]).toEqual(A);
      expect(progress()).toBe('2 of 3');

      const more = await openMore();

      await click(
        Array.from(more.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Drop'),
      );

      expect(drop).toHaveBeenCalledTimes(2);
      expect(must(drop.mock.calls[1])[0]).toEqual(B);
    });

    it('focuses the next card', async () => {
      const { click, barButton, section } = await setup();

      await click(barButton('Drop'));

      expect(document.activeElement).toBe(section());
      expect(section()?.getAttribute('data-focus-title')).toBe('b');
    });
  });

  describe('a visit', () => {
    it('counts handled Tasks until an Undo brings one back', async () => {
      const { click, barButton, triageButton, important, progress, titleField, undo } =
        await setup();

      await important(true);
      await click(triageButton());

      expect(progress()).toBe('2 of 3');

      await click(barButton('Drop'));

      expect(titleField().value).toBe('Charlie');
      expect(progress()).toBe('3 of 3');

      await undo();

      expect(titleField().value).toBe('Bravo');
      expect(progress()).toBe('2 of 3');
    });

    it('brings a Task back after an Undo as the person left it', async () => {
      const { click, triageButton, important, typeTitle, titleField, undo, pressedImportance } =
        await setup();

      await typeTitle('Alpha, mine');
      await important(false);
      await click(triageButton());

      expect(titleField().value).toBe('Bravo');

      await undo();

      expect(titleField().value).toBe('Alpha, mine');
      expect(pressedImportance()).toBe('Not important');
    });

    it('says how many were triaged once the Inbox is empty', async () => {
      const { click, barButton, root, text } = await setup();

      await click(barButton('Drop'));
      await click(barButton('Drop'));
      await click(barButton('Drop'));

      expect(text(root().querySelector('section.inbox__empty .inbox__progress'))).toBe(
        '3 of 3 triaged',
      );
    });

    it('does not count a Task that left the Inbox from elsewhere', async () => {
      const { state, settle, progress } = await setup();

      state.set(domainState([B, C]));
      await settle();

      expect(progress()).toBe('1 of 2');
    });
  });

  describe('Open in the editor', () => {
    const openEditor = async (s: Awaited<ReturnType<typeof setup>>): Promise<void> => {
      const more = await s.openMore();

      await s.click(
        Array.from(more.querySelectorAll('button')).find(
          (b) => b.textContent?.trim() === 'Open in the editor',
        ),
      );
    };

    it('opens the Task at once when nothing changed', async () => {
      const s = await setup();

      await openEditor(s);

      expect(s.send).not.toHaveBeenCalled();
      expect(s.router.url).toBe('/tasks/a');
    });

    it('does not save the proposed Area the person never chose', async () => {
      const s = await setup({
        state: domainState([A], { areas: [area('a1', 'Work')] }),
        currentArea: { areaIds: ['a1'], picked: false },
      });

      await openEditor(s);

      expect(s.send).not.toHaveBeenCalled();
      expect(s.router.url).toBe('/tasks/a');
    });

    it('saves the changes first, busy meanwhile, then opens the Task', async () => {
      const s = await setup();

      await s.typeTitle('Alpha, mine');
      await s.important(true);
      await openEditor(s);

      expect(s.send).toHaveBeenCalledExactlyOnceWith(
        {
          _tag: CommandTag.EditTask,
          taskId: 'a',
          patch: { title: 'Alpha, mine', important: true },
          expect: { status: TaskStatus.Open },
        },
        'key-1',
      );
      expect(s.triageButton().disabled).toBe(true);
      expect(s.router.url).toBe('/');

      await s.finish(0, APPLIED);

      expect(s.router.url).toBe('/tasks/a');
    });

    it('leaves out a blank title', async () => {
      const s = await setup();

      await s.typeTitle('  ');
      await openEditor(s);

      expect(s.send).not.toHaveBeenCalled();
      expect(s.router.url).toBe('/tasks/a');
    });

    it('stays with the message when the save fails', async () => {
      const s = await setup();

      await s.typeTitle('Alpha, mine');
      await openEditor(s);
      await s.finish(0, FAILED);

      expect(s.statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));
      expect(s.router.url).toBe('/');
      expect(s.triageButton().disabled).toBe(false);
    });

    it('does nothing when the screen is destroyed while the save runs', async () => {
      const s = await setup();
      const line = s.statusLine();

      await s.typeTitle('Alpha, mine');
      await openEditor(s);
      s.fixture.destroy();
      must(s.sends[0]).resolve(FAILED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(s.handleError).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
    });
  });

  describe('Blocked by', () => {
    it('acts on the card’s Task', async () => {
      const { openMore, click, sheet, root, send } = await setup();
      const more = await openMore();

      await click(
        Array.from(more.querySelectorAll('button')).find(
          (b) => b.textContent?.trim() === 'Blocked by',
        ),
      );

      const dialog = sheet('Blocked by');
      const candidates = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>('.task-blockers__candidate'),
      );

      expect(dialog.open).toBe(true);
      expect(candidates.map((b) => b.textContent?.trim())).not.toContain('Alpha');

      await click(candidates.find((b) => b.textContent?.trim() === 'Call Marit'));

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.AddBlocker, linkId: 'key-1', taskId: 'a', blockerId: 't1' },
        'key-2',
      );
      expect(root().querySelector('section.asys-triage')).not.toBeNull();
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

    it('show the question and reason, oldest first, with Open Task for a known Task', async () => {
      const { reviews, text } = await setup({ state: WITH_REVIEWS });

      expect(reviews()).toHaveLength(3);
      expect(text(must(reviews()[0]))).toContain('Marking “Call Marit” Done no longer applies.');
      expect(must(reviews()[0]).querySelector('a')?.getAttribute('href')).toBe('/tasks/t1');
      expect(must(reviews()[1]).querySelector('a')).toBeNull();
    });

    it('send ResolveReviewItem on Dismiss, and are busy meanwhile', async () => {
      const { send, dismissButton, click } = await setup({ state: WITH_REVIEWS });

      await click(dismissButton(0));

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.ResolveReviewItem, reviewItemId: 'r1' },
        'key-1',
      );
      expect(dismissButton(0)?.disabled).toBe(true);
      expect(dismissButton(1)?.disabled).toBe(false);
    });

    it('move focus to the next Review item when Dismiss is applied', async () => {
      const { finish, dismissButton, reviews, click } = await setup({ state: WITH_REVIEWS });

      await click(dismissButton(0));
      await finish(0, APPLIED, {
        ...WITH_REVIEWS,
        reviewItems: WITH_REVIEWS.reviewItems.filter((i) => i.id !== 'r1'),
      });

      expect(document.activeElement).toBe(
        must(reviews()[0]).querySelector('.asys-review__question'),
      );
    });

    it('show the outcome message when Dismiss is not applied, and leave focus alone', async () => {
      const { finish, statusLine, dismissButton, click } = await setup({ state: WITH_REVIEWS });
      const outcome: CommandOutcome = {
        _tag: CommandOutcomeTag.Rejected,
        reason: RejectedReason.NotFound,
      };

      must(dismissButton(0)).focus();
      await click(dismissButton(0));
      await finish(0, outcome);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(outcome));
      expect(document.activeElement).toBe(dismissButton(0));
    });

    it('clear the status line when the next action starts', async () => {
      const { finish, statusLine, dismissButton, click, send } = await setup({
        state: WITH_REVIEWS,
      });

      await click(dismissButton(0));
      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).not.toBe('');

      await click(dismissButton(0));

      expect(send).toHaveBeenCalledTimes(2);
      expect(statusLine().textContent?.trim()).toBe('');
    });
  });

  describe('the Current Area proposal', () => {
    const WITH_AREAS = domainState([A, B], { areas: [area('a1', 'Work'), area('a2', 'Personal')] });

    it('proposes the one Current Area and sends it', async () => {
      const { shownArea, important, click, triageButton, triage } = await setup({
        state: WITH_AREAS,
        currentArea: { areaIds: ['a1'], picked: false },
      });

      expect(shownArea()).toContain('Work');

      await important(true);
      await click(triageButton());

      expect(must(triage.mock.calls[0])[1]).toEqual({ ...TRIAGE_A, areaId: 'a1' });
    });

    it.each([
      ['two Areas current', { areaIds: ['a1', 'a2'], picked: false }],
      ['no Current Area state', null],
    ] satisfies [string, CurrentArea | null][])(
      'proposes nothing with %s',
      async (_name, currentArea) => {
        const { shownArea, important, click, triageButton, triage } = await setup({
          state: WITH_AREAS,
          currentArea,
        });

        expect(shownArea()).toContain('No Area');

        await important(true);
        await click(triageButton());

        expect(must(triage.mock.calls[0])[1]).toEqual(TRIAGE_A);
      },
    );

    it('keeps the Area a Task already has over the proposal', async () => {
      const { shownArea } = await setup({
        state: domainState([{ ...A, areaId: 'a2' }], { areas: WITH_AREAS.areas }),
        currentArea: { areaIds: ['a1'], picked: false },
      });

      expect(shownArea()).toContain('Personal');
    });

    it('does not change the open card when the Current Area changes later', async () => {
      const { shownArea, currentArea, settle } = await setup({
        state: WITH_AREAS,
        currentArea: { areaIds: ['a1'], picked: false },
      });

      currentArea.set({ areaIds: ['a2'], picked: true });
      await settle();

      expect(shownArea()).toContain('Work');
    });

    it('sends no Area when the person chooses No Area', async () => {
      const { chooseArea, important, click, triageButton, triage } = await setup({
        state: WITH_AREAS,
        currentArea: { areaIds: ['a1'], picked: false },
      });

      await important(true);
      await chooseArea('No Area');
      await click(triageButton());

      expect(must(triage.mock.calls[0])[1]).toEqual(TRIAGE_A);
    });

    it('reads the proposal anew for the next card', async () => {
      const { currentArea, barButton, click, shownArea } = await setup({
        state: WITH_AREAS,
        currentArea: { areaIds: ['a1'], picked: false },
      });

      currentArea.set({ areaIds: ['a2'], picked: true });
      await click(barButton('Drop'));

      expect(shownArea()).toContain('Personal');
    });
  });
});
