// SPDX-License-Identifier: EUPL-1.2
import { Location } from '@angular/common';
import { Component, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Clock } from '../../core/platform/clock';
import { Ids } from '../../core/platform/ids';
import { TaskMorph } from '../../core/platform/task-morph';
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
  readonly timeZone?: string;
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
  let counter = 0;
  const next = vi.fn<() => string>(() => `key-${++counter}`);
  const handleError = vi.fn<(error: unknown) => void>();

  return {
    state,
    handleError,
    status,
    awaitingSync,
    sends,
    send,
    refresh,
    next,
    providers: [
      { provide: DataStore, useValue: { state, status, awaitingSync, send, refresh } },
      { provide: Clock, useValue: { now: signal(T0) } },
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
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const click = async (el: HTMLElement | null | undefined): Promise<void> => {
    must(el).click();
    await settle();
  };
  const heading = (): HTMLElement => must(root().querySelector('h1.task-editor__title'));
  const statusLine = (): HTMLElement => must(root().querySelector('p.task-editor__status'));
  const buttons = (): HTMLButtonElement[] => Array.from(root().querySelectorAll('button'));
  // A button by its text, outside the confirmation, the progress form and the picker items.
  const button = (name: string): HTMLButtonElement | undefined =>
    buttons().find(
      (b) =>
        text(b) === name &&
        b.closest('.asys-confirm') === null &&
        b.closest('asys-log-progress-form') === null,
    );
  const saveButton = (): HTMLButtonElement | undefined => button('Save');
  const textField = (label: string): HTMLElement | undefined =>
    Array.from(root().querySelectorAll<HTMLElement>('asys-text-field')).find(
      (f) => text(f.querySelector('label')) === label,
    );
  const control = (label: string): HTMLInputElement | HTMLTextAreaElement =>
    must(must(textField(label)).querySelector('input, textarea'));
  const type = async (label: string, value: string): Promise<void> => {
    const el = control(label);

    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const byLegend = (tag: string, legend: string): HTMLElement =>
    must(
      Array.from(root().querySelectorAll<HTMLElement>(tag)).find(
        (f) => text(f.querySelector('legend')) === legend,
      ),
    );
  const importance = async (important: boolean): Promise<void> => {
    await click(
      byLegend('asys-segmented', 'Importance').querySelectorAll<HTMLElement>(
        '.asys-segmented__option',
      )[important ? 0 : 1],
    );
  };
  const pressedImportance = (): number =>
    Array.from(
      byLegend('asys-segmented', 'Importance').querySelectorAll('.asys-segmented__option'),
    ).findIndex((b) => b.getAttribute('aria-pressed') === 'true');
  // The chips are 5, 15, 25, 45, 60 and 120 minutes.
  const chip = async (index: number): Promise<void> => {
    await click(root().querySelectorAll<HTMLElement>('.asys-estimate__chip--num')[index]);
  };
  const pressedChip = (): number =>
    Array.from(root().querySelectorAll('.asys-estimate__chip--num')).findIndex(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
  const otherEstimate = async (value: string): Promise<void> => {
    const other = Array.from(
      root().querySelectorAll<HTMLButtonElement>(
        '.asys-estimate__chip:not(.asys-estimate__chip--num)',
      ),
    ).find((b) => text(b) === 'Other');

    await click(other);

    const input = must(root().querySelector<HTMLInputElement>('asys-estimate-field input'));

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const dateInput = (legend: string): HTMLInputElement =>
    must(byLegend('asys-date-spec-field', legend).querySelector('input[type="date"]'));
  const setDate = async (legend: string, value: string): Promise<void> => {
    const input = dateInput(legend);

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const clearDate = async (legend: string): Promise<void> => {
    await click(
      Array.from(byLegend('asys-date-spec-field', legend).querySelectorAll('button')).find(
        (b) => text(b) === 'Clear',
      ),
    );
  };
  const chooseArea = async (value: string): Promise<void> => {
    const select = must(root().querySelector<HTMLSelectElement>('asys-select-field select'));

    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  };
  const areaOptions = (): string[] =>
    Array.from(root().querySelectorAll<HTMLOptionElement>('asys-select-field option')).map(
      (o) => o.value,
    );
  const reason = (): string | null =>
    root().querySelector('.task-editor__reason')?.textContent?.trim() ?? null;
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
    heading,
    statusLine,
    button,
    saveButton,
    textField,
    control,
    type,
    byLegend,
    importance,
    pressedImportance,
    chip,
    pressedChip,
    otherEstimate,
    dateInput,
    setDate,
    clearDate,
    chooseArea,
    areaOptions,
    reason,
    finish,
    update,
  };
};

const textFieldLabels = (root: HTMLElement, text: (el: Element) => string): string[] =>
  Array.from(root.querySelectorAll('asys-text-field label')).map((l) => text(l));

describe('TaskEditor', () => {
  describe('loading', () => {
    it('shows Loading while there is no state', async () => {
      const { text, root } = await setup({ state: null });

      expect(text()).toContain('Loading…');
      expect(root().querySelector('asys-text-field')).toBeNull();
    });

    it('offers Try again after a failed load and sets the baseline when the state arrives', async () => {
      const { text, root, refresh, status, update, click, button, control, saveButton } =
        await setup({ state: null });

      status.set(SyncStatus.Failed);
      await update(null);

      expect(root().querySelector('[role="alert"]')?.textContent).toContain(
        'ASYS could not load your Tasks.',
      );

      await click(button('Try again'));

      expect(refresh).toHaveBeenCalledTimes(1);

      status.set(SyncStatus.Ready);
      await update(BASE);

      expect(text()).not.toContain('Loading…');
      expect(control('Title').value).toBe('Call Marit');
      expect(must(saveButton()).disabled).toBe(true);
    });

    it('shows the stored title as a focusable heading and an always-present status line', async () => {
      const { heading, statusLine } = await setup();

      expect(heading().textContent?.trim()).toBe('Call Marit');
      expect(heading().getAttribute('tabindex')).toBe('-1');
      expect(statusLine().getAttribute('role')).toBe('status');
      expect(statusLine().textContent?.trim()).toBe('');
      expect(getComputedStyle(statusLine()).display).not.toBe('none');
    });
  });

  describe('fields', () => {
    it('shows the stored values in the controls', async () => {
      const { control, pressedImportance, pressedChip, dateInput } = await setup({
        state: domainState([
          { ...CALL, notes: 'About the lease', important: false, estimateMinutes: 45 },
        ]),
      });

      expect(control('Title').value).toBe('Call Marit');
      expect(control('Notes').tagName).toBe('TEXTAREA');
      expect(control('Notes').value).toBe('About the lease');
      expect(pressedImportance()).toBe(1);
      expect(pressedChip()).toBe(3);
      expect(dateInput('Due').value).toBe('2026-10-05');
      expect(dateInput('Available from').value).toBe('');
    });

    it('lists No Area, then the Areas by name, then id', async () => {
      const { areaOptions } = await setup({
        state: domainState([CALL], {
          areas: [area('b', 'Zeta'), area('c', 'Alpha'), area('a', 'Alpha')],
        }),
      });

      expect(areaOptions()).toEqual(['', 'a', 'c', 'b']);
    });

    it('selects the stored Area', async () => {
      const { root } = await setup({
        state: domainState([{ ...CALL, areaId: 'a' }], { areas: [area('a', 'Work')] }),
      });

      expect(must(root().querySelector<HTMLSelectElement>('asys-select-field select')).value).toBe(
        'a',
      );
    });
  });

  describe('Save', () => {
    it('is disabled while nothing changed', async () => {
      const { saveButton } = await setup();

      expect(must(saveButton()).disabled).toBe(true);
    });

    it('sends only the changed fields with the status expectation and the key from the attempts', async () => {
      const { send, type, saveButton, click } = await setup();

      await type('Title', 'Call Marit back');
      await click(saveButton());

      expect(send).toHaveBeenCalledExactlyOnceWith(
        editTask('t1', { title: 'Call Marit back' }),
        'key-1',
      );
      expect('version' in sent(send, 0)).toBe(false);
    });

    it('trims the title and sends notes as typed', async () => {
      const { send, type, saveButton, click } = await setup();

      await type('Title', '  Call Marit back  ');
      await type('Notes', ' ask about\n\nthe lease ');
      await click(saveButton());

      expect(sent(send, 0)).toEqual(
        editTask('t1', { title: 'Call Marit back', notes: ' ask about\n\nthe lease ' }),
      );
    });

    it('sends a chosen Area, Importance and Estimate', async () => {
      const { send, chooseArea, importance, chip, saveButton, click } = await setup({
        state: domainState([CALL], { areas: [area('a', 'Work')] }),
      });

      await chooseArea('a');
      await importance(false);
      await chip(3);
      await click(saveButton());

      expect(sent(send, 0)).toEqual(
        editTask('t1', { areaId: 'a', important: false, estimateMinutes: 45 }),
      );
    });

    it('sends a null Area when the person goes back to No Area', async () => {
      const { send, chooseArea, saveButton, click } = await setup({
        state: domainState([{ ...CALL, areaId: 'a' }], { areas: [area('a', 'Work')] }),
      });

      await chooseArea('');
      await click(saveButton());

      expect(sent(send, 0)).toEqual(editTask('t1', { areaId: null }));
    });

    it('sends changed dates and null for a cleared one', async () => {
      const { send, setDate, clearDate, saveButton, click } = await setup();

      await setDate('Available from', '2026-10-06');
      await clearDate('Due');
      await click(saveButton());

      expect(sent(send, 0)).toEqual(
        editTask('t1', { availableFrom: { date: '2026-10-06' }, due: null }),
      );
    });

    it('is disabled again when a field is changed back', async () => {
      const { type, saveButton } = await setup();

      await type('Title', 'Call Marit back');

      expect(must(saveButton()).disabled).toBe(false);

      await type('Title', 'Call Marit');

      expect(must(saveButton()).disabled).toBe(true);
    });

    it('is disabled with Needs a title for a blank title', async () => {
      const { type, saveButton, reason } = await setup();

      await type('Title', '   ');

      expect(must(saveButton()).disabled).toBe(true);
      expect(reason()).toBe('Needs a title');
    });

    it('is disabled with Needs an Estimate when the Estimate is cleared by a bad Other value', async () => {
      const { otherEstimate, saveButton, text } = await setup();

      await otherEstimate('abc');

      expect(must(saveButton()).disabled).toBe(true);
      expect(text()).toContain('Needs an Estimate');
    });

    it('is disabled while a Save is pending', async () => {
      const { send, type, saveButton, click } = await setup();

      await type('Title', 'Call Marit back');
      await click(saveButton());

      expect(must(saveButton()).disabled).toBe(true);

      must(saveButton()).click();

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('is disabled while the Task waits for the server, which is said next to the actions', async () => {
      const { type, saveButton, awaitingSync, settle, root } = await setup();

      await type('Title', 'Call Marit back');
      awaitingSync.set(new Set(['t1']));
      await settle();

      expect(must(saveButton()).disabled).toBe(true);
      expect(root().querySelector('.task-editor__sync')?.textContent?.trim()).toBe(
        'Saved. Waiting for the server.',
      );

      awaitingSync.set(new Set());
      await settle();

      expect(must(saveButton()).disabled).toBe(false);
      expect(root().querySelector('.task-editor__sync')).toBeNull();
    });

    it('says Saved and becomes the new baseline when Applied', async () => {
      const { type, saveButton, click, finish, statusLine, send, chip, control, heading } =
        await setup();

      await type('Title', 'Call Marit back');
      await click(saveButton());
      await finish(0, APPLIED, withTask(BASE, 't1', { title: 'Call Marit back', version: 2 }));

      expect(statusLine().textContent?.trim()).toBe('Saved.');
      expect(heading().textContent?.trim()).toBe('Call Marit back');
      expect(control('Title').value).toBe('Call Marit back');
      expect(must(saveButton()).disabled).toBe(true);

      await chip(3);
      await click(saveButton());

      expect(sent(send, 1)).toEqual(editTask('t1', { estimateMinutes: 45 }));
    });

    it('keeps the draft and shows the outcome message when not Applied', async () => {
      const { type, saveButton, click, finish, statusLine, control } = await setup();

      await type('Title', 'Call Marit back');
      await click(saveButton());
      await finish(0, NOT_APPLICABLE);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(NOT_APPLICABLE));
      expect(control('Title').value).toBe('Call Marit back');
      expect(must(saveButton()).disabled).toBe(false);

      await click(saveButton());
      await finish(1, rejected(RejectedReason.InvalidTitle));

      expect(statusLine().textContent?.trim()).toBe('Enter a title.');
    });

    it('reuses the key when retrying after Failed', async () => {
      const { send, type, saveButton, click, finish, statusLine } = await setup();

      await type('Title', 'Call Marit back');
      await click(saveButton());
      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));

      await click(saveButton());

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual([editTask('t1', { title: 'Call Marit back' }), 'key-1']);
    });

    it('clears the status line when another action starts', async () => {
      const { type, saveButton, click, finish, statusLine, button } = await setup();

      await type('Title', 'Call Marit back');
      await click(saveButton());
      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).not.toBe('');

      await click(button('Done'));

      expect(statusLine().textContent?.trim()).toBe('');
    });

    it('keeps the status of the Task from when the baseline was first set as the expectation', async () => {
      const { send, type, saveButton, click, update, button } = await setup();

      await type('Title', 'Call Marit back');
      await update(withTask(BASE, 't1', { status: TaskStatus.Delegated, version: 2 }));

      expect(button('Done')).toBeUndefined();

      await click(saveButton());

      expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Call Marit back' }));
    });

    it('keeps edits made while the Save was pending and settles the rest', async () => {
      const { send, type, saveButton, click, finish, control } = await setup();

      await type('Title', 'Mine');
      await click(saveButton());
      await type('Notes', 'a note');
      await finish(0, APPLIED, withTask(BASE, 't1', { title: 'Mine', version: 2 }));

      expect(control('Title').value).toBe('Mine');
      expect(control('Notes').value).toBe('a note');
      expect(must(saveButton()).disabled).toBe(false);

      await click(saveButton());

      expect(sent(send, 1)).toEqual(editTask('t1', { notes: 'a note' }));
    });

    it('keeps the sent values while the follow-up sync failed, then settles when the poll lands', async () => {
      const { send, type, saveButton, click, finish, control, awaitingSync, update, chip, root } =
        await setup();

      await type('Title', 'Mine');
      await click(saveButton());
      awaitingSync.set(new Set(['t1']));
      await finish(0, APPLIED);

      expect(control('Title').value).toBe('Mine');
      expect(must(saveButton()).disabled).toBe(true);
      expect(root().querySelector('.task-editor__sync')).not.toBeNull();

      awaitingSync.set(new Set());
      await update(withTask(BASE, 't1', { title: 'Mine', version: 2 }));

      expect(control('Title').value).toBe('Mine');
      expect(must(saveButton()).disabled).toBe(true);

      await chip(3);
      await click(saveButton());

      expect(sent(send, 1)).toEqual(editTask('t1', { estimateMinutes: 45 }));
    });
  });

  describe('following the store', () => {
    it('lets untouched fields take the stored value while a changed field keeps the draft', async () => {
      const { type, update, control, pressedChip, dateInput, saveButton, click, send } =
        await setup();

      await type('Title', 'Mine');
      await update(
        withTask(BASE, 't1', {
          title: 'Theirs',
          notes: 'server notes',
          estimateMinutes: 45,
          due: { date: '2026-10-09' },
          version: 2,
        }),
      );

      expect(control('Title').value).toBe('Mine');
      expect(control('Notes').value).toBe('server notes');
      expect(pressedChip()).toBe(3);
      expect(dateInput('Due').value).toBe('2026-10-09');

      await click(saveButton());

      expect(sent(send, 0)).toEqual(editTask('t1', { title: 'Mine' }));
    });

    it('keeps a changed field against its own baseline when the store changes other fields', async () => {
      const { chip, update, pressedChip, saveButton, click, send } = await setup();

      await chip(3);
      await update(withTask(BASE, 't1', { notes: 'server notes', version: 2 }));

      expect(pressedChip()).toBe(3);

      await click(saveButton());

      expect(sent(send, 0)).toEqual(editTask('t1', { estimateMinutes: 45 }));
    });

    it('moves the baseline when the draft already equals the new stored value', async () => {
      const { type, update, saveButton, control } = await setup();

      await type('Title', 'Theirs');

      expect(must(saveButton()).disabled).toBe(false);

      await update(withTask(BASE, 't1', { title: 'Theirs', version: 2 }));

      expect(control('Title').value).toBe('Theirs');
      expect(must(saveButton()).disabled).toBe(true);
    });

    it('follows a changed date by value, not by identity', async () => {
      const { update, dateInput, saveButton } = await setup();

      await update(withTask(BASE, 't1', { due: { date: '2026-10-05' }, version: 2 }));

      expect(dateInput('Due').value).toBe('2026-10-05');
      expect(must(saveButton()).disabled).toBe(true);
    });
  });

  describe('a Task that is no longer open', () => {
    it('says so with a link to Now when the id was never seen, without a form', async () => {
      const { text, root, heading } = await setup({ taskId: 'nope' });

      expect(text()).toContain('This Task is no longer open.');
      expect(root().querySelector('a[href="/now"]')?.textContent?.trim()).toBe('Go to Now');
      expect(heading().textContent?.trim()).toBe('Task');
      expect(root().querySelector('asys-text-field')).toBeNull();
    });

    it('keeps the last known title and shows no form while clean', async () => {
      const { text, root, heading, update } = await setup();

      await update(withoutTask(BASE, 't1'));

      expect(text()).toContain('This Task is no longer open.');
      expect(root().querySelector('a[href="/now"]')?.textContent?.trim()).toBe('Go to Now');
      expect(heading().textContent?.trim()).toBe('Call Marit');
      expect(root().querySelector('asys-text-field')).toBeNull();
    });

    it('keeps a dirty form visible and read-only so its text can be copied', async () => {
      const { text, root, type, update, control, saveButton, setDate } = await setup();

      await type('Title', 'My unsaved title');
      await setDate('Available from', '2026-10-06');
      await update(withoutTask(BASE, 't1'));

      expect(text()).toContain('This Task is no longer open.');
      expect(control('Title').value).toBe('My unsaved title');

      const controls = Array.from(
        root().querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
          'asys-text-field input, asys-text-field textarea, asys-select-field select, asys-segmented button, asys-estimate-field button, asys-estimate-field input, asys-date-spec-field input, asys-date-spec-field button',
        ),
      );

      expect(controls.length).toBeGreaterThan(10);
      expect(controls.filter((c) => !c.disabled)).toEqual([]);
      expect(must(saveButton()).disabled).toBe(true);
    });

    it('never shows the missing line while a Done is on its way, then navigates', async () => {
      const { text, heading, button, click, update, finish, navigate, send } = await setup();

      await click(button('Done'));

      expect(sent(send, 0)).toEqual({
        _tag: CommandTag.CompleteTask,
        taskId: 't1',
        expect: { status: 'open' },
      });

      await update(withoutTask(BASE, 't1'));

      expect(text()).not.toContain('no longer open');
      expect(heading().textContent?.trim()).toBe('Call Marit');
      expect(must(button('Done')).disabled).toBe(true);
      expect(navigate).not.toHaveBeenCalled();

      await finish(0, APPLIED);

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
    });

    it('shows the missing line again when a Done or Drop that left was not Applied', async () => {
      const { text, button, click, update, finish, statusLine } = await setup();

      await click(button('Done'));
      await update(withoutTask(BASE, 't1'));
      await finish(0, NOT_APPLICABLE);

      expect(text()).toContain('This Task is no longer open.');
      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(NOT_APPLICABLE));
    });
  });

  describe('Done, Drop and Log progress', () => {
    it('Done sends CompleteTask with the key and goes to Now when there is no history', async () => {
      const { send, button, click, finish, navigate, back } = await setup();

      await click(button('Done'));

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.CompleteTask, taskId: 't1', expect: { status: 'open' } },
        'key-1',
      );

      await finish(0, APPLIED, withTask(BASE, 't1', { status: TaskStatus.Done, version: 2 }));

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
      expect(back).not.toHaveBeenCalled();
    });

    it('goes back when the router has a previous navigation', async () => {
      const { button, click, finish, navigate, back } = await setup({ withHistory: true });

      await click(button('Done'));
      await finish(0, APPLIED, withoutTask(BASE, 't1'));

      expect(back).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('keeps the screen with the message and enables the actions again when Done is not Applied', async () => {
      const { button, click, finish, statusLine, navigate } = await setup();

      await click(button('Done'));

      expect(must(button('Done')).disabled).toBe(true);
      expect(must(button('Drop')).disabled).toBe(true);
      expect(must(button('Log progress')).disabled).toBe(true);

      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(FAILED));
      expect(must(button('Done')).disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('disables the actions while the Task waits for the server', async () => {
      const { button, awaitingSync, settle } = await setup();

      awaitingSync.set(new Set(['t1']));
      await settle();

      expect(must(button('Done')).disabled).toBe(true);
      expect(must(button('Drop')).disabled).toBe(true);
      expect(must(button('Log progress')).disabled).toBe(true);
    });

    it('Drop asks first, naming the Task, and sends nothing until confirmed', async () => {
      const { root, text, button, click, send } = await setup();

      await click(button('Drop'));

      expect(text(root().querySelector('.asys-confirm__message'))).toBe(
        'Drop “Call Marit”? This cannot be undone.',
      );
      expect(send).not.toHaveBeenCalled();
    });

    it('Drop confirmed sends DropTask and leaves', async () => {
      const { root, text, button, click, finish, send, navigate } = await setup();

      await click(button('Drop'));

      const confirm = Array.from(
        root().querySelectorAll<HTMLButtonElement>('.asys-confirm button'),
      ).find((b) => text(b) === 'Drop');

      await click(confirm);

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.DropTask, taskId: 't1', expect: { status: 'open' } },
        'key-1',
      );

      await finish(0, APPLIED, withoutTask(BASE, 't1'));

      expect(navigate).toHaveBeenCalledExactlyOnceWith('/now', { replaceUrl: true });
    });

    it('Cancel hides the confirmation and focuses the Drop button', async () => {
      const { root, button, click, send } = await setup();

      await click(button('Drop'));
      await click(root().querySelector<HTMLElement>('.asys-confirm__cancel'));

      expect(root().querySelector('asys-inline-confirm')).toBeNull();
      expect(document.activeElement).toBe(button('Drop'));
      expect(send).not.toHaveBeenCalled();
    });

    it('a Drop that is not Applied shows the message and lets the person try again', async () => {
      const { root, text, button, click, finish, statusLine, navigate } = await setup();

      await click(button('Drop'));
      await click(
        Array.from(root().querySelectorAll<HTMLButtonElement>('.asys-confirm button')).find(
          (b) => text(b) === 'Drop',
        ),
      );
      await finish(0, NOT_APPLICABLE);

      expect(statusLine().textContent?.trim()).toBe(outcomeMessage(NOT_APPLICABLE));
      expect(must(button('Drop')).disabled).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('hides Done, Drop and Log progress unless the Task is Open', async () => {
      const { button } = await setup({
        state: domainState([{ ...CALL, status: TaskStatus.Delegated }]),
      });

      expect(button('Done')).toBeUndefined();
      expect(button('Drop')).toBeUndefined();
      expect(button('Log progress')).toBeUndefined();
    });

    it('shows Log progress only for an Estimate of at least 2 minutes', async () => {
      const two = await setup({ state: domainState([{ ...CALL, estimateMinutes: 2 }]) });

      expect(two.button('Log progress')).toBeDefined();

      TestBed.resetTestingModule();

      const one = await setup({ state: domainState([{ ...CALL, estimateMinutes: 1 }]) });

      expect(one.button('Log progress')).toBeUndefined();

      TestBed.resetTestingModule();

      const none = await setup({ state: domainState([{ ...CALL, estimateMinutes: null }]) });

      expect(none.button('Log progress')).toBeUndefined();
    });

    it('Log progress sends the remaining minutes and says the new Estimate when Applied', async () => {
      const { root, button, click, finish, send, statusLine, control } = await setup();

      await click(button('Log progress'));

      expect(root().querySelector('asys-log-progress-form')).not.toBeNull();

      const input = must(root().querySelector<HTMLInputElement>('asys-log-progress-form input'));

      input.value = '10';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await click(
        Array.from(
          root().querySelectorAll<HTMLButtonElement>('asys-log-progress-form button'),
        ).find((b) => (b.textContent ?? '').trim() === 'Save'),
      );

      expect(send).toHaveBeenCalledExactlyOnceWith(
        {
          _tag: CommandTag.LogProgress,
          taskId: 't1',
          remainingMinutes: 10,
          expect: { status: 'open' },
        },
        'key-1',
      );

      await finish(0, APPLIED, withTask(BASE, 't1', { estimateMinutes: 10, version: 2 }));

      expect(root().querySelector('asys-log-progress-form')).toBeNull();
      expect(statusLine().textContent?.trim()).toBe('Estimate is now 10 min.');
      expect(control('Title').value).toBe('Call Marit');
    });

    it('keeps the progress form open with the message when not Applied', async () => {
      const { root, button, click, finish, statusLine } = await setup();

      await click(button('Log progress'));

      const input = must(root().querySelector<HTMLInputElement>('asys-log-progress-form input'));

      input.value = '10';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await click(
        Array.from(
          root().querySelectorAll<HTMLButtonElement>('asys-log-progress-form button'),
        ).find((b) => (b.textContent ?? '').trim() === 'Save'),
      );
      await finish(0, rejected(RejectedReason.InvalidRemaining));

      expect(root().querySelector('asys-log-progress-form')).not.toBeNull();
      expect(statusLine().textContent?.trim()).toBe('Use fewer minutes than the current Estimate.');
    });

    it('Cancel closes the progress form and focuses the Log progress button', async () => {
      const { root, button, click, send } = await setup();

      await click(button('Log progress'));
      await click(
        Array.from(
          root().querySelectorAll<HTMLButtonElement>('asys-log-progress-form button'),
        ).find((b) => (b.textContent ?? '').trim() === 'Cancel'),
      );

      expect(root().querySelector('asys-log-progress-form')).toBeNull();
      expect(document.activeElement).toBe(button('Log progress'));
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('when the screen is destroyed while a send is pending', () => {
    const typeInLogForm = async (
      root: () => HTMLElement,
      click: (el: HTMLElement | undefined) => Promise<void>,
    ): Promise<void> => {
      const input = must(root().querySelector<HTMLInputElement>('asys-log-progress-form input'));

      input.value = '10';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await click(
        Array.from(
          root().querySelectorAll<HTMLButtonElement>('asys-log-progress-form button'),
        ).find((b) => (b.textContent ?? '').trim() === 'Save'),
      );
    };

    it('Save shows no status and throws nothing', async () => {
      const { fixture, sends, handleError, statusLine, type, saveButton, click } = await setup();
      const line = statusLine();

      await type('Title', 'Call Marit back');
      await click(saveButton());
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
    });

    it('Done does not navigate or go back', async () => {
      const { fixture, sends, handleError, navigate, back, button, click } = await setup();

      await click(button('Done'));
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(navigate).not.toHaveBeenCalled();
      expect(back).not.toHaveBeenCalled();
      expect(handleError).not.toHaveBeenCalled();
    });

    it('Done does not go back when the router has history', async () => {
      const { fixture, sends, handleError, navigate, back, button, click } = await setup({
        withHistory: true,
      });

      await click(button('Done'));
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(navigate).not.toHaveBeenCalled();
      expect(back).not.toHaveBeenCalled();
      expect(handleError).not.toHaveBeenCalled();
    });

    it('Drop does not navigate or go back', async () => {
      const { fixture, sends, handleError, navigate, back, root, text, button, click } =
        await setup();

      await click(button('Drop'));
      await click(
        Array.from(root().querySelectorAll<HTMLButtonElement>('.asys-confirm button')).find(
          (b) => text(b) === 'Drop',
        ),
      );
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(navigate).not.toHaveBeenCalled();
      expect(back).not.toHaveBeenCalled();
      expect(handleError).not.toHaveBeenCalled();
    });

    it('Log progress shows no status and throws nothing', async () => {
      const { fixture, sends, handleError, statusLine, root, button, click } = await setup();
      const line = statusLine();

      await click(button('Log progress'));
      await typeInLogForm(root, click);
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
    });

    it('Remove throws nothing', async () => {
      const { fixture, sends, handleError, text, root, click } = await setup({
        state: domainState([CALL, WATER, INVOICE, OLD], { links: [link('l1', 't1', 't2')] }),
      });

      await click(
        Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => text(b) === 'Remove',
        ),
      );
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
    });

    it('Add a blocker shows no message and throws nothing', async () => {
      const { fixture, sends, handleError, root, text, button, click } = await setup();

      await click(button('Add a blocker'));
      await click(
        Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => text(b) === 'Water form',
        ),
      );

      const message = must(root().querySelector('p.task-editor__blocker-message'));

      fixture.destroy();
      must(sends[0]).resolve(rejected(RejectedReason.Cycle));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(message.textContent?.trim()).toBe('');
    });
  });

  describe('Blocked by', () => {
    const LINKED = domainState([CALL, WATER, INVOICE, OLD], {
      links: [link('l1', 't1', 't2'), link('l2', 't1', 'gone')],
    });

    it('says the Task waits for no other Task when there are no links', async () => {
      const { text } = await setup();

      expect(text()).toContain('Blocked by');
      expect(text()).toContain('Waits for no other Task.');
    });

    it('lists the blockers by title, or says a missing one is no longer open', async () => {
      const { text, root } = await setup({ state: LINKED });

      expect(text()).not.toContain('Waits for no other Task.');
      expect(text()).toContain('Water form');
      expect(text()).toContain('A Task that is no longer open');
      expect(
        Array.from(root().querySelectorAll('button')).filter((b) => text(b) === 'Remove'),
      ).toHaveLength(2);
    });

    it('Remove sends RemoveBlocker with the link id', async () => {
      const { send, text, root, click, finish } = await setup({ state: LINKED });

      const remove = Array.from(root().querySelectorAll<HTMLButtonElement>('button')).filter(
        (b) => text(b) === 'Remove',
      );

      await click(remove[0]);

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.RemoveBlocker, linkId: 'l1' },
        'key-1',
      );

      await finish(0, APPLIED, { ...LINKED, links: [link('l2', 't1', 'gone')] });

      expect(text()).not.toContain('Water form');
    });

    it('moves focus to Add a blocker when a Remove is Applied', async () => {
      const { text, root, button, click, finish } = await setup({ state: LINKED });

      await click(
        Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => text(b) === 'Remove',
        ),
      );
      await finish(0, APPLIED, { ...LINKED, links: [link('l2', 't1', 'gone')] });

      expect(document.activeElement).toBe(button('Add a blocker'));
    });

    it('disables Remove while pending and while the link waits for the server', async () => {
      const { text, root, click, awaitingSync, settle } = await setup({ state: LINKED });
      const removes = (): HTMLButtonElement[] =>
        Array.from(root().querySelectorAll<HTMLButtonElement>('button')).filter(
          (b) => text(b) === 'Remove',
        );

      awaitingSync.set(new Set(['l2']));
      await settle();

      expect(removes().map((b) => b.disabled)).toEqual([false, true]);

      awaitingSync.set(new Set());
      await click(removes()[0]);

      expect(must(removes()[0]).disabled).toBe(true);
    });
  });

  describe('Add a blocker', () => {
    const candidates = (
      root: HTMLElement,
      text: (el: Element) => string,
      titles: readonly string[],
    ): string[] =>
      Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
        .map((b) => text(b))
        .filter((t) => titles.includes(t));
    const TITLES = ['Call Marit', 'Water form', 'Send invoice', 'Old thing', 'Zebra'];

    it('opens a picker of the candidates ordered by title, leaving out closed and linked Tasks', async () => {
      const { root, text, button, click } = await setup({
        state: domainState([CALL, WATER, INVOICE, OLD, task({ id: 't5', title: 'Zebra' })], {
          links: [link('l9', 't1', 't5')],
        }),
      });

      expect(textFieldLabels(root(), text)).not.toContain('Find a Task');

      await click(button('Add a blocker'));

      expect(textFieldLabels(root(), text)).toContain('Find a Task');
      expect(candidates(root(), text, TITLES)).toEqual(['Send invoice', 'Water form']);
    });

    it('filters by the typed text, ignoring case, and says when nothing matches', async () => {
      const { root, text, button, click, type } = await setup();

      await click(button('Add a blocker'));
      await type('Find a Task', 'WATER');

      expect(candidates(root(), text, TITLES)).toEqual(['Water form']);

      await type('Find a Task', 'nothing like it');

      expect(candidates(root(), text, TITLES)).toEqual([]);
      expect(text(root())).toContain('No Task matches.');
    });

    it('disables Add a blocker and the candidates while the Task waits for the server', async () => {
      const { root, text, button, click, awaitingSync, settle } = await setup();
      const candidate = (): HTMLButtonElement | undefined =>
        Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => text(b) === 'Water form',
        );

      await click(button('Add a blocker'));

      expect(must(candidate()).disabled).toBe(false);

      awaitingSync.set(new Set(['t1']));
      await settle();

      expect(must(button('Add a blocker')).disabled).toBe(true);
      expect(must(candidate()).disabled).toBe(true);

      awaitingSync.set(new Set());
      await settle();

      expect(must(button('Add a blocker')).disabled).toBe(false);
      expect(must(candidate()).disabled).toBe(false);
    });

    it('keeps an empty, displayed blocker message line with the status role', async () => {
      const { root, button, click } = await setup();
      const line = (): HTMLElement => must(root().querySelector('p.task-editor__blocker-message'));

      expect(line().getAttribute('role')).toBe('status');
      expect(line().textContent?.trim()).toBe('');
      expect(getComputedStyle(line()).display).not.toBe('none');

      await click(button('Add a blocker'));

      expect(line().textContent?.trim()).toBe('');
    });

    it('closes with Close', async () => {
      const { root, text, button, click } = await setup();

      await click(button('Add a blocker'));
      await click(button('Close'));

      expect(textFieldLabels(root(), text)).not.toContain('Find a Task');
    });

    it('sends AddBlocker with a link id drawn before the key, then closes and refocuses when Applied', async () => {
      const { root, text, send, button, click, finish } = await setup();

      await click(button('Add a blocker'));
      await click(
        Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => text(b) === 'Water form',
        ),
      );

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.AddBlocker, linkId: 'key-1', taskId: 't1', blockerId: 't2' },
        'key-2',
      );

      await finish(0, APPLIED, { ...BASE, links: [link('key-1', 't1', 't2')] });

      expect(textFieldLabels(root(), text)).not.toContain('Find a Task');
      expect(document.activeElement).toBe(button('Add a blocker'));
      expect(text(root())).toContain('Water form');
    });

    it('shows the cycle message under the button and keeps the picker open', async () => {
      const { root, text, button, click, finish } = await setup();

      await click(button('Add a blocker'));
      await click(
        Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
          (b) => text(b) === 'Water form',
        ),
      );
      await finish(0, rejected(RejectedReason.Cycle));

      expect(root().querySelector('p.task-editor__blocker-message')?.textContent?.trim()).toBe(
        'That would make these Tasks wait for each other.',
      );
      expect(textFieldLabels(root(), text)).toContain('Find a Task');
    });

    it('keeps the link id and key when the person retries after Failed', async () => {
      const { root, text, send, button, click, finish } = await setup();
      const choose = async (): Promise<void> => {
        await click(
          Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
            (b) => text(b) === 'Water form',
          ),
        );
      };

      await click(button('Add a blocker'));
      await choose();
      await finish(0, FAILED);

      expect(root().querySelector('p.task-editor__blocker-message')?.textContent?.trim()).toBe(
        outcomeMessage(FAILED),
      );

      await choose();

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual([
        { _tag: CommandTag.AddBlocker, linkId: 'key-1', taskId: 't1', blockerId: 't2' },
        'key-2',
      ]);
    });
  });

  describe('Blocks', () => {
    it('says no Task waits for this one when nothing does', async () => {
      const { text } = await setup();

      expect(text()).toContain('Blocks');
      expect(text()).toContain('No Task waits for this one.');
    });

    it('links the Tasks that wait for this one', async () => {
      const { root, text } = await setup({
        state: domainState([CALL, WATER, INVOICE, OLD], {
          links: [link('l1', 't3', 't1'), link('l2', 't2', 't1'), link('l3', 't4', 't1')],
        }),
      });
      const anchors = Array.from(root().querySelectorAll<HTMLAnchorElement>('a')).filter((a) =>
        (a.getAttribute('href') ?? '').startsWith('/tasks/'),
      );

      expect(anchors.map((a) => [a.getAttribute('href'), text(a)])).toEqual([
        ['/tasks/t3', 'Send invoice'],
        ['/tasks/t2', 'Water form'],
      ]);
      expect(text(root())).not.toContain('No Task waits for this one.');
    });
  });

  describe('derived lines', () => {
    it('badges an overdue Task and no other', async () => {
      const overdue = await setup({
        state: domainState([{ ...CALL, due: { date: '2026-10-03' } }]),
      });

      expect(overdue.text(overdue.root().querySelector('asys-status-badge'))).toBe('Overdue');

      TestBed.resetTestingModule();

      const fine = await setup();

      expect(fine.root().querySelector('asys-status-badge')).toBeNull();
    });

    it('judges Overdue in UTC when the stored zone is not valid', async () => {
      const state = domainState([{ ...CALL, due: { date: '2026-10-04', time: '09:00' } }]);

      const amsterdam = await setup({ state });

      expect(amsterdam.root().querySelector('asys-status-badge')).not.toBeNull();

      TestBed.resetTestingModule();

      const invalid = await setup({
        state: { ...state, settings: { timeZone: 'Mars/Base', urgencyWindowDays: 2 } },
      });

      expect(invalid.root().querySelector('asys-status-badge')).toBeNull();
    });

    it('badges a Task that waits for an open Task', async () => {
      const blocked = await setup({
        state: domainState([CALL, WATER], { links: [link('l1', 't1', 't2')] }),
      });

      expect(blocked.text(blocked.root().querySelector('asys-status-badge'))).toBe('Blocked');

      TestBed.resetTestingModule();

      const released = await setup({
        state: domainState([CALL, OLD], { links: [link('l1', 't1', 't4')] }),
      });

      expect(released.root().querySelector('asys-status-badge')).toBeNull();
    });

    it('says an Inbox Task stays there until Triage', async () => {
      const inbox = await setup({ state: domainState([{ ...CALL, important: null }]) });

      expect(inbox.text()).toContain('In the Inbox until Triage');

      TestBed.resetTestingModule();

      const triaged = await setup();

      expect(triaged.text()).not.toContain('In the Inbox until Triage');
    });

    it('shows Latest start then Effective due when a waiting Task makes the Effective due earlier', async () => {
      const { text } = await setup({
        state: domainState(
          [
            { ...CALL, due: { date: '2026-10-09' }, estimateMinutes: 30 },
            task({ id: 't3', title: 'Send invoice', due: { date: '2026-10-05', time: '12:00' } }),
          ],
          { links: [link('l1', 't3', 't1')] },
        ),
      });
      const page = text();

      expect(page).toContain('Latest start tomorrow 11:00');
      expect(page).toContain('Effective due tomorrow 11:30');
      expect(page.indexOf('Latest start')).toBeLessThan(page.indexOf('Effective due'));
    });

    it("shows neither line when the Effective due is the Task's own Due", async () => {
      const own = await setup();

      expect(own.text()).not.toContain('Effective due');
      expect(own.text()).not.toContain('Latest start');

      TestBed.resetTestingModule();

      const later = await setup({
        state: domainState(
          [CALL, task({ id: 't3', title: 'Send invoice', due: { date: '2026-10-20' } })],
          { links: [link('l1', 't3', 't1')] },
        ),
      });

      expect(later.text()).not.toContain('Effective due');
      expect(later.text()).not.toContain('Latest start');
    });
  });

  describe('Captured text', () => {
    it('shows the raw capture when it differs from the title', async () => {
      const { root, text } = await setup({
        state: domainState([{ ...CALL, captureText: 'call marit about\nthe lease' }]),
      });
      const section = root().querySelector('section.task-editor__captured');

      expect(section).not.toBeNull();
      expect(text(must(section).querySelector('h2'))).toBe('Captured text');
      expect(must(section).querySelector('p')?.textContent).toBe('call marit about\nthe lease');
    });

    it('hides it when it equals the title or is blank', async () => {
      const same = await setup({ state: domainState([{ ...CALL, captureText: 'Call Marit' }]) });

      expect(same.root().querySelector('.task-editor__captured')).toBeNull();

      TestBed.resetTestingModule();

      const blank = await setup({ state: domainState([{ ...CALL, captureText: '  \n ' }]) });

      expect(blank.root().querySelector('.task-editor__captured')).toBeNull();
    });
  });
});

