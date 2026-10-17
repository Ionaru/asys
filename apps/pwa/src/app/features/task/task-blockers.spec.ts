// SPDX-License-Identifier: EUPL-1.2
import { Component, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CommandTag,
  NotApplicableReason,
  RejectedReason,
  TaskKind,
  TaskStatus,
  type BlockerLink,
  type Command,
  type DomainState,
  type Task,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Ids } from '../../core/platform/ids';
import { TaskBlockers } from './task-blockers';

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

const CALL = task({ id: 't1', title: 'Call Marit', createdAt: 10 });

const WATER = task({ id: 't2', title: 'Water form', createdAt: 11 });

const INVOICE = task({ id: 't3', title: 'Send invoice', createdAt: 12 });

const OLD = task({ id: 't4', title: 'Old thing', status: TaskStatus.Done, closedAt: 5 });

const BASE = domainState([CALL, WATER, INVOICE, OLD]);

const LINKED = domainState([CALL, WATER, INVOICE, OLD], {
  links: [link('l1', 't1', 't2'), link('l2', 't1', 'gone')],
});

const TITLES = ['Call Marit', 'Water form', 'Send invoice', 'Old thing', 'Zebra'];

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

@Component({
  imports: [TaskBlockers],
  providers: [CommandAttempts],
  template: '<asys-task-blockers [taskId]="id()" [busy]="busy()" />',
})
class Host {
  readonly id = signal('t1');

  readonly busy = signal(false);
}

@Component({ template: '' })
class Stub {}

interface SetupOptions {
  readonly state?: DomainState;
}

const setup = async (options: SetupOptions = {}) => {
  const state = signal<DomainState | null>(options.state ?? BASE);
  const awaitingSync = signal<ReadonlySet<string>>(new Set());
  const sends: ReturnType<typeof deferred<CommandOutcome>>[] = [];
  const send = vi.fn<(command: Command, key?: string) => Promise<CommandOutcome>>(() => {
    const d = deferred<CommandOutcome>();

    sends.push(d);

    return d.promise;
  });
  let counter = 0;
  const next = vi.fn<() => string>(() => `key-${++counter}`);
  const handleError = vi.fn<(error: unknown) => void>();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'tasks/:taskId', component: Stub }]),
      {
        provide: DataStore,
        useValue: { state, status: signal(SyncStatus.Ready), awaitingSync, send },
      },
      { provide: Ids, useValue: { next } },
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  });

  const fixture = TestBed.createComponent(Host);

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
  const press = async (el: HTMLElement | null | undefined): Promise<void> => {
    must(el).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await settle();
  };
  const dialog = (): HTMLDialogElement => must(root().querySelector('dialog.asys-sheet'));
  const header = (): HTMLButtonElement => must(root().querySelector('button.asys-section-header'));
  const openSheet = async (): Promise<void> => {
    await press(header());
  };
  const removes = (): HTMLButtonElement[] =>
    Array.from(dialog().querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => text(b) === 'Remove',
    );
  const candidate = (title: string): HTMLButtonElement | undefined =>
    Array.from(dialog().querySelectorAll<HTMLButtonElement>('ul button')).find(
      (b) => text(b) === title && !removes().includes(b),
    );
  const candidates = (): string[] =>
    Array.from(dialog().querySelectorAll<HTMLButtonElement>('button'))
      .map((b) => text(b))
      .filter((t) => TITLES.includes(t));
  const findInput = (): HTMLInputElement =>
    must(
      Array.from(dialog().querySelectorAll<HTMLElement>('asys-text-field'))
        .find((f) => text(f.querySelector('label')) === 'Find a Task')
        ?.querySelector<HTMLInputElement>('input'),
    );
  const type = async (value: string): Promise<void> => {
    const el = findInput();

    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const message = (): HTMLElement => must(dialog().querySelector('p.task-blockers__message'));
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

  await settle();

  return {
    fixture,
    host: fixture.componentInstance,
    attempts: fixture.debugElement.injector.get(CommandAttempts),
    state,
    awaitingSync,
    sends,
    send,
    handleError,
    root,
    text,
    settle,
    press,
    dialog,
    header,
    openSheet,
    removes,
    candidate,
    candidates,
    findInput,
    type,
    message,
    finish,
  };
};

