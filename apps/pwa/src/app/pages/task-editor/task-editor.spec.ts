// SPDX-License-Identifier: EUPL-1.2
import { Location } from '@angular/common';
import { Component, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  TaskKind,
  TaskStatus,
  WORK_ACTIVE_HOURS,
  type Area,
  type BlockerLink,
  type Command,
  type DomainState,
  type Instant,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag, DataApi, type CommandOutcome } from '../../core/api/data-api';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { DoneOrigin, DoneUndo, type DoneUndone, type PendingDone } from '../../core/data/done-undo';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { Ids } from '../../core/platform/ids';
import { TaskMorph } from '../../core/platform/task-morph';
import { ThemeName } from '../../core/platform/theme';
import { TaskBlockers } from '../../components/organisms/task-blockers/task-blockers';
import { TaskEditor } from './task-editor';
import { TaskEditorRoute } from './task-editor-route';

// 10:00 in Amsterdam, on Sunday 4 October 2026.
const T0 = Date.parse('2026-10-04T08:00:00.000Z') as Instant;

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const NOT_APPLICABLE: CommandOutcome = {
  _tag: CommandOutcomeTag.NotApplicable,
  reason: NotApplicableReason.ExpectationFailed,
  reviewItemId: 'rx',
};

const rejected = (reason: RejectedReason): CommandOutcome => ({
  _tag: CommandOutcomeTag.Rejected,
  reason,
});

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

const link = (id: string, taskId: string, blockerId: string): BlockerLink => ({
  id,
  taskId,
  blockerId,
});

const domainState = (tasks: readonly Task[], extra: Partial<DomainState> = {}): DomainState => ({
  tasks,
  links: [],
  areas: [],
  reviewItems: [],
  settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
  ...extra,
});

const CALL = task({
  id: 't1',
  title: 'Call Marit',
  due: { date: '2026-10-05' },
  estimateMinutes: 30,
  important: true,
  createdAt: 10,
});

const WATER = task({ id: 't2', title: 'Water form', estimateMinutes: 20, createdAt: 11 });

const INVOICE = task({ id: 't3', title: 'Send invoice', createdAt: 12 });

const OLD = task({ id: 't4', title: 'Old thing', status: TaskStatus.Done, closedAt: 5 });

const BASE = domainState([CALL, WATER, INVOICE, OLD]);

// Due tomorrow at 12:00 with 30 minutes to do: its Latest start is tomorrow 11:30.
const NEAR_DUE = { date: '2026-10-05', time: '12:00' };

const withTask = (
  state: DomainState,
  id: string,
  overrides: Partial<Task>,
  extra: Partial<DomainState> = {},
): DomainState => ({
  ...state,
  tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...overrides } : t)),
  ...extra,
});

const withoutTask = (state: DomainState, id: string): DomainState => ({
  ...state,
  tasks: state.tasks.filter((t) => t.id !== id),
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

const sent = (send: { mock: { calls: unknown[][] } }, n: number): Command =>
  must(send.mock.calls[n])[0] as Command;

const editTask = (taskId: string, patch: Record<string, unknown>) => ({
  _tag: CommandTag.EditTask,
  taskId,
  patch,
  expect: { status: 'open' },
});

const dropTask = (taskId: string) => ({
  _tag: CommandTag.DropTask,
  taskId,
  expect: { status: 'open' },
});

const logProgress = (taskId: string, remainingMinutes: number) => ({
  _tag: CommandTag.LogProgress,
  taskId,
  remainingMinutes,
  expect: { status: 'open' },
});

/** A button by its text inside the elements matching `within` under `scope`. */
const buttonByTextIn = (
  scope: ParentNode,
  within: string,
  name: string,
): HTMLButtonElement | undefined =>
  Array.from(scope.querySelectorAll<HTMLButtonElement>(`${within} button`)).find(
    (b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim() === name,
  );

const wait = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Types the minutes into the Log progress form of the sheet and presses its Save. */
const saveProgress = async (
  dialog: () => HTMLDialogElement,
  settle: () => Promise<void>,
  minutes: string,
): Promise<void> => {
  const input = must(
    dialog().querySelector<HTMLTextAreaElement>('asys-log-progress-form textarea'),
  );

  input.value = minutes;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  must(
    Array.from(dialog().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => (b.textContent ?? '').trim() === 'Save',
    ),
  ).click();
  await settle();
};

@Component({ template: '' })
class Stub {}

@Component({
  imports: [TaskEditor],
  template: '<asys-task-editor [taskId]="id()" />',
})
class Host {
  readonly id = signal('t1');
}

interface SetupOptions {
  readonly state?: DomainState | null;
  readonly status?: SyncStatus;
  readonly taskId?: string;
  /** The Clock's now; defaults to 10:00 in Amsterdam on 2026-10-04. */
  readonly now?: Instant;
  /** Replaces the Clock's now signal, for tests that count its reads. */
  readonly readNow?: () => Instant;
  /** Navigate twice before the editor acts, so the router has a previous navigation. */
  readonly withHistory?: boolean;
}

const stubs = (options: SetupOptions) => {
  const state = signal<DomainState | null>(options.state === undefined ? BASE : options.state);
  const status = signal<SyncStatus>(options.status ?? SyncStatus.Ready);
  const awaitingSync = signal<ReadonlySet<string>>(new Set());
  const sends: ReturnType<typeof deferred<CommandOutcome>>[] = [];
  const send = vi.fn<(command: Command, key?: string) => Promise<CommandOutcome>>(() => {
    const d = deferred<CommandOutcome>();

    sends.push(d);

    return d.promise;
  });
  const refresh = vi.fn<() => void>();
  const runCommand = vi.fn<(command: Command, key: string) => Promise<CommandOutcome>>(() =>
    Promise.resolve(APPLIED),
  );
  let counter = 0;
  const next = vi.fn<() => string>(() => `key-${++counter}`);
  const handleError = vi.fn<(error: unknown) => void>();
  // As a hold would: the Task disappears from the state at once.
  const complete = vi.fn<(held: Task, origin: DoneOrigin, after?: Promise<void>) => void>(
    (held) => {
      state.update((current) => (current === null ? current : withoutTask(current, held.id)));
    },
  );
  const requestFocus = vi.fn<() => void>();
  const doneUndo = {
    complete,
    requestFocus,
    pending: signal<PendingDone | null>(null),
    undone: signal<DoneUndone | null>(null),
  };

  return {
    state,
    handleError,
    doneUndo,
    status,
    awaitingSync,
    sends,
    send,
    refresh,
    runCommand,
    next,
    providers: [
      { provide: DataStore, useValue: { state, status, awaitingSync, send, refresh } },
      { provide: DataApi, useValue: { runCommand } },
      { provide: DoneUndo, useValue: doneUndo },
      { provide: Clock, useValue: { now: options.readNow ?? signal(options.now ?? T0) } },
      { provide: Ids, useValue: { next } },
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  };
};

const setup = async (options: SetupOptions = {}) => {
  const s = stubs(options);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'now', component: Stub },
        { path: 'other', component: Stub },
      ]),
      ...s.providers,
    ],
  });

  const router = TestBed.inject(Router);

  if (options.withHistory === true) {
    await router.navigateByUrl('/now');
    await router.navigateByUrl('/other');
  }

  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const back = vi.spyOn(TestBed.inject(Location), 'back').mockImplementation(() => undefined);
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.id.set(options.taskId ?? 't1');
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const text = (el: Element | null = root()): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  // The autosave goes through an effect and a microtask, so a few rounds let it reach `send`.
  const settle = async (): Promise<void> => {
    for (let round = 0; round < 3; round++) {
      await wait();
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };
  const click = async (el: Element | null | undefined): Promise<void> => {
    must(el as HTMLElement | null | undefined).click();
    await settle();
  };
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: Element | null | undefined): Promise<void> => {
    must(el).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await settle();
  };
  const buttonByText = (scope: ParentNode, name: string): HTMLButtonElement | undefined =>
    Array.from(scope.querySelectorAll('button')).find((b) => text(b) === name);

  // The top bar, the heading, the status lines and the footer.
  const bar = (): HTMLElement => must(root().querySelector('header.task-editor__bar'));
  const backButton = (): HTMLButtonElement | null =>
    bar().querySelector('button[aria-label="Back"]');
  const moreButton = (): HTMLButtonElement | null =>
    bar().querySelector('button[aria-label="More actions"]');
  const savedLine = (): HTMLElement => must(bar().querySelector('.task-editor__saved'));
  const heading = (): HTMLElement => must(root().querySelector('h1.task-editor__heading'));
  const statusLine = (): HTMLElement => must(root().querySelector('p.task-editor__status'));
  const footer = (): HTMLElement | null => root().querySelector('footer.task-editor__actions');
  const footerButton = (name: string): HTMLButtonElement | undefined => {
    const el = footer();

    return el === null ? undefined : buttonByText(el, name);
  };
  const card = (): HTMLElement | null => root().querySelector('section.task-editor__card');

  // Sheets are native dialogs found by their heading; a closed one has no body.
  const dialog = (heading: string, within: ParentNode = root()): HTMLDialogElement =>
    must(
      Array.from(within.querySelectorAll<HTMLDialogElement>('dialog.asys-sheet')).find(
        (d) => text(d.querySelector('h2.asys-sheet__heading')) === heading,
      ),
      `the ${heading} sheet`,
    );
  const inDialog = (heading: string, name: string): HTMLButtonElement | undefined =>
    buttonByText(dialog(heading), name);

  // The Title and Notes.
  const titleField = (): HTMLTextAreaElement =>
    must(root().querySelector<HTMLTextAreaElement>('textarea[aria-label="Title"]'));
  const notesField = (): HTMLTextAreaElement | null =>
    root().querySelector<HTMLTextAreaElement>('textarea[aria-label="Notes"]');
  const typeInto = async (
    el: HTMLTextAreaElement | HTMLInputElement,
    value: string,
  ): Promise<void> => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const changeOn = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  };
  const typeTitle = (value: string): Promise<void> => typeInto(titleField(), value);
  const commitTitle = async (value: string): Promise<void> => {
    await typeTitle(value);
    await changeOn(titleField());
  };
  const addNotes = (): HTMLButtonElement | undefined => {
    const el = card();

    return el === null ? undefined : buttonByText(el, 'Add notes');
  };

  // Importance and Estimate.
  const importanceButton = (label: string): HTMLButtonElement =>
    must(
      Array.from(
        root().querySelectorAll<HTMLButtonElement>('asys-segmented .asys-segmented__option'),
      ).find((b) => text(b) === label),
      `the ${label} option`,
    );
  const pressedImportance = (): string | null => {
    const pressed = Array.from(
      root().querySelectorAll('asys-segmented .asys-segmented__option'),
    ).find((b) => b.getAttribute('aria-pressed') === 'true');

    return pressed === undefined ? null : text(pressed);
  };
  const cell = (label: string): HTMLButtonElement =>
    must(
      root().querySelector<HTMLButtonElement>(`.asys-estimate__cell[aria-label="${label}"]`),
      `the ${label} cell`,
    );
  const pressedCell = (): string | null =>
    root().querySelector('.asys-estimate__cell[aria-pressed="true"]')?.getAttribute('aria-label') ??
    null;

  // The Area, Available from and Due rows.
  const row = (label: string): HTMLElement =>
    must(
      Array.from(root().querySelectorAll<HTMLElement>('asys-choice-row, asys-date-spec-row')).find(
        (r) => text(r.querySelector('.asys-row__label')) === label,
      ),
      `the ${label} row`,
    );
  const rowButton = (label: string): HTMLButtonElement =>
    must(row(label).querySelector<HTMLButtonElement>('button.asys-row'));
  const rowValue = (label: string): string => text(row(label).querySelector('.asys-row__value'));

  // The reason line.
  const reason = (): HTMLElement | null => root().querySelector('.task-editor__reason');
  const reasonText = (): string => text(reason()?.querySelector('.task-editor__reason-text'));
  const badges = (): string[] =>
    Array.from(reason()?.querySelectorAll('asys-status-badge') ?? []).map((b) => text(b));
  const chip = (): HTMLElement | null => reason()?.querySelector('asys-quadrant-chip') ?? null;

  // The controls of the card, for a read-only check.
  const cardControls = (): (HTMLButtonElement | HTMLTextAreaElement | HTMLInputElement)[] =>
    Array.from(
      root().querySelectorAll<HTMLButtonElement | HTMLTextAreaElement | HTMLInputElement>(
        [
          'textarea[aria-label="Title"]',
          'textarea[aria-label="Notes"]',
          'button.task-editor__add-notes',
          '.asys-segmented__option',
          '.asys-estimate__cell',
          '.asys-estimate__other-toggle',
          'button.asys-choice-row__open',
          'button.asys-date-row__open',
          'button.asys-date-row__time',
        ].join(', '),
      ),
    );

  const blockers = (): TaskBlockers =>
    fixture.debugElement.query(By.directive(TaskBlockers)).componentInstance;

  // Resolves the n-th send; the state is updated first, as the store does after its follow-up sync.
  const finish = async (
    n: number,
    outcome: CommandOutcome,
    nextState?: DomainState,
  ): Promise<void> => {
    if (nextState !== undefined) {
      s.state.set(nextState);
    }

    must(s.sends[n]).resolve(outcome);
    await settle();
  };
  const update = async (nextState: DomainState | null): Promise<void> => {
    s.state.set(nextState);
    await settle();
  };

  await settle();

  return {
    ...s,
    fixture,
    navigate,
    back,
    root,
    text,
    settle,
    click,
    press,
    buttonByText,
    bar,
    backButton,
    moreButton,
    savedLine,
    heading,
    statusLine,
    footer,
    footerButton,
    card,
    dialog,
    inDialog,
    titleField,
    notesField,
    typeInto,
    changeOn,
    typeTitle,
    commitTitle,
    addNotes,
    importanceButton,
    pressedImportance,
    cell,
    pressedCell,
    row,
    rowButton,
    rowValue,
    reason,
    reasonText,
    badges,
    chip,
    cardControls,
    blockers,
    finish,
    update,
  };
};