describe('TaskEditor task title hooks', () => {
  const marked = (root: () => HTMLElement): Element[] =>
    Array.from(root().querySelectorAll('[data-morph]'));

  it.each(['t1', 't2'])('puts the Task id %s on the heading as data-task-id', async (taskId) => {
    const { root, heading } = await setup({ taskId });

    expect(heading().getAttribute('data-task-id')).toBe(taskId);
    expect(Array.from(root().querySelectorAll('[data-task-id]'))).toHaveLength(1);
    expect(Array.from(root().querySelectorAll('[data-task-id]'))[0]).toBe(heading());
  });

  it('has data-morph on the heading while TaskMorph holds its id and drops it for another id', async () => {
    const { root, heading, settle } = await setup();

    expect(heading().hasAttribute('data-morph')).toBe(false);

    TestBed.inject(TaskMorph).taskId.set('t1');
    await settle();

    expect(heading().hasAttribute('data-morph')).toBe(true);
    expect(heading().getAttribute('data-morph')).toBe('');
    expect(marked(root)).toHaveLength(1);
    expect(marked(root)[0]).toBe(heading());

    TestBed.inject(TaskMorph).taskId.set('def');
    await settle();

    expect(heading().hasAttribute('data-morph')).toBe(false);
    expect(marked(root)).toEqual([]);
  });
});