describe('TaskBlockers', () => {
  describe('the header', () => {
    it('opens a dialog and is titled Blocked by', async () => {
      const { header, text } = await setup();

      expect(header().getAttribute('aria-haspopup')).toBe('dialog');
      expect(text(header())).toContain('Blocked by');
    });

    it('summarises no blockers and no dependants', async () => {
      const { header, text } = await setup();

      expect(text(header())).toContain('Waits for no other Task. No Task waits for this one.');
    });

    it('summarises the blockers by title and a missing one as no longer open', async () => {
      const { header, text } = await setup({ state: LINKED });

      expect(text(header())).toContain(
        'Waits for Water form and A Task that is no longer open. No Task waits for this one.',
      );
    });

    it('summarises one blocker and the Tasks that wait for this one', async () => {
      const { header, text } = await setup({
        state: domainState([CALL, WATER, INVOICE], {
          links: [link('l1', 't1', 't2'), link('l2', 't3', 't1')],
        }),
      });

      expect(text(header())).toContain('Waits for Water form. 1 Task waits for this one.');
    });

    it('summarises several blockers and dependants', async () => {
      const extra = task({ id: 't5', title: 'Zebra' });
      const { header, text } = await setup({
        state: domainState([CALL, WATER, INVOICE, extra], {
          links: [
            link('l1', 't1', 't2'),
            link('l2', 't1', 't3'),
            link('l3', 't1', 't5'),
            link('l4', 't2', 't1'),
            link('l5', 't3', 't1'),
          ],
        }),
      });

      expect(text(header())).toContain(
        'Waits for Water form and 2 more. 2 Tasks wait for this one.',
      );
    });
  });

  describe('the sheet', () => {
    it('is closed at first and opened by the header', async () => {
      const { dialog, openSheet, text } = await setup();

      expect(dialog().open).toBe(false);
      expect(text(dialog())).not.toContain('Find a Task');

      await openSheet();

      expect(dialog().open).toBe(true);
      expect(text(dialog())).toContain('Waits for');
      expect(text(dialog())).toContain('Find a Task');
    });

    it('says the Task waits for no other Task when there are no links', async () => {
      const { dialog, openSheet, text, removes } = await setup();

      await openSheet();

      expect(text(dialog())).toContain('Waits for no other Task.');
      expect(removes()).toHaveLength(0);
    });

    it('lists the blockers in link order, a missing one as no longer open', async () => {
      const { dialog, openSheet, removes } = await setup({ state: LINKED });

      await openSheet();

      expect(
        Array.from(dialog().querySelectorAll('.task-blockers__row .task-blockers__title')).map(
          (el) => (el.textContent ?? '').trim(),
        ),
      ).toEqual(['Water form', 'A Task that is no longer open']);
      expect(removes()).toHaveLength(2);
    });

    it('Remove sends RemoveBlocker with the link id', async () => {
      const { send, openSheet, removes, press, finish, dialog } = await setup({
        state: LINKED,
      });

      await openSheet();
      await press(removes()[0]);

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.RemoveBlocker, linkId: 'l1' },
        'key-1',
      );

      await finish(0, APPLIED, { ...LINKED, links: [link('l2', 't1', 'gone')] });

      expect(
        Array.from(dialog().querySelectorAll('.task-blockers__row .task-blockers__title')).map(
          (el) => (el.textContent ?? '').trim(),
        ),
      ).toEqual(['A Task that is no longer open']);
    });

    it('moves focus to the Remove now at the removed index when a Remove is Applied', async () => {
      const { openSheet, removes, press, finish } = await setup({ state: LINKED });

      await openSheet();
      await press(removes()[0]);
      await finish(0, APPLIED, { ...LINKED, links: [link('l2', 't1', 'gone')] });

      expect(document.activeElement).toBe(removes()[0]);
    });

    it('moves focus to the last Remove when the last row was removed', async () => {
      const { openSheet, removes, press, finish } = await setup({ state: LINKED });

      await openSheet();
      await press(removes()[1]);
      await finish(0, APPLIED, { ...LINKED, links: [link('l1', 't1', 't2')] });

      expect(removes()).toHaveLength(1);
      expect(document.activeElement).toBe(removes()[0]);
    });

    it('moves focus to Find a Task when the only Remove is Applied', async () => {
      const only = domainState([CALL, WATER, INVOICE, OLD], { links: [link('l1', 't1', 't2')] });
      const { openSheet, removes, press, finish, findInput } = await setup({ state: only });

      await openSheet();
      await press(removes()[0]);
      await finish(0, APPLIED, BASE);

      expect(document.activeElement).toBe(findInput());
    });

    it('shows the message of a Remove that is not Applied', async () => {
      const { openSheet, removes, press, finish, message } = await setup({ state: LINKED });

      await openSheet();
      await press(removes()[0]);
      await finish(0, NOT_APPLICABLE);

      expect(message().textContent?.trim()).toBe(outcomeMessage(NOT_APPLICABLE));
    });

    it('disables every Remove while busy holds', async () => {
      const { openSheet, removes, host, settle } = await setup({ state: LINKED });

      await openSheet();

      expect(removes().map((b) => b.disabled)).toEqual([false, false]);

      host.busy.set(true);
      await settle();

      expect(removes().map((b) => b.disabled)).toEqual([true, true]);
    });

    it('disables only the Remove whose send is in flight', async () => {
      const { openSheet, removes, press, finish } = await setup({ state: LINKED });

      await openSheet();
      await press(removes()[0]);

      expect(removes().map((b) => b.disabled)).toEqual([true, false]);

      await finish(0, FAILED);

      expect(removes().map((b) => b.disabled)).toEqual([false, false]);
    });

    it('disables the Remove of a link that waits for the server', async () => {
      const { openSheet, removes, awaitingSync, settle } = await setup({ state: LINKED });

      await openSheet();
      awaitingSync.set(new Set(['l2']));
      await settle();

      expect(removes().map((b) => b.disabled)).toEqual([false, true]);
    });
  });

  describe('Find a Task', () => {
    it('shows the hint and the candidates ordered by title, leaving out closed and linked Tasks', async () => {
      const { openSheet, dialog, candidates, text } = await setup({
        state: domainState([CALL, WATER, INVOICE, OLD, task({ id: 't5', title: 'Zebra' })], {
          links: [link('l9', 't1', 't5')],
        }),
      });

      await openSheet();

      expect(text(dialog())).toContain('This Task waits until the one you pick is Done.');
      expect(candidates()).toEqual(['Send invoice', 'Water form']);
    });

    it('leaves out the Tasks that wait for this one', async () => {
      const { openSheet, candidates } = await setup({
        state: domainState([CALL, WATER, INVOICE], { links: [link('l1', 't2', 't1')] }),
      });

      await openSheet();

      expect(candidates()).toEqual(['Send invoice']);
    });

    it('filters by the typed text, ignoring case, and says when nothing matches', async () => {
      const { openSheet, candidates, type, text, dialog } = await setup();

      await openSheet();
      await type('WATER');

      expect(candidates()).toEqual(['Water form']);

      await type('nothing like it');

      expect(candidates()).toEqual([]);
      expect(text(dialog())).toContain('No Task matches.');
    });

    it('sends AddBlocker with a link id drawn before the key', async () => {
      const { send, openSheet, candidate, press } = await setup();

      await openSheet();
      await press(candidate('Water form'));

      expect(send).toHaveBeenCalledExactlyOnceWith(
        { _tag: CommandTag.AddBlocker, linkId: 'key-1', taskId: 't1', blockerId: 't2' },
        'key-2',
      );
    });

    it('keeps the sheet open, clears the filter and focuses Find a Task when Applied', async () => {
      const { openSheet, candidate, press, finish, dialog, findInput, type, text } = await setup();

      await openSheet();
      await type('water');
      await press(candidate('Water form'));
      await finish(0, APPLIED, { ...BASE, links: [link('key-1', 't1', 't2')] });

      expect(dialog().open).toBe(true);
      expect(findInput().value).toBe('');
      expect(document.activeElement).toBe(findInput());
      expect(text(dialog())).toContain('Water form');
    });

    it('shows the cycle message in the status paragraph and keeps the sheet open', async () => {
      const { openSheet, candidate, press, finish, message, dialog } = await setup();

      await openSheet();
      await press(candidate('Water form'));
      await finish(0, rejected(RejectedReason.Cycle));

      expect(message().getAttribute('role')).toBe('status');
      expect(message().textContent?.trim()).toBe(
        'That would make these Tasks wait for each other.',
      );
      expect(dialog().open).toBe(true);
    });

    it('keeps an empty message line until something is said', async () => {
      const { openSheet, message } = await setup();

      await openSheet();

      expect(message().textContent?.trim()).toBe('');
    });

    it('clears the message when a new add starts', async () => {
      const { openSheet, candidate, press, finish, message } = await setup();

      await openSheet();
      await press(candidate('Water form'));
      await finish(0, rejected(RejectedReason.Cycle));
      await press(candidate('Send invoice'));

      expect(message().textContent?.trim()).toBe('');
    });

    it('draws a new link id and key when the same candidate is added again after Rejected', async () => {
      const { openSheet, candidate, press, finish, send } = await setup();

      await openSheet();
      await press(candidate('Water form'));
      await finish(0, rejected(RejectedReason.Cycle));
      await press(candidate('Water form'));

      expect(send).toHaveBeenCalledTimes(2);

      const [first, second] = send.mock.calls;

      expect(first[0]).toMatchObject({ _tag: CommandTag.AddBlocker, blockerId: 't2' });
      expect(second[0]).toMatchObject({ _tag: CommandTag.AddBlocker, blockerId: 't2' });
      expect((second[0] as { linkId: string }).linkId).not.toBe(
        (first[0] as { linkId: string }).linkId,
      );
      expect(second[1]).not.toBe(first[1]);
    });

    it('draws a new link id when the same candidate is added again after its link was removed', async () => {
      const { openSheet, candidate, removes, press, finish, send } = await setup();

      await openSheet();
      await press(candidate('Water form'));
      await finish(0, APPLIED, { ...BASE, links: [link('key-1', 't1', 't2')] });
      await press(removes()[0]);
      await finish(1, APPLIED, BASE);
      await press(candidate('Water form'));

      const adds = send.mock.calls.filter(([c]) => c._tag === CommandTag.AddBlocker);

      expect(adds).toHaveLength(2);
      expect((adds[1][0] as { linkId: string }).linkId).not.toBe(
        (adds[0][0] as { linkId: string }).linkId,
      );
    });

    it('keeps the link id and key when the person retries after Failed', async () => {
      const { openSheet, candidate, press, finish, send, message } = await setup();

      await openSheet();
      await press(candidate('Water form'));
      await finish(0, FAILED);

      expect(message().textContent?.trim()).toBe(outcomeMessage(FAILED));

      await press(candidate('Water form'));

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[1]).toEqual([
        { _tag: CommandTag.AddBlocker, linkId: 'key-1', taskId: 't1', blockerId: 't2' },
        'key-2',
      ]);
    });

    it('disables the candidates while busy holds', async () => {
      const { openSheet, candidate, host, settle } = await setup();

      await openSheet();

      expect(must(candidate('Water form')).disabled).toBe(false);

      host.busy.set(true);
      await settle();

      expect(must(candidate('Water form')).disabled).toBe(true);
      expect(must(candidate('Send invoice')).disabled).toBe(true);

      host.busy.set(false);
      await settle();

      expect(must(candidate('Water form')).disabled).toBe(false);
    });

    it('disables the candidates while its own add is in flight', async () => {
      const { openSheet, candidate, press, finish } = await setup();

      await openSheet();
      await press(candidate('Water form'));

      expect(must(candidate('Water form')).disabled).toBe(true);
      expect(must(candidate('Send invoice')).disabled).toBe(true);

      await finish(0, FAILED);

      expect(must(candidate('Water form')).disabled).toBe(false);
    });

    it('keeps the candidates enabled while another send for the same Task is in flight', async () => {
      const { openSheet, candidate, attempts, settle, sends } = await setup();

      await openSheet();

      const pending = attempts.send({
        _tag: CommandTag.EditTask,
        taskId: 't1',
        patch: { title: 'Call Marit back' },
        expect: { status: 'open' },
      } as Command);

      await settle();

      expect(attempts.busy('t1')).toBe(true);
      expect(must(candidate('Water form')).disabled).toBe(false);

      must(sends[0]).resolve(APPLIED);
      await pending;
    });
  });

  describe('Blocks', () => {
    it('says no Task waits for this one when nothing does', async () => {
      const { openSheet, dialog, text } = await setup();

      await openSheet();

      expect(text(dialog())).toContain('Blocks');
      expect(text(dialog())).toContain('No Task waits for this one.');
    });

    it('links the Tasks that wait for this one', async () => {
      const { openSheet, dialog, text } = await setup({
        state: domainState([CALL, WATER, INVOICE, OLD], {
          links: [link('l1', 't3', 't1'), link('l2', 't2', 't1'), link('l3', 't4', 't1')],
        }),
      });

      await openSheet();

      const anchors = Array.from(dialog().querySelectorAll<HTMLAnchorElement>('a'));

      expect(anchors.map((a) => [a.getAttribute('href'), text(a)])).toEqual([
        ['/tasks/t3', 'Send invoice'],
        ['/tasks/t2', 'Water form'],
      ]);
      expect(text(dialog())).not.toContain('No Task waits for this one.');
    });

    it('closes the sheet when a link is followed', async () => {
      const { openSheet, dialog, press, settle } = await setup({
        state: domainState([CALL, WATER], { links: [link('l1', 't2', 't1')] }),
      });

      await openSheet();

      const anchor = must(dialog().querySelector<HTMLAnchorElement>('a'));

      anchor.addEventListener('click', (e) => e.preventDefault());
      await press(anchor);
      await settle();

      expect(dialog().open).toBe(false);
    });
  });

  describe('when destroyed while a send is pending', () => {
    it('Remove throws nothing and moves no focus', async () => {
      const { fixture, sends, handleError, openSheet, removes, press } = await setup({
        state: LINKED,
      });
      const outside = document.createElement('button');

      document.body.appendChild(outside);
      await openSheet();
      await press(removes()[0]);
      outside.focus();
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    it('Add shows no message, throws nothing and moves no focus', async () => {
      const { fixture, sends, handleError, openSheet, candidate, press, message } = await setup();
      const outside = document.createElement('button');

      document.body.appendChild(outside);
      await openSheet();
      await press(candidate('Water form'));

      const line = message();

      outside.focus();
      fixture.destroy();
      must(sends[0]).resolve(rejected(RejectedReason.Cycle));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    it('Add that is Applied throws nothing and moves no focus', async () => {
      const { fixture, sends, handleError, openSheet, candidate, press } = await setup();
      const outside = document.createElement('button');

      document.body.appendChild(outside);
      await openSheet();
      await press(candidate('Water form'));
      outside.focus();
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });
  });
});