describe('TaskEditor', () => {
  describe('states', () => {
    it('shows the load state and no card while there is no state', async () => {
      const { root, card, text } = await setup({ state: null });

      expect(root().querySelector('asys-load-state')).not.toBeNull();
      expect(text(root().querySelector('asys-load-state'))).toContain('Loading…');
      expect(card()).toBeNull();
    });

    it('offers Try again after a failed load, and shows the Task when the state arrives', async () => {
      const { root, refresh, status, update, click, buttonByText, card, titleField } = await setup({
        state: null,
      });

      status.set(SyncStatus.Failed);
      await update(null);

      expect(root().querySelector('asys-load-state [role="alert"]')?.textContent).toContain(
        'ASYS could not load your Tasks.',
      );

      await click(buttonByText(must(root().querySelector('asys-load-state')), 'Try again'));

      expect(refresh).toHaveBeenCalledTimes(1);

      status.set(SyncStatus.Ready);
      await update(BASE);

      expect(root().querySelector('asys-load-state')).toBeNull();
      expect(card()).not.toBeNull();
      expect(titleField().value).toBe('Call Marit');
    });

    it('says a Task that was never in the store is no longer open, with a link to Now and no card', async () => {
      const { text, root, heading, card, footer } = await setup({ taskId: 'nope' });

      expect(text()).toContain('This Task is no longer open.');
      expect(root().querySelector('a[href="/now"]')?.textContent?.trim()).toBe('Go to Now');
      expect(heading().textContent?.trim()).toBe('Task');
      expect(card()).toBeNull();
      expect(footer()).toBeNull();
    });

    it('makes the link to Now a Voice tap target', async () => {
      document.documentElement.setAttribute('data-theme', ThemeName.Drive);
      onTestFinished(() => document.documentElement.removeAttribute('data-theme'));

      const { root } = await setup({ taskId: 'nope' });

      const link = must(root().querySelector<HTMLAnchorElement>('a[href="/now"]'));

      expect(getComputedStyle(link).minHeight).toBe('var(--tap-target-drive)');
    });

    it('keeps the last known title in the heading and shows no card when a clean Task leaves the store', async () => {
      const { text, root, heading, card, update } = await setup();

      await update(withoutTask(BASE, 't1'));

      expect(text()).toContain('This Task is no longer open.');
      expect(root().querySelector('a[href="/now"]')?.textContent?.trim()).toBe('Go to Now');
      expect(heading().textContent?.trim()).toBe('Call Marit');
      expect(card()).toBeNull();
    });

    it('keeps a dirty draft of a Task that left the store visible and read-only, and leaving sends nothing', async () => {
      const { text, typeTitle, update, titleField, cardControls, moreButton, fixture, send } =
        await setup();

      await typeTitle('My unsaved title');
      await update(withoutTask(BASE, 't1'));

      expect(text()).toContain('This Task is no longer open.');
      expect(titleField().value).toBe('My unsaved title');
      expect(cardControls().length).toBeGreaterThan(10);
      expect(cardControls().filter((c) => !c.disabled)).toEqual([]);
      expect(moreButton()).toBeNull();

      fixture.destroy();
      await wait();

      expect(send).not.toHaveBeenCalled();
    });

    it('never shows the missing line once a Done is held, and keeps the last title', async () => {
      const { text, heading, footerButton, press, update, doneUndo } = await setup();

      await press(footerButton('Mark Done'));

      expect(doneUndo.complete).toHaveBeenCalledTimes(1);

      await update(withoutTask(BASE, 't1'));

      expect(text()).not.toContain('no longer open');
      expect(heading().textContent?.trim()).toBe('Call Marit');
    });

    it('shows the missing line again when a Drop that left was not Applied', async () => {
      const { text, click, moreButton, dialog, update, finish, inDialog } = await setup();

      await click(moreButton());
      await click(inDialog('More', 'Drop'));
      await click(buttonByTextIn(dialog('More'), '.asys-confirm', 'Drop'));
      await update(withoutTask(BASE, 't1'));
      await finish(0, NOT_APPLICABLE);

      expect(text()).toContain('This Task is no longer open.');
      expect(text(dialog('More'))).toContain(outcomeMessage(NOT_APPLICABLE));
    });

    it.each([
      ['loading', { state: null }],
      ['a failed load', { state: null, status: SyncStatus.Failed }],
      ['a missing Task', { taskId: 'nope' }],
      ['a loaded Task', {}],
    ] satisfies [string, SetupOptions][])(
      'has Back in the top bar while %s',
      async (_, options) => {
        const { backButton, savedLine } = await setup(options);

        expect(backButton()).not.toBeNull();
        expect(savedLine().getAttribute('role')).toBe('status');
      },
    );

    it('Back goes to Now when the router has no previous navigation', async () => {
      const { backButton, press, navigate, back } = await setup();

      await press(backButton());

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
      expect(back).not.toHaveBeenCalled();
    });

    it('Back goes back when the router has a previous navigation', async () => {
      const { backButton, press, navigate, back } = await setup({ withHistory: true });

      await press(backButton());

      expect(back).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('has a focusable hidden heading with the stored title and an empty status line', async () => {
      const { heading, statusLine } = await setup();

      expect(heading().textContent?.trim()).toBe('Call Marit');
      expect(heading().getAttribute('tabindex')).toBe('-1');
      expect(heading().classList.contains('asys-visually-hidden')).toBe(true);
      expect(statusLine().getAttribute('role')).toBe('status');
      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('shows the heading of the stored title, not the draft, until the save lands', async () => {
      const { commitTitle, heading, finish } = await setup();

      await commitTitle('Call Marit back');

      expect(heading().textContent?.trim()).toBe('Call Marit');

      await finish(0, APPLIED, withTask(BASE, 't1', { title: 'Call Marit back', version: 2 }));

      expect(heading().textContent?.trim()).toBe('Call Marit back');
    });
  });

  describe('fields show the stored values', () => {
    it('shows the Title, Notes, Importance and Estimate', async () => {
      const { titleField, notesField, addNotes, pressedImportance, pressedCell } = await setup({
        state: domainState([
          { ...CALL, notes: 'About the lease', important: false, estimateMinutes: 45 },
        ]),
      });

      expect(titleField().value).toBe('Call Marit');
      expect(notesField()?.value).toBe('About the lease');
      expect(addNotes()).toBeUndefined();
      expect(pressedImportance()).toBe('Not important');
      expect(pressedCell()).toBe('45 min');
    });

    it('offers Add notes instead of a Notes field when there are no Notes', async () => {
      const { notesField, addNotes } = await setup();

      expect(notesField()).toBeNull();
      expect(addNotes()).toBeDefined();
    });

    it('shows Important as pressed for an important Task', async () => {
      const { pressedImportance } = await setup();

      expect(pressedImportance()).toBe('Important');
    });

    it('shows the Area, Available from and Due rows', async () => {
      const { rowValue } = await setup();

      expect(rowValue('Area')).toBe('No Area');
      expect(rowValue('Available from')).toBe('Any time');
      expect(rowValue('Due')).toBe('Tomorrow');
    });

    it('shows the name of the stored Area', async () => {
      const { rowValue } = await setup({
        state: domainState([{ ...CALL, areaId: 'a' }], { areas: [area('a', 'Work')] }),
      });

      expect(rowValue('Area')).toBe('Work');
    });

    it('shows None for a Task without a Due', async () => {
      const { rowValue } = await setup({ state: domainState([{ ...CALL, due: null }]) });

      expect(rowValue('Due')).toBe('None');
    });

    it('reads the Due in the Settings time zone, not UTC', async () => {
      // 22:30 UTC on 4 October is 00:30 on 5 October in Amsterdam.
      const { rowValue } = await setup({
        now: Date.parse('2026-10-04T22:30:00.000Z') as Instant,
        state: domainState([{ ...CALL, due: { date: '2026-10-05' } }]),
      });

      expect(rowValue('Due')).toBe('Today');
    });

    it('asks for the Done key on the Title', async () => {
      const { titleField } = await setup();

      expect(titleField().getAttribute('enterkeyhint')).toBe('done');
    });

    it('names the time button of Available from after it once a time is set', async () => {
      const { row } = await setup({
        state: domainState([{ ...CALL, availableFrom: { date: '2026-10-09', time: '09:00' } }]),
      });
      const time = must(row('Available from').querySelector('button.asys-date-row__time'));

      expect(time.getAttribute('aria-label')?.startsWith('Available from')).toBe(true);
    });

    it('lists No Area first, then the Areas by name', async () => {
      const { click, rowButton, dialog, text } = await setup({
        state: domainState([CALL], {
          areas: [area('b', 'Zeta'), area('c', 'Mid'), area('a', 'Alpha')],
        }),
      });

      await click(rowButton('Area'));

      expect(
        Array.from(dialog('Area').querySelectorAll('.asys-choice-row__option')).map((o) => text(o)),
      ).toEqual(['No Area', 'Alpha', 'Mid', 'Zeta']);
    });

    it('shows the Captured text only when it differs from the title', async () => {
      const { root } = await setup({
        state: domainState([{ ...CALL, captureText: 'call marit about\nthe lease' }]),
      });
      const captured = must(root().querySelector('.task-editor__captured'));

      expect(captured.querySelector('.task-editor__captured-label')?.textContent?.trim()).toBe(
        'Captured text',
      );
      // The text keeps its line breaks (pre-wrap), so any whitespace around it would show as an indent.
      expect(captured.textContent).toBe('Captured textcall marit about\nthe lease');
      expect(must(captured.querySelector('.task-editor__captured-text')).textContent).toBe(
        'call marit about\nthe lease',
      );
    });

    it.each([
      ['equals the title', 'Call Marit'],
      ['is blank', '  \n '],
    ])('hides the Captured text when it %s', async (_, captureText) => {
      const { root } = await setup({ state: domainState([{ ...CALL, captureText }]) });

      expect(root().querySelector('.task-editor__captured')).toBeNull();
    });
  });

  describe('wiring: each control sends one EditTask', () => {
    it('Importance sends the change with the status expectation and the key from the attempts', async () => {
      const { send, press, importanceButton } = await setup();

      await press(importanceButton('Not important'));

      expect(send).toHaveBeenCalledExactlyOnceWith(editTask('t1', { important: false }), 'key-1');
      expect('version' in sent(send, 0)).toBe(false);
    });

    it('an Estimate ruler cell sends the minutes', async () => {
      const { send, press, cell } = await setup();

      await press(cell('45 min'));

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { estimateMinutes: 45 }));
    });

    it('the Area sheet sends the chosen Area', async () => {
      const { send, press, rowButton, dialog, inDialog } = await setup({
        state: domainState([CALL], { areas: [area('a', 'Work')] }),
      });

      await press(rowButton('Area'));

      expect(dialog('Area').open).toBe(true);

      await press(inDialog('Area', 'Work'));

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { areaId: 'a' }));
      expect(dialog('Area').open).toBe(false);
    });

    it('the Due sheet sends a calendar day, then the time sheet sends a time', async () => {
      const { send, press, row, rowButton, dialog, finish } = await setup({
        taskId: 't3',
      });

      await press(rowButton('Due'));

      const day = Array.from(
        dialog('Due').querySelectorAll<HTMLButtonElement>('button.asys-date-pick__day'),
      ).find((b) => (b.textContent ?? '').trim() === '9');

      await press(day);

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t3', { due: { date: '2026-10-09' } }));
      expect(dialog('Due').open).toBe(false);

      await finish(0, APPLIED, withTask(BASE, 't3', { due: { date: '2026-10-09' }, version: 2 }));
      await press(row('Due').querySelector('button.asys-date-row__time'));

      const time = dialog('Time', row('Due'));

      expect(time.open).toBe(true);

      await press(
        Array.from(time.querySelectorAll<HTMLButtonElement>('button.asys-time-pick__chip')).find(
          (b) => (b.textContent ?? '').trim() === '17:00',
        ),
      );

      expect(send).toHaveBeenCalledTimes(2);
      expect(sent(send, 1)).toEqual(editTask('t3', { due: { date: '2026-10-09', time: '17:00' } }));
    });

    it('Remove Due sends a null Due', async () => {
      const { send, press, rowButton, dialog } = await setup();

      await press(rowButton('Due'));
      await press(
        Array.from(dialog('Due').querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => (b.textContent ?? '').trim() === 'Remove Due',
        ),
      );

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { due: null }));
    });

    it('the Available from sheet sends a calendar day', async () => {
      const { send, press, rowButton, dialog } = await setup();

      await press(rowButton('Available from'));

      const day = Array.from(
        dialog('Available from').querySelectorAll<HTMLButtonElement>('button.asys-date-pick__day'),
      ).find((b) => (b.textContent ?? '').trim() === '9');

      await press(day);

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { availableFrom: { date: '2026-10-09' } }));
    });

    it('Remove Available from sends a null Available from', async () => {
      const { send, press, rowButton, inDialog } = await setup({
        state: domainState([{ ...CALL, availableFrom: { date: '2026-10-09' } }]),
      });

      await press(rowButton('Available from'));

      expect(inDialog('Available from', 'Remove Available from')).toBeDefined();

      await press(inDialog('Available from', 'Remove Available from'));

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { availableFrom: null }));
    });

    it('a Title commits on change', async () => {
      const { send, typeTitle, changeOn, titleField } = await setup();

      await typeTitle('Call Marit back');
      await changeOn(titleField());

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Call Marit back' }));
    });

    it('Add notes reveals and focuses the Notes, which commit on change with their newlines', async () => {
      const { send, press, addNotes, notesField, typeInto, changeOn } = await setup();

      await press(addNotes());

      expect(document.activeElement).toBe(notesField());
      expect(addNotes()).toBeUndefined();

      await typeInto(must(notesField()), 'ask about\n\nthe lease');

      expect(send).not.toHaveBeenCalled();

      await changeOn(must(notesField()));

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { notes: 'ask about\n\nthe lease' }));
    });

    it('keeps the Notes shown once they are typed, even after the save lands', async () => {
      const { press, addNotes, notesField, typeInto, changeOn, finish } = await setup();

      await press(addNotes());
      await typeInto(must(notesField()), 'a note');
      await changeOn(must(notesField()));
      await finish(0, APPLIED, withTask(BASE, 't1', { notes: 'a note', version: 2 }));

      expect(notesField()?.value).toBe('a note');
      expect(addNotes()).toBeUndefined();
    });
  });

  describe('the Title and Notes fields', () => {
    it('draws the Title as a one-row title input with no box and no wrap', async () => {
      const { titleField } = await setup();
      const title = titleField();

      expect(title.classList.contains('asys-input')).toBe(true);
      expect(title.classList.contains('asys-input--title')).toBe(true);
      expect(title.classList.contains('task-editor__title')).toBe(true);
      expect(title.rows).toBe(1);
      expect(title.hasAttribute('wrap')).toBe(false);
      expect(title.classList.contains('asys-input-box__control')).toBe(false);
      expect(title.closest('asys-input-box')).toBeNull();
    });

    it('keeps the Title attributes', async () => {
      const { titleField } = await setup();

      expect(titleField().getAttribute('aria-label')).toBe('Title');
      expect(titleField().getAttribute('enterkeyhint')).toBe('done');
      expect(titleField().getAttribute('data-task-id')).toBe('t1');
    });

    it('draws the Notes as a growing input', async () => {
      const { notesField } = await setup({
        state: domainState([{ ...CALL, notes: 'About the lease' }]),
      });
      const notes = must(notesField());

      expect(notes.classList.contains('asys-input')).toBe(true);
      expect(notes.classList.contains('asys-input--grow')).toBe(true);
      expect(notes.classList.contains('task-editor__notes')).toBe(true);
      expect(notes.classList.contains('asys-input--title')).toBe(false);
    });
  });

  describe('the Title keys', () => {
    it('Enter commits and never submits a form around the editor', async () => {
      const { fixture, send, typeTitle, titleField, settle } = await setup();
      const form = document.createElement('form');
      const submit = document.createElement('button');
      const submits = vi.fn((event: Event) => event.preventDefault());
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });

      submit.type = 'submit';
      form.addEventListener('submit', submits);
      form.append(fixture.nativeElement, submit);
      document.body.appendChild(form);
      onTestFinished(() => form.remove());
      await typeTitle('Call Marit back');
      titleField().dispatchEvent(enter);
      await settle();

      expect(titleField().form).toBe(form);
      expect(enter.defaultPrevented).toBe(true);
      expect(submits).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Call Marit back' }));
    });

    it('typing alone sends nothing', async () => {
      const { send, typeTitle, titleField } = await setup();

      await typeTitle('Call Marit ba');
      await typeTitle('Call Marit back');

      expect(send).not.toHaveBeenCalled();
      expect(titleField().value).toBe('Call Marit back');
    });

    it('Enter commits and inserts no newline', async () => {
      const { send, typeTitle, titleField, settle } = await setup();
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });

      await typeTitle('Call Marit back');
      titleField().dispatchEvent(enter);
      await settle();

      expect(enter.defaultPrevented).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Call Marit back' }));
      expect(titleField().value).not.toContain('\n');
    });

    it('Enter while composing does nothing', async () => {
      const { send, typeTitle, titleField, settle } = await setup();
      const enter = new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      });

      await typeTitle('Call Marit back');
      titleField().dispatchEvent(enter);
      await settle();

      expect(enter.defaultPrevented).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });

    it.each(['insertLineBreak', 'insertParagraph'])(
      'a beforeinput %s is prevented and commits',
      async (inputType) => {
        const { send, typeTitle, titleField, settle } = await setup();
        const before = new InputEvent('beforeinput', {
          inputType,
          bubbles: true,
          cancelable: true,
        });

        await typeTitle('Call Marit back');
        titleField().dispatchEvent(before);
        await settle();

        expect(before.defaultPrevented).toBe(true);
        expect(send).toHaveBeenCalledTimes(1);
        expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Call Marit back' }));
      },
    );

    it('leaves other beforeinput events alone', async () => {
      const { send, titleField, settle } = await setup();
      const before = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'x',
        bubbles: true,
        cancelable: true,
      });

      titleField().dispatchEvent(before);
      await settle();

      expect(before.defaultPrevented).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });

    it.each([
      ['a\nb', 'a b'],
      ['a\r\nb', 'a b'],
    ])('turns pasted %j into %j', async (pasted, expected) => {
      const { send, typeTitle, changeOn, titleField } = await setup();

      await typeTitle(pasted);

      expect(titleField().value).toBe(expected);

      await changeOn(titleField());

      expect(sent(send, 0)).toEqual(editTask('t1', { title: expected }));
    });

    describe('the caret', () => {
      const typeWithCaret = async (
        el: HTMLTextAreaElement,
        value: string,
        caret: number,
        settle: () => Promise<void>,
      ): Promise<void> => {
        el.value = value;
        el.setSelectionRange(caret, caret);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();
      };

      it.each([
        ['ab\ncd', 3, 'ab cd', 3],
        ['Callx\ny\nz Marit', 9, 'Callx y z Marit', 9],
      ])(
        'turns %j with the caret at %i into %j with the caret at %i',
        async (value, caret, expected, expectedCaret) => {
          const { titleField, settle } = await setup();

          await typeWithCaret(titleField(), value, caret, settle);

          expect(titleField().value).toBe(expected);
          expect(titleField().selectionStart).toBe(expectedCaret);
          expect(titleField().selectionEnd).toBe(expectedCaret);
        },
      );

      it('keeps the caret in place straight after the input event', async () => {
        const { titleField } = await setup();
        const el = titleField();

        el.value = 'ab\ncd';
        el.setSelectionRange(3, 3);
        el.dispatchEvent(new Event('input', { bubbles: true }));

        expect(el.value).toBe('ab cd');
        expect(el.selectionStart).toBe(3);
        expect(el.selectionEnd).toBe(3);
      });

      it('commits the replaced Title', async () => {
        const { send, titleField, settle, changeOn } = await setup();

        await typeWithCaret(titleField(), 'Call\nMarit back', 5, settle);
        await changeOn(titleField());

        expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Call Marit back' }));
      });

      it('does not write the value back when there is no newline', async () => {
        const { titleField, settle } = await setup();
        const el = titleField();
        const real = must(Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value'));
        const writes: string[] = [];

        el.value = 'Call Marit';
        el.setSelectionRange(4, 4);
        Object.defineProperty(el, 'value', {
          configurable: true,
          get: () => real.get?.call(el) as string,
          set: (v: string) => {
            writes.push(v);
            real.set?.call(el, v);
          },
        });
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();

        expect(writes).toEqual([]);
        expect(el.selectionStart).toBe(4);
        expect(el.value).toBe('Call Marit');
      });
    });

    it('marks a blank Title as needing one, and still saves the other fields', async () => {
      const { send, root, typeTitle, changeOn, titleField, press, importanceButton } =
        await setup();

      await typeTitle('   ');
      await changeOn(titleField());

      const error = must(root().querySelector('p[asys-field-error]'));

      expect(error.textContent).toContain('Needs a title');
      expect(titleField().getAttribute('placeholder')).toBe('Title');
      expect(titleField().getAttribute('aria-invalid')).toBe('true');
      expect(titleField().getAttribute('aria-describedby')).toBe(error.id);
      expect(send).not.toHaveBeenCalled();

      await press(importanceButton('Not important'));

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { important: false }));
    });

    it('marks an emptied Estimate as needing one, and sends nothing', async () => {
      const { send, root, click, typeInto, changeOn, settle } = await setup();

      await click(root().querySelector('.asys-estimate__other-toggle'));

      const other = must(root().querySelector<HTMLTextAreaElement>('asys-estimate-field textarea'));

      await typeInto(other, '');
      await changeOn(other);
      other.dispatchEvent(new Event('blur'));
      await settle();

      const error = must(root().querySelector('p[asys-field-error]'));

      expect(error.textContent).toContain('Needs an Estimate');
      expect(send).not.toHaveBeenCalled();
    });

    it('shows no error for a Title that has text', async () => {
      const { root, titleField } = await setup();

      expect(root().querySelector('p[asys-field-error]')).toBeNull();
      expect(titleField().hasAttribute('aria-invalid')).toBe(false);
      expect(titleField().hasAttribute('aria-describedby')).toBe(false);
    });
  });

  describe('the save status', () => {
    it('says Saved in the top bar after an Applied save, and not while a send is in flight', async () => {
      const { press, importanceButton, cell, savedLine, finish, text } = await setup();

      expect(text(savedLine())).toBe('');

      await press(importanceButton('Not important'));

      expect(text(savedLine())).toBe('');

      await finish(0, APPLIED, withTask(BASE, 't1', { important: false, version: 2 }));

      expect(text(savedLine())).toBe('Saved');
      expect(savedLine().querySelector('svg[data-icon="check"]')).not.toBeNull();

      await press(cell('45 min'));

      expect(text(savedLine())).toBe('');
    });

    it('shows the message of a Failed save and a Try again that resends the same command', async () => {
      const { press, importanceButton, finish, statusLine, send, buttonByText, root, click } =
        await setup();

      await press(importanceButton('Not important'));
      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));

      await click(buttonByText(root(), 'Try again'));

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual([editTask('t1', { important: false }), 'key-1']);

      await finish(1, APPLIED, withTask(BASE, 't1', { important: false, version: 2 }));

      expect(buttonByText(root(), 'Try again')).toBeUndefined();
      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('shows no Try again before any save has failed', async () => {
      const { buttonByText, root } = await setup();

      expect(buttonByText(root(), 'Try again')).toBeUndefined();
    });

    it('shows the message of a refused save', async () => {
      const { press, importanceButton, finish, statusLine, send } = await setup();

      await press(importanceButton('Not important'));
      await finish(0, rejected(RejectedReason.InvalidTitle));

      expect(statusLine().textContent?.trim()).toBe('Enter a title.');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('turns the card read-only when a save is NotApplicable', async () => {
      const {
        press,
        importanceButton,
        finish,
        statusLine,
        cardControls,
        moreButton,
        footerButton,
      } = await setup();

      await press(importanceButton('Not important'));
      await finish(0, NOT_APPLICABLE);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(NOT_APPLICABLE));
      expect(cardControls().length).toBeGreaterThan(10);
      expect(cardControls().filter((c) => !c.disabled)).toEqual([]);
      expect(moreButton()).toBeNull();
      expect(must(footerButton('Mark Done')).disabled).toBe(true);
    });

    it('shows a save message in place of the Log progress confirmation', async () => {
      const { footerButton, click, dialog, settle, finish, press, importanceButton, statusLine } =
        await setup();

      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');
      await finish(0, APPLIED, withTask(BASE, 't1', { estimateMinutes: 15, version: 2 }));

      expect(statusLine().textContent?.trim()).toBe('Estimate is now 15 min.');

      await press(importanceButton('Not important'));
      await finish(1, NOT_APPLICABLE);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(NOT_APPLICABLE));
    });

    it('clears the Log progress confirmation when the next save starts', async () => {
      const { footerButton, click, dialog, settle, finish, press, importanceButton, statusLine } =
        await setup();

      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');
      await finish(0, APPLIED, withTask(BASE, 't1', { estimateMinutes: 15, version: 2 }));

      expect(statusLine().textContent?.trim()).toBe('Estimate is now 15 min.');

      await press(importanceButton('Not important'));

      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('keeps the message of a failed save over a later Log progress confirmation', async () => {
      const { footerButton, click, dialog, settle, finish, press, importanceButton, statusLine } =
        await setup();

      await press(importanceButton('Not important'));
      await finish(0, FAILED);
      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');
      await finish(1, APPLIED, withTask(BASE, 't1', { estimateMinutes: 15, version: 2 }));

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));
    });

    it('says the Task waits for the server while its change is held', async () => {
      const { root, awaitingSync, settle } = await setup();

      awaitingSync.set(new Set(['t1']));
      await settle();

      expect(root().querySelector('.task-editor__sync')?.textContent?.trim()).toBe(
        'Saved. Waiting for the server.',
      );

      awaitingSync.set(new Set());
      await settle();

      expect(root().querySelector('.task-editor__sync')).toBeNull();
    });
  });

  describe('the reason line', () => {
    it('says an Inbox Task stays there until Triage, with no chip', async () => {
      const { reason, reasonText, chip } = await setup({
        state: domainState([{ ...CALL, important: null }]),
      });

      expect(reason()).not.toBeNull();
      expect(reasonText()).toBe('In the Inbox until Triage');
      expect(chip()).toBeNull();
    });

    it('shows the strong chip and the reason text of an Available Task', async () => {
      const { reasonText, chip, badges } = await setup({ taskId: 't3' });

      expect(chip()?.classList.contains('asys-quadrant--plan')).toBe(true);
      expect(chip()?.classList.contains('asys-quadrant--strong')).toBe(true);
      expect(reasonText()).toBe('No Due · important');
      expect(badges()).toEqual([]);
    });

    it('badges an Overdue Task and gives its Due as the reason', async () => {
      const { chip, badges, reasonText } = await setup({
        state: domainState([
          {
            ...CALL,
            important: false,
            estimateMinutes: 10,
            due: { date: '2026-10-03', time: '17:00' },
          },
        ]),
      });

      expect(badges()).toEqual(['Overdue']);
      expect(chip()?.classList.contains('asys-quadrant--delegate')).toBe(true);
      expect(reasonText()).toBe('Due yesterday 17:00');
    });

    it('badges a Task that waits for a blocker and names it', async () => {
      const { chip, badges, reasonText } = await setup({
        state: domainState([CALL, WATER], { links: [link('l1', 't1', 't2')] }),
      });

      expect(chip()).not.toBeNull();
      expect(badges()).toEqual(['Blocked']);
      expect(reasonText()).toBe('Blocked by Water form');
    });

    it('shows no Blocked badge once the blocker is Done', async () => {
      const { badges } = await setup({
        state: domainState([CALL, OLD], { links: [link('l1', 't1', 't4')] }),
      });

      expect(badges()).toEqual([]);
    });

    it('shows no reason line for a Delegated Task with no Due and no blockers', async () => {
      const { reason } = await setup({
        state: domainState([{ ...CALL, due: null, status: TaskStatus.Delegated }]),
      });

      expect(reason()).toBeNull();
    });

    it('badges an Overdue Inbox Task and keeps the Inbox text', async () => {
      const { reason, badges, reasonText, chip } = await setup({
        state: domainState([
          { ...CALL, important: null, estimateMinutes: 15, due: { date: '2026-10-03' } },
        ]),
      });

      expect(reason()).not.toBeNull();
      expect(document.querySelectorAll('.task-editor__reason')).toHaveLength(1);
      expect(badges()).toEqual(['Overdue']);
      expect(reasonText()).toBe('In the Inbox until Triage');
      expect(chip()).toBeNull();
    });

    it('badges a blocked Inbox Task and keeps the Inbox text', async () => {
      const { badges, reasonText } = await setup({
        state: domainState([{ ...CALL, important: null, due: null }, WATER], {
          links: [link('l1', 't1', 't2')],
        }),
      });

      expect(badges()).toEqual(['Blocked']);
      expect(reasonText()).toBe('In the Inbox until Triage');
    });

    it('badges an Overdue Delegated Task with the badge alone', async () => {
      const { reason, badges, reasonText } = await setup({
        state: domainState([
          { ...CALL, status: TaskStatus.Delegated, due: { date: '2026-10-03' } },
        ]),
      });

      expect(reason()).not.toBeNull();
      expect(badges()).toEqual(['Overdue']);
      expect(reason()?.querySelector('.task-editor__reason-text')).toBeNull();
      expect(reasonText()).toBe('');
    });

    it('badges an Overdue Available Task with the chip and its reason text', async () => {
      const { chip, badges, reasonText } = await setup({
        state: domainState([{ ...CALL, due: { date: '2026-10-03' } }]),
      });

      expect(chip()).not.toBeNull();
      expect(badges()).toEqual(['Overdue']);
      expect(reasonText()).not.toBe('');
    });

    it('badges a Waiting Task that an open Task blocks', async () => {
      const { badges } = await setup({
        state: domainState([{ ...CALL, availableFrom: { date: '2026-10-09' } }, WATER], {
          links: [link('l1', 't1', 't2')],
        }),
      });

      expect(badges()).toContain('Blocked');
    });

    it('drops the Overdue badge of an Inbox Task once its Due is removed, before the save lands', async () => {
      const { press, rowButton, dialog, badges, sends } = await setup({
        state: domainState([{ ...CALL, important: null, due: { date: '2026-10-03' } }]),
      });

      expect(badges()).toEqual(['Overdue']);

      await press(rowButton('Due'));
      await press(
        Array.from(dialog('Due').querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => (b.textContent ?? '').trim() === 'Remove Due',
        ),
      );

      expect(sends).toHaveLength(1);
      expect(badges()).toEqual([]);
    });

    it('follows the draft before the save lands', async () => {
      const { press, importanceButton, chip, reasonText, sends } = await setup({
        state: domainState([{ ...CALL, important: false, due: NEAR_DUE }]),
      });

      expect(chip()?.classList.contains('asys-quadrant--delegate')).toBe(true);
      expect(reasonText()).toBe('Latest start tomorrow 11:30');

      await press(importanceButton('Important'));

      expect(sends).toHaveLength(1);
      expect(chip()?.classList.contains('asys-quadrant--do')).toBe(true);
      expect(chip()?.classList.contains('asys-quadrant--delegate')).toBe(false);
      expect(reasonText()).toBe('Latest start tomorrow 11:30 · important');
    });

    it('follows a new Estimate before the save lands', async () => {
      const { press, cell, reasonText } = await setup({
        state: domainState([{ ...CALL, due: NEAR_DUE }]),
      });

      expect(reasonText()).toBe('Latest start tomorrow 11:30 · important');

      await press(cell('45 min'));

      expect(reasonText()).toBe('Latest start tomorrow 11:15 · important');
    });

    it('never follows an uncommitted Title', async () => {
      const { typeTitle, reasonText, send } = await setup({
        state: domainState([{ ...CALL, due: NEAR_DUE }]),
      });

      await typeTitle('');

      expect(reasonText()).toBe('Latest start tomorrow 11:30 · important');
      expect(send).not.toHaveBeenCalled();
    });

    it('never follows a cleared Estimate', async () => {
      const { click, root, typeInto, changeOn, reasonText, send } = await setup({
        state: domainState([{ ...CALL, due: NEAR_DUE }]),
      });

      await click(root().querySelector('.asys-estimate__other-toggle'));

      const other = must(root().querySelector<HTMLTextAreaElement>('asys-estimate-field textarea'));

      await typeInto(other, 'abc');
      await changeOn(other);

      expect(reasonText()).toBe('Latest start tomorrow 11:30 · important');
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('Done', () => {
    it('holds the Task and goes to Now at once when there is no history', async () => {
      const { doneUndo, send, footerButton, press, navigate, back } = await setup();

      await press(footerButton('Mark Done'));

      expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(
        CALL,
        DoneOrigin.Button,
        expect.any(Promise),
      );
      expect(send).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
      expect(back).not.toHaveBeenCalled();
    });

    it('goes back at once when the router has a previous navigation', async () => {
      const { doneUndo, send, footerButton, press, navigate, back } = await setup({
        withHistory: true,
      });

      await press(footerButton('Mark Done'));

      expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(
        CALL,
        DoneOrigin.Button,
        expect.any(Promise),
      );
      expect(send).not.toHaveBeenCalled();
      expect(back).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('a pointer Done does not ask the Undo bar for focus', async () => {
      const { doneUndo, footerButton, press } = await setup();

      await press(footerButton('Mark Done'));

      expect(doneUndo.requestFocus).not.toHaveBeenCalled();
    });

    it('a keyboard Done asks the Undo bar for focus, between holding the Task and leaving', async () => {
      const { doneUndo, footerButton, click, navigate } = await setup();

      await click(footerButton('Mark Done'));

      expect(doneUndo.requestFocus).toHaveBeenCalledTimes(1);

      const order = (fn: { mock: { invocationCallOrder: number[] } }): number =>
        must(fn.mock.invocationCallOrder[0]);

      expect(order(doneUndo.complete)).toBeLessThan(order(doneUndo.requestFocus));
      expect(order(doneUndo.requestFocus)).toBeLessThan(order(navigate));
    });

    it('is not disabled by an autosave in flight, so one click is enough', async () => {
      const { doneUndo, send, footerButton, press, importanceButton, navigate } = await setup();

      await press(importanceButton('Not important'));

      expect(send).toHaveBeenCalledTimes(1);
      expect(must(footerButton('Mark Done')).disabled).toBe(false);

      await press(footerButton('Mark Done'));

      expect(doneUndo.complete).toHaveBeenCalledExactlyOnceWith(
        CALL,
        DoneOrigin.Button,
        expect.any(Promise),
      );
      expect(navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('gives the held Done a promise that settles once the autosave has', async () => {
      const { doneUndo, send, footerButton, press, importanceButton, finish } = await setup();

      await press(importanceButton('Not important'));
      await press(footerButton('Mark Done'));

      const after = doneUndo.complete.mock.calls[0]?.[2];
      let settled = false;

      expect(after).toBeInstanceOf(Promise);

      void after?.then(() => {
        settled = true;
      });
      await wait();

      expect(send).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);

      await finish(0, APPLIED);
      await wait();

      expect(settled).toBe(true);
    });

    it('sends a committed change that is not sent yet before it holds the Task', async () => {
      const { doneUndo, send, footerButton, titleField, settle } = await setup();
      const title = titleField();

      title.value = 'Call Marit back';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      title.dispatchEvent(new Event('change', { bubbles: true }));
      must(footerButton('Mark Done')).dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1 }),
      );
      await settle();

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Call Marit back' }));
      expect(doneUndo.complete).toHaveBeenCalledTimes(1);
      expect(must(send.mock.invocationCallOrder[0])).toBeLessThan(
        must(doneUndo.complete.mock.invocationCallOrder[0]),
      );
    });

    it('also commits a typed Title when it holds the Task', async () => {
      const { send, footerButton, typeTitle, press } = await setup();

      await typeTitle('Call Marit back');
      await press(footerButton('Mark Done'));

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Call Marit back' }));
    });

    it('disables Done, Log progress and the blockers once it is leaving, and shows no message', async () => {
      const { footerButton, press, statusLine, send, moreButton, blockers } = await setup();

      await press(footerButton('Mark Done'));

      expect(must(footerButton('Mark Done')).disabled).toBe(true);
      expect(must(footerButton('Log progress')).disabled).toBe(true);
      expect(moreButton()).toBeNull();
      expect(blockers().busy()).toBe(true);
      expect(statusLine().textContent?.trim()).toBe('');
      expect(send).not.toHaveBeenCalled();
    });

    it('is disabled, and holds nothing, while the Task waits for the server', async () => {
      const { doneUndo, footerButton, press, awaitingSync, settle, navigate } = await setup();

      awaitingSync.set(new Set(['t1']));
      await settle();

      expect(must(footerButton('Mark Done')).disabled).toBe(true);
      expect(must(footerButton('Log progress')).disabled).toBe(true);

      await press(footerButton('Mark Done'));

      expect(doneUndo.complete).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('is absent, with the whole footer, unless the Task is Open', async () => {
      const { footer, footerButton } = await setup({
        state: domainState([{ ...CALL, status: TaskStatus.Delegated }]),
      });

      expect(footer()).toBeNull();
      expect(footerButton('Mark Done')).toBeUndefined();
    });

    it('draws the check icon on Mark Done and the progress bar on Log progress', async () => {
      const { footerButton } = await setup();

      expect(
        must(footerButton('Mark Done')).querySelector('svg[data-icon="check"]'),
      ).not.toBeNull();
      expect(
        must(footerButton('Log progress')).querySelector('svg[data-icon="bar-progress-half"]'),
      ).not.toBeNull();
    });

    it('names the change to the Task and draws no primary button, so nothing reads as Save', async () => {
      const { footer, footerButton } = await setup();

      expect(footerButton('Done')).toBeUndefined();
      expect(must(footerButton('Mark Done')).classList).toContain('asys-button--secondary');
      expect(must(footer()).querySelector('.asys-button--primary')).toBeNull();
    });

    describe('the Title the Undo bar names', () => {
      it('is the Title being saved, trimmed, after a rename', async () => {
        const { doneUndo, footerButton, typeTitle, press } = await setup();

        await typeTitle('  Call Marit back ');
        await press(footerButton('Mark Done'));

        expect(doneUndo.complete).toHaveBeenCalledTimes(1);

        const [held, origin] = must(doneUndo.complete.mock.calls[0]);

        expect(held).toEqual({ ...CALL, title: 'Call Marit back' });
        expect(origin).toBe(DoneOrigin.Button);
      });

      it('is the stored Title when the typed one is blank', async () => {
        const { doneUndo, footerButton, typeTitle, press } = await setup();

        await typeTitle('   ');
        await press(footerButton('Mark Done'));

        expect(doneUndo.complete).toHaveBeenCalledTimes(1);
        expect(must(doneUndo.complete.mock.calls[0])[0]).toEqual(CALL);
      });

      it('is the stored Task unchanged when nothing was edited', async () => {
        const { doneUndo, footerButton, press } = await setup();

        await press(footerButton('Mark Done'));

        expect(doneUndo.complete).toHaveBeenCalledTimes(1);
        expect(must(doneUndo.complete.mock.calls[0])[0]).toEqual(CALL);
        expect(must(doneUndo.complete.mock.calls[0])[0].title).toBe('Call Marit');
      });
    });
  });

  describe('leaving at most once', () => {
    it('Back twice goes back once when the router has a previous navigation', async () => {
      const { backButton, press, navigate, back } = await setup({ withHistory: true });

      await press(backButton());
      await press(backButton());

      expect(back).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('Back after Done goes back once', async () => {
      const { backButton, footerButton, press, back } = await setup({ withHistory: true });

      await press(footerButton('Mark Done'));
      await press(backButton());

      expect(back).toHaveBeenCalledTimes(1);
    });

    it('Back twice without history navigates to Now once', async () => {
      const { backButton, press, navigate, back } = await setup();

      await press(backButton());
      await press(backButton());

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
      expect(back).not.toHaveBeenCalled();
    });

    it('lets a second Back navigate again when the first navigation was refused', async () => {
      const { backButton, press, navigate } = await setup();

      navigate.mockResolvedValueOnce(false);

      await press(backButton());

      expect(navigate).toHaveBeenCalledTimes(1);

      await press(backButton());

      expect(navigate).toHaveBeenCalledTimes(2);
      expect(navigate).toHaveBeenLastCalledWith('/now', { replaceUrl: true });
    });
  });

  describe('Log progress', () => {
    it.each([
      [2, true],
      [1, false],
      [null, false],
    ])('is shown for an Estimate of %s: %s', async (estimateMinutes, shown) => {
      const { footerButton } = await setup({
        state: domainState([{ ...CALL, estimateMinutes }]),
      });

      expect(footerButton('Log progress') !== undefined).toBe(shown);
    });

    it('opens the sheet holding the form', async () => {
      const { root, footerButton, click, dialog } = await setup();

      expect(root().querySelector('asys-log-progress-form')).toBeNull();

      await click(footerButton('Log progress'));

      expect(dialog('Log progress').open).toBe(true);
      expect(dialog('Log progress').querySelector('asys-log-progress-form')).not.toBeNull();
    });

    it('sends the remaining minutes, then closes the sheet and says the new Estimate when Applied', async () => {
      const { footerButton, click, dialog, settle, send, finish, statusLine } = await setup();

      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');

      expect(send).toHaveBeenCalledExactlyOnceWith(logProgress('t1', 15), 'key-1');

      await finish(0, APPLIED, withTask(BASE, 't1', { estimateMinutes: 15, version: 2 }));

      expect(dialog('Log progress').open).toBe(false);
      expect(statusLine().textContent?.trim()).toBe('Estimate is now 15 min.');
    });

    it('waits for an autosave in flight before it sends', async () => {
      const { footerButton, click, press, importanceButton, dialog, settle, send, finish } =
        await setup();

      await press(importanceButton('Not important'));
      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toEqual(editTask('t1', { important: false }));

      await finish(0, APPLIED, withTask(BASE, 't1', { important: false, version: 2 }));

      expect(send).toHaveBeenCalledTimes(2);
      expect(sent(send, 1)).toEqual(logProgress('t1', 15));
    });

    it('shows the message inside the sheet and keeps it open when not Applied', async () => {
      const { footerButton, click, dialog, settle, finish, text, statusLine } = await setup();

      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');
      await finish(0, rejected(RejectedReason.InvalidRemaining));

      expect(dialog('Log progress').open).toBe(true);
      expect(text(dialog('Log progress').querySelector('p[role="status"]'))).toBe(
        'Use fewer minutes than the current Estimate.',
      );
      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('focuses the heading when logging progress removes the Log progress button', async () => {
      const { footerButton, click, dialog, settle, finish, heading } = await setup({
        state: domainState([{ ...CALL, estimateMinutes: 2 }]),
      });

      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '1');
      await finish(0, APPLIED, withTask(BASE, 't1', { estimateMinutes: 1, version: 2 }));

      expect(footerButton('Log progress')).toBeUndefined();
      expect(dialog('Log progress').open).toBe(false);
      expect(document.activeElement).toBe(heading());
    });

    it('focuses the Log progress button after Applied while the button remains', async () => {
      const { footerButton, click, dialog, settle, finish } = await setup();

      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');
      await finish(0, APPLIED, withTask(BASE, 't1', { estimateMinutes: 15, version: 2 }));

      expect(document.activeElement).toBe(footerButton('Log progress'));
    });

    it('focuses the Log progress button when the person closes the sheet', async () => {
      const { footerButton, click, dialog } = await setup();

      await click(footerButton('Log progress'));
      await click(dialog('Log progress').querySelector('button[aria-label="Close"]'));

      expect(dialog('Log progress').open).toBe(false);
      expect(document.activeElement).toBe(footerButton('Log progress'));
    });

    it('Cancel closes the sheet and sends nothing', async () => {
      const { footerButton, click, dialog, send, inDialog } = await setup();

      await click(footerButton('Log progress'));
      await click(inDialog('Log progress', 'Cancel'));

      expect(dialog('Log progress').open).toBe(false);
      expect(send).not.toHaveBeenCalled();
    });

    it('does not send a second Log progress while one is in flight', async () => {
      const { footerButton, click, dialog, settle, send } = await setup();

      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');
      await saveProgress(() => dialog('Log progress'), settle, '10');

      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe('More and Drop', () => {
    const openDrop = async (
      setupResult: Awaited<ReturnType<typeof setup>>,
    ): Promise<HTMLButtonElement> => {
      const { moreButton, click, inDialog } = setupResult;

      await click(moreButton());
      await click(inDialog('More', 'Drop'));

      return must(
        buttonByTextIn(setupResult.dialog('More'), '.asys-confirm', 'Drop'),
        'the Drop confirmation',
      );
    };

    it('opens the More sheet with a Drop button', async () => {
      const { moreButton, click, dialog, inDialog } = await setup();

      expect(dialog('More').open).toBe(false);

      await click(moreButton());

      expect(dialog('More').open).toBe(true);
      expect(inDialog('More', 'Drop')).toBeDefined();
    });

    it('asks first, naming the Task, with focus on Cancel, and sends nothing until confirmed', async () => {
      const s = await setup();

      await openDrop(s);

      expect(s.text(s.dialog('More').querySelector('.asys-confirm__message'))).toBe(
        'Drop “Call Marit”? This cannot be undone.',
      );
      expect(document.activeElement).toBe(s.dialog('More').querySelector('.asys-confirm__cancel'));
      expect(s.send).not.toHaveBeenCalled();
    });

    it('Cancel hides the confirmation and focuses the Drop button', async () => {
      const s = await setup();

      await openDrop(s);
      await s.click(s.dialog('More').querySelector('.asys-confirm__cancel'));

      expect(s.dialog('More').querySelector('asys-inline-confirm')).toBeNull();
      expect(document.activeElement).toBe(s.inDialog('More', 'Drop'));
      expect(s.send).not.toHaveBeenCalled();
    });

    it('confirmed, sends a DropTask and leaves when Applied', async () => {
      const s = await setup();
      const confirm = await openDrop(s);

      await s.click(confirm);

      expect(s.send).toHaveBeenCalledExactlyOnceWith(dropTask('t1'), 'key-1');

      await s.finish(0, APPLIED, withoutTask(BASE, 't1'));

      expect(s.navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
      expect(s.dialog('More').open).toBe(false);
    });

    it('waits for an autosave in flight before it sends the DropTask', async () => {
      const s = await setup();

      await s.press(s.importanceButton('Not important'));

      const confirm = await openDrop(s);

      await s.click(confirm);

      expect(s.send).toHaveBeenCalledTimes(1);
      expect(sent(s.send, 0)).toEqual(editTask('t1', { important: false }));

      await s.finish(0, APPLIED, withTask(BASE, 't1', { important: false, version: 2 }));

      expect(s.send).toHaveBeenCalledTimes(2);
      expect(sent(s.send, 1)).toEqual(dropTask('t1'));
    });

    it('sends no EditTask for a change made while the Drop is in flight', async () => {
      const s = await setup();
      const confirm = await openDrop(s);

      await s.click(confirm);
      await s.typeInto(s.titleField(), 'Call Marit back');
      await s.changeOn(s.titleField());
      await s.press(s.importanceButton('Not important'));

      expect(s.send).toHaveBeenCalledTimes(1);
      expect(sent(s.send, 0)).toEqual(dropTask('t1'));
    });

    it('disables the actions and the blockers while the Drop is in flight', async () => {
      const s = await setup();
      const confirm = await openDrop(s);

      await s.click(confirm);

      expect(must(s.footerButton('Mark Done')).disabled).toBe(true);
      expect(must(s.footerButton('Log progress')).disabled).toBe(true);
      expect(s.blockers().busy()).toBe(true);
      expect(s.cardControls().length).toBeGreaterThan(10);
      expect(s.cardControls().filter((c) => !c.disabled)).toEqual([]);
    });

    it('shows the message in the sheet when the Drop is not Applied, and saving resumes', async () => {
      const s = await setup();
      const confirm = await openDrop(s);

      await s.click(confirm);
      await s.finish(0, NOT_APPLICABLE);

      expect(s.text(s.dialog('More'))).toContain(outcomeMessage(NOT_APPLICABLE));
      expect(s.dialog('More').open).toBe(true);
      expect(s.navigate).not.toHaveBeenCalled();
      expect(must(s.footerButton('Mark Done')).disabled).toBe(false);

      await s.press(s.importanceButton('Not important'));

      expect(s.send).toHaveBeenCalledTimes(2);
      expect(sent(s.send, 1)).toEqual(editTask('t1', { important: false }));
    });

    it('shows the confirmation in place of the Drop button, and Cancel brings the button back', async () => {
      const s = await setup();
      const dropButtons = (): HTMLButtonElement[] =>
        Array.from(s.dialog('More').querySelectorAll<HTMLButtonElement>('button')).filter(
          (b) => s.text(b) === 'Drop' && b.closest('.asys-confirm') === null,
        );

      await s.click(s.moreButton());

      expect(dropButtons()).toHaveLength(1);

      await s.click(dropButtons()[0]);

      expect(s.dialog('More').querySelector('asys-inline-confirm')).not.toBeNull();
      expect(dropButtons()).toEqual([]);

      await s.click(s.dialog('More').querySelector('.asys-confirm__cancel'));

      expect(dropButtons()).toHaveLength(1);
      expect(document.activeElement).toBe(dropButtons()[0]);
    });

    it('shows no confirmation and no message when More is reopened after a failed Drop', async () => {
      const s = await setup();
      const confirm = await openDrop(s);

      await s.click(confirm);
      await s.finish(0, NOT_APPLICABLE);

      expect(s.text(s.dialog('More').querySelector('p[role="status"]'))).toBe(
        outcomeMessage(NOT_APPLICABLE),
      );

      await s.click(s.dialog('More').querySelector('button[aria-label="Close"]'));

      expect(s.dialog('More').open).toBe(false);

      await s.click(s.moreButton());

      expect(s.dialog('More').open).toBe(true);
      expect(s.dialog('More').querySelector('asys-inline-confirm')).toBeNull();
      expect(s.text(s.dialog('More').querySelector('p[role="status"]'))).toBe('');
    });

    it('focuses the More button when the person closes the sheet', async () => {
      const s = await setup();

      await s.click(s.moreButton());
      await s.click(s.dialog('More').querySelector('button[aria-label="Close"]'));

      expect(s.dialog('More').open).toBe(false);
      expect(document.activeElement).toBe(s.moreButton());
    });

    it('focuses the heading when the More button is gone as the sheet closes', async () => {
      const s = await setup();

      await s.click(s.moreButton());
      await s.update(withTask(BASE, 't1', { status: TaskStatus.Delegated, version: 2 }));

      expect(s.moreButton()).toBeNull();

      await s.click(s.dialog('More').querySelector('button[aria-label="Close"]'));

      expect(document.activeElement).toBe(s.heading());
    });

    it('has no More button unless the Task is Open', async () => {
      const { moreButton } = await setup({
        state: domainState([{ ...CALL, status: TaskStatus.Delegated }]),
      });

      expect(moreButton()).toBeNull();
    });
  });

  describe('Blocked by', () => {
    it('renders the blockers section, not busy', async () => {
      const { blockers, root } = await setup();

      expect(root().querySelector('asys-task-blockers')).not.toBeNull();
      expect(blockers().busy()).toBe(false);
    });

    it('is not rendered when the Task is missing', async () => {
      const { root } = await setup({ taskId: 'nope' });

      expect(root().querySelector('asys-task-blockers')).toBeNull();
    });

    it('is busy while the Task waits for the server', async () => {
      const { blockers, awaitingSync, settle } = await setup();

      awaitingSync.set(new Set(['t1']));
      await settle();

      expect(blockers().busy()).toBe(true);

      awaitingSync.set(new Set());
      await settle();

      expect(blockers().busy()).toBe(false);
    });

    it('is not busy while an autosave is in flight', async () => {
      const { blockers, press, importanceButton } = await setup();

      await press(importanceButton('Not important'));

      expect(blockers().busy()).toBe(false);
    });
  });

  describe('when the screen is destroyed while a send is pending', () => {
    it('Log progress shows no status and throws nothing', async () => {
      const { fixture, sends, handleError, statusLine, footerButton, click, dialog, navigate } =
        await setup();
      const line = statusLine();

      await click(footerButton('Log progress'));

      const input = must(dialog('Log progress').querySelector<HTMLTextAreaElement>('textarea'));

      input.value = '15';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await click(
        Array.from(dialog('Log progress').querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => (b.textContent ?? '').trim() === 'Save',
        ),
      );
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await wait();

      expect(handleError).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('Log progress submitted while an autosave is in flight sends nothing after destroy', async () => {
      const {
        fixture,
        sends,
        send,
        handleError,
        press,
        importanceButton,
        footerButton,
        click,
        dialog,
        settle,
      } = await setup();

      await press(importanceButton('Not important'));
      await click(footerButton('Log progress'));
      await saveProgress(() => dialog('Log progress'), settle, '15');

      expect(send).toHaveBeenCalledTimes(1);

      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await wait();
      await wait();

      expect(send).toHaveBeenCalledTimes(1);
      expect(handleError).not.toHaveBeenCalled();
    });

    it('Drop does not navigate or go back', async () => {
      const s = await setup();

      await s.click(s.moreButton());
      await s.click(s.inDialog('More', 'Drop'));
      await s.click(buttonByTextIn(s.dialog('More'), '.asys-confirm', 'Drop'));
      s.fixture.destroy();
      must(s.sends[0]).resolve(APPLIED);
      await wait();

      expect(s.navigate).not.toHaveBeenCalled();
      expect(s.back).not.toHaveBeenCalled();
      expect(s.handleError).not.toHaveBeenCalled();
    });

    it('Drop waiting for an autosave sends nothing after destroy', async () => {
      const s = await setup();

      await s.press(s.importanceButton('Not important'));
      await s.click(s.moreButton());
      await s.click(s.inDialog('More', 'Drop'));
      await s.click(buttonByTextIn(s.dialog('More'), '.asys-confirm', 'Drop'));
      s.fixture.destroy();
      must(s.sends[0]).resolve(APPLIED);
      await wait();

      expect(s.send).toHaveBeenCalledTimes(1);
      expect(s.navigate).not.toHaveBeenCalled();
      expect(s.back).not.toHaveBeenCalled();
      expect(s.handleError).not.toHaveBeenCalled();
    });

    it('Done navigates once even when destroyed right after', async () => {
      const { fixture, handleError, navigate, back, footerButton, press } = await setup();

      await press(footerButton('Mark Done'));
      fixture.destroy();
      await wait();

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
      expect(back).not.toHaveBeenCalled();
      expect(handleError).not.toHaveBeenCalled();
    });

    it('Done goes back once even when destroyed right after, when the router has history', async () => {
      const { fixture, handleError, navigate, back, footerButton, press } = await setup({
        withHistory: true,
      });

      await press(footerButton('Mark Done'));
      fixture.destroy();
      await wait();

      expect(back).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
      expect(handleError).not.toHaveBeenCalled();
    });
  });

  describe('reason line recomputation', () => {
    const counted = () => {
      const nowSignal = signal(T0);
      const now = vi.fn(() => nowSignal());

      return { now, readNow: now as () => Instant };
    };

    it('does not read the Clock while the Title is typed but not committed', async () => {
      const { now, readNow } = counted();
      const { titleField, settle } = await setup({ readNow });
      const el = titleField();

      await settle();
      now.mockClear();
      for (const value of ['Call', 'Call Ma', 'Call Marit']) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await settle();

      expect(now).not.toHaveBeenCalled();
    });

    it('does not read the Clock while the Notes are typed but not committed', async () => {
      const { now, readNow } = counted();
      const { press, addNotes, notesField, settle } = await setup({ readNow });

      await press(addNotes());
      await settle();
      const el = must(notesField());

      now.mockClear();
      for (const value of ['a', 'a no', 'a note']) {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await settle();

      expect(now).not.toHaveBeenCalled();
    });

    it('reads the Clock once a changed Title is committed', async () => {
      const { now, readNow } = counted();
      const { titleField, settle, typeInto, changeOn } = await setup({ readNow });

      await settle();
      now.mockClear();
      await typeInto(titleField(), 'Call Marit back');
      await changeOn(titleField());

      expect(now).toHaveBeenCalled();
    });
  });
});

describe('TaskEditor page insets', () => {
  const BAR_PROPERTY = '--task-editor-bar-height';
  const FOOTER_PROPERTY = '--task-editor-footer-height';
  const OBSERVER_KEY = 'ResizeObserver';
  const BAR_HEIGHT = 56;
  const FOOTER_HEIGHT = 80;

  interface FakeObserver {
    readonly observed: Element[];
    readonly disconnect: ReturnType<typeof vi.fn>;
    readonly fire: (target: Element, blockSize: number) => void;
  }

  /** Installs a `ResizeObserver` that reports a border box of the bar or footer height as soon as it observes. */
  const installObserver = (): FakeObserver[] => {
    const instances: FakeObserver[] = [];

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
        this.fire(target, target.tagName === 'FOOTER' ? FOOTER_HEIGHT : BAR_HEIGHT);
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

    vi.stubGlobal(OBSERVER_KEY, FakeResizeObserver);

    const view = document.defaultView;

    if (view !== null && view !== (globalThis as unknown)) {
      Object.defineProperty(view, OBSERVER_KEY, {
        value: FakeResizeObserver,
        configurable: true,
        writable: true,
      });
    }

    return instances;
  };

  const clearRoot = (): void => {
    document.documentElement.classList.remove('task-editor-open');
    document.documentElement.style.removeProperty(BAR_PROPERTY);
    document.documentElement.style.removeProperty(FOOTER_PROPERTY);
  };

  afterEach(() => {
    vi.unstubAllGlobals();

    const view = document.defaultView;

    if (view !== null) {
      Reflect.deleteProperty(view, OBSERVER_KEY);
    }

    clearRoot();
  });

  const property = (name: string): string => document.documentElement.style.getPropertyValue(name);

  it('publishes the bar and footer heights and marks the page while the editor exists', async () => {
    const instances = installObserver();
    const { bar, footer } = await setup();
    const root = document.documentElement;

    expect(root.classList.contains('task-editor-open')).toBe(true);
    expect(property(BAR_PROPERTY)).toBe(`${BAR_HEIGHT}px`);
    expect(property(FOOTER_PROPERTY)).toBe(`${FOOTER_HEIGHT}px`);
    expect(instances.flatMap((instance) => instance.observed)).toEqual(
      expect.arrayContaining([bar(), must(footer())]),
    );
  });

  it('follows a resize of the bar', async () => {
    const instances = installObserver();
    const { bar, settle } = await setup();
    const observer = must(instances.find((instance) => instance.observed.includes(bar())));

    observer.fire(bar(), 72);
    await settle();

    expect(property(BAR_PROPERTY)).toBe('72px');
  });

  it('sets the footer height back to 0px when the footer is removed', async () => {
    installObserver();

    const { update } = await setup();

    expect(property(FOOTER_PROPERTY)).toBe(`${FOOTER_HEIGHT}px`);

    await update(withTask(BASE, 't1', { status: TaskStatus.Delegated, version: 2 }));

    expect(property(FOOTER_PROPERTY)).toBe('0px');
    expect(property(BAR_PROPERTY)).toBe(`${BAR_HEIGHT}px`);
  });

  it('removes the class and both properties and disconnects the observers on destroy', async () => {
    const instances = installObserver();
    const { fixture } = await setup();

    expect(instances.length).toBeGreaterThan(0);

    fixture.destroy();

    expect(document.documentElement.classList.contains('task-editor-open')).toBe(false);
    expect(property(BAR_PROPERTY)).toBe('');
    expect(property(FOOTER_PROPERTY)).toBe('');
    expect(instances.every((instance) => instance.disconnect.mock.calls.length > 0)).toBe(true);
  });

  it('does nothing without a ResizeObserver', async () => {
    vi.stubGlobal(OBSERVER_KEY, undefined);

    const { card } = await setup();

    expect(card()).not.toBeNull();
    expect(property(BAR_PROPERTY)).toBe('');
    expect(property(FOOTER_PROPERTY)).toBe('');
  });

  it('keeps the page marked when one editor replaces another, and clears it after the last', async () => {
    installObserver();

    const s = stubs({});

    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'tasks/:taskId', component: TaskEditorRoute },
            { path: 'now', component: Stub },
          ],
          withComponentInputBinding(),
        ),
        ...s.providers,
      ],
    });

    const harness = await RouterTestingHarness.create();
    const flush = async (): Promise<void> => {
      for (let round = 0; round < 3; round++) {
        await wait();
        await harness.fixture.whenStable();
        harness.detectChanges();
        await harness.fixture.whenStable();
      }
    };
    const root = document.documentElement;

    await harness.navigateByUrl('/tasks/t1');
    await flush();

    expect(root.classList.contains('task-editor-open')).toBe(true);

    await harness.navigateByUrl('/tasks/t2');
    await flush();

    expect(root.classList.contains('task-editor-open')).toBe(true);
    expect(property(BAR_PROPERTY)).toBe(`${BAR_HEIGHT}px`);
    expect(property(FOOTER_PROPERTY)).toBe(`${FOOTER_HEIGHT}px`);

    await harness.navigateByUrl('/now');
    await flush();

    expect(root.classList.contains('task-editor-open')).toBe(false);
    expect(property(BAR_PROPERTY)).toBe('');
    expect(property(FOOTER_PROPERTY)).toBe('');
  });
});

describe('TaskEditor task title hooks', () => {
  const marked = (root: () => HTMLElement): Element[] =>
    Array.from(root().querySelectorAll('[data-morph]'));

  it.each(['t1', 't2'])(
    'puts the Task id %s on the Title textarea as data-task-id',
    async (taskId) => {
      const { root, titleField } = await setup({ taskId });

      expect(titleField().getAttribute('data-task-id')).toBe(taskId);
      expect(Array.from(root().querySelectorAll('[data-task-id]'))).toEqual([titleField()]);
    },
  );

  it('has data-morph on the Title while TaskMorph holds its id, and drops it for another id', async () => {
    const { root, titleField, settle } = await setup();

    expect(titleField().hasAttribute('data-morph')).toBe(false);

    TestBed.inject(TaskMorph).set('t1');
    await settle();

    expect(titleField().getAttribute('data-morph')).toBe('');
    expect(marked(root)).toEqual([titleField()]);

    TestBed.inject(TaskMorph).set('def');
    await settle();

    expect(titleField().hasAttribute('data-morph')).toBe(false);
    expect(marked(root)).toEqual([]);
  });

  it('keeps the hidden heading free of the hooks', async () => {
    const { heading, settle } = await setup();

    TestBed.inject(TaskMorph).set('t1');
    await settle();

    expect(heading().classList.contains('task-editor__heading')).toBe(true);
    expect(heading().textContent?.trim()).toBe('Call Marit');
    expect(heading().hasAttribute('data-task-id')).toBe(false);
    expect(heading().hasAttribute('data-morph')).toBe(false);
  });
});

describe('TaskEditor through the route', () => {
  it('shows the other Task after navigating with a typed Title, and sends only its own patch', async () => {
    const s = stubs({});

    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'tasks/:taskId', component: TaskEditorRoute },
            { path: 'now', component: Stub },
          ],
          withComponentInputBinding(),
        ),
        ...s.providers,
      ],
    });

    const harness = await RouterTestingHarness.create();
    const root = (): HTMLElement => harness.fixture.nativeElement;
    const flush = async (): Promise<void> => {
      for (let round = 0; round < 3; round++) {
        await wait();
        await harness.fixture.whenStable();
        harness.detectChanges();
        await harness.fixture.whenStable();
      }
    };
    const titleField = (): HTMLTextAreaElement =>
      must(root().querySelector<HTMLTextAreaElement>('textarea[aria-label="Title"]'));

    await harness.navigateByUrl('/tasks/t1');
    await flush();

    expect(titleField().value).toBe('Call Marit');

    titleField().value = 'Edited on A';
    titleField().dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(s.send).not.toHaveBeenCalled();

    await harness.navigateByUrl('/tasks/t2');
    await flush();

    expect(root().querySelector('h1.task-editor__heading')?.textContent?.trim()).toBe('Water form');
    expect(titleField().value).toBe('Water form');
    expect(titleField().getAttribute('data-task-id')).toBe('t2');

    must(root().querySelector<HTMLElement>('.asys-estimate__cell[aria-label="45 min"]')).click();
    await flush();

    // Leaving the first editor saved what was typed there; the second sends only its own change.
    expect(s.send.mock.calls.map((call) => call[0])).toEqual([
      editTask('t1', { title: 'Edited on A' }),
      editTask('t2', { estimateMinutes: 45 }),
    ]);
  });
});