describe('TaskEditor through the route', () => {
  it('shows the other Task after navigating with a dirty form, and saves only its own patch', async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 0));
      await harness.fixture.whenStable();
      harness.detectChanges();
      await harness.fixture.whenStable();
    };
    const titleInput = (): HTMLInputElement =>
      must(
        must(
          Array.from(root().querySelectorAll('asys-text-field')).find(
            (f) => f.querySelector('label')?.textContent?.trim() === 'Title',
          ),
        ).querySelector('input'),
      );
    const saveButton = (): HTMLButtonElement =>
      must(
        Array.from(root().querySelectorAll('button')).find(
          (b) => (b.textContent ?? '').trim() === 'Save',
        ),
      );

    await harness.navigateByUrl('/tasks/t1');
    await flush();

    expect(titleInput().value).toBe('Call Marit');

    titleInput().value = 'Edited on A';
    titleInput().dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(saveButton().disabled).toBe(false);

    await harness.navigateByUrl('/tasks/t2');
    await flush();

    expect(root().querySelector('h1.task-editor__title')?.textContent?.trim()).toBe('Water form');
    expect(titleInput().value).toBe('Water form');
    expect(saveButton().disabled).toBe(true);

    must(root().querySelectorAll<HTMLElement>('.asys-estimate__chip--num')[3]).click();
    await flush();
    saveButton().click();
    await flush();

    expect(s.send).toHaveBeenCalledTimes(1);
    expect(sent(s.send, 0)).toEqual(editTask('t2', { estimateMinutes: 45 }));
  });
});
