// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { type TaskBlockerRow, type TaskBlockerTask, TaskBlockers } from './task-blockers';

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const row = (linkId: string, title: string, busy = false): TaskBlockerRow => ({
  linkId,
  title,
  busy,
});

const taskOf = (id: string, title: string): TaskBlockerTask => ({ id, title });

const setup = async (overrides: Record<string, unknown> = {}) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(TaskBlockers);
  const inputs: Record<string, unknown> = {
    summary: 'Waits for no other Task. No Task waits for this one.',
    blockedBy: [],
    blocks: [],
    candidates: [],
    message: '',
    busy: false,
    adding: false,
    filter: '',
    ...overrides,
  };
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  const update = async (name: string, value: unknown): Promise<void> => {
    fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  };
  const text = (el: Element | null = host): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const header = (): HTMLButtonElement => must(host.querySelector('button.asys-section-header'));
  const open = async (): Promise<void> => {
    header().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };
  const dialog = (): HTMLDialogElement => must(host.querySelector('dialog.asys-sheet'));
  const removes = (): HTMLButtonElement[] => [
    ...dialog().querySelectorAll<HTMLButtonElement>('.task-blockers__remove'),
  ];
  const candidates = (): HTMLButtonElement[] => [
    ...dialog().querySelectorAll<HTMLButtonElement>('.task-blockers__candidate'),
  ];
  const findInput = (): HTMLTextAreaElement =>
    must(dialog().querySelector<HTMLTextAreaElement>('asys-text-field textarea'));

  return { fixture, host, update, text, header, open, dialog, removes, candidates, findInput };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('TaskBlockers', () => {
  it('shows the section header titled Blocked by, with the summary', async () => {
    const { header, text } = await setup({
      summary: 'Waits for Water form. 2 Tasks wait for this.',
    });

    expect(header().getAttribute('aria-haspopup')).toBe('dialog');
    expect(text(header())).toContain('Blocked by');
    expect(text(header())).toContain('Waits for Water form. 2 Tasks wait for this.');
  });

  it('renders the header as a bare button, with no section around it', async () => {
    const { host, header } = await setup();

    expect(host.querySelector('section')).toBeNull();
    expect(header().parentElement).toBe(host);
  });

  it('shows no rows, candidates or Blocks before it is opened', async () => {
    const { host } = await setup({
      blockedBy: [row('l1', 'Water form')],
      candidates: [taskOf('t2', 'Call Jan')],
      blocks: [taskOf('t9', 'Send invoice')],
    });

    expect(host.querySelector('.task-blockers__row')).toBeNull();
    expect(host.querySelector('.task-blockers__candidate')).toBeNull();
    expect(host.querySelector('.task-blockers__link')).toBeNull();
  });

  it('opens a Blocked by sheet with the rows, candidates and dependants from its inputs', async () => {
    const { open, dialog, text } = await setup({
      blockedBy: [row('l1', 'Water form'), row('l2', 'Old link')],
      candidates: [taskOf('t2', 'Call Jan'), taskOf('t3', 'Send invoice')],
      blocks: [taskOf('t9', 'Pay rent')],
      message: 'Could not add.',
    });

    await open();

    expect(text(dialog().querySelector('h2.asys-sheet__heading'))).toBe('Blocked by');
    expect(
      [...dialog().querySelectorAll('.task-blockers__row .task-blockers__title')].map((t) =>
        text(t),
      ),
    ).toEqual(['Water form', 'Old link']);
    expect([...dialog().querySelectorAll('.task-blockers__candidate')].map((c) => text(c))).toEqual(
      ['Call Jan', 'Send invoice'],
    );

    const links = [...dialog().querySelectorAll<HTMLAnchorElement>('a.task-blockers__link')];

    expect(links.map((a) => text(a))).toEqual(['Pay rent']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/tasks/t9']);
    expect(text(dialog().querySelector('p.task-blockers__message'))).toBe('Could not add.');
  });

  it('keeps the status element empty without a message, so its :empty rule takes its room away', async () => {
    const { open, dialog } = await setup();

    await open();

    expect(dialog().querySelector('p.task-blockers__message')?.matches(':empty')).toBe(true);
  });

  it('says so when there are no rows, no candidates and no dependants', async () => {
    const { open, text, dialog } = await setup();

    await open();

    expect(text(dialog())).toContain('Waits for no other Task.');
    expect(text(dialog())).toContain('No Task matches.');
    expect(text(dialog())).toContain('No Task waits for this one.');
  });

  it('shows the Find a Task text from the filter and reports typing as filterChange', async () => {
    const { fixture, open, findInput, update } = await setup({ filter: 'inv' });
    const filterChange = vi.fn<(filter: string) => void>();
    fixture.componentInstance.filter.subscribe(filterChange);

    await open();

    expect(findInput().value).toBe('inv');

    await update('filter', '');

    expect(findInput().value).toBe('');

    findInput().value = 'rent';
    findInput().dispatchEvent(new Event('input', { bubbles: true }));

    expect(filterChange).toHaveBeenLastCalledWith('rent');
    expect(fixture.componentInstance.filter()).toBe('rent');
  });

  it('disables every Remove while busy holds', async () => {
    const { open, removes, update } = await setup({
      blockedBy: [row('l1', 'Water form'), row('l2', 'Old link')],
    });

    await open();

    expect(removes().map((b) => b.disabled)).toEqual([false, false]);

    await update('busy', true);

    expect(removes().map((b) => b.disabled)).toEqual([true, true]);
  });

  it('disables only the Remove of a row that is busy', async () => {
    const { open, removes } = await setup({
      blockedBy: [row('l1', 'Water form', true), row('l2', 'Old link')],
    });

    await open();

    expect(removes().map((b) => b.disabled)).toEqual([true, false]);
  });

  it('disables the candidates while busy or adding, and not otherwise', async () => {
    const { open, candidates, update } = await setup({
      candidates: [taskOf('t2', 'Call Jan'), taskOf('t3', 'Send invoice')],
    });

    await open();

    expect(candidates().map((b) => b.disabled)).toEqual([false, false]);

    await update('busy', true);

    expect(candidates().map((b) => b.disabled)).toEqual([true, true]);

    await update('busy', false);
    await update('adding', true);

    expect(candidates().map((b) => b.disabled)).toEqual([true, true]);

    await update('adding', false);

    expect(candidates().map((b) => b.disabled)).toEqual([false, false]);
  });

  it('emits remove with the link id of the row whose Remove is pressed', async () => {
    const { fixture, open, removes } = await setup({
      blockedBy: [row('l1', 'Water form'), row('l2', 'Old link')],
    });
    const remove = vi.fn<(linkId: string) => void>();
    fixture.componentInstance.remove.subscribe(remove);

    await open();
    must(removes()[1]).click();

    expect(remove).toHaveBeenCalledExactlyOnceWith('l2');
  });

  it('emits add with the id of the candidate that is pressed', async () => {
    const { fixture, open, candidates } = await setup({
      candidates: [taskOf('t2', 'Call Jan'), taskOf('t3', 'Send invoice')],
    });
    const add = vi.fn<(blockerId: string) => void>();
    fixture.componentInstance.add.subscribe(add);

    await open();
    must(candidates()[1]).click();

    expect(add).toHaveBeenCalledExactlyOnceWith('t3');
  });

  it('focusRemove focuses the Remove at the index', async () => {
    const { fixture, open, removes } = await setup({
      blockedBy: [row('l1', 'Water form'), row('l2', 'Old link')],
    });

    await open();
    fixture.componentInstance.focusRemove(1);

    expect(document.activeElement).toBe(removes()[1]);

    fixture.componentInstance.focusRemove(0);

    expect(document.activeElement).toBe(removes()[0]);
  });

  it('focusRemove focuses the last Remove when the index is past the end', async () => {
    const { fixture, open, removes } = await setup({
      blockedBy: [row('l1', 'Water form'), row('l2', 'Old link')],
    });

    await open();
    fixture.componentInstance.focusRemove(5);

    expect(document.activeElement).toBe(removes()[1]);
  });

  it('focusRemove focuses the Find a Task field when no row is left', async () => {
    const { fixture, open, findInput } = await setup();

    await open();
    fixture.componentInstance.focusRemove(0);

    expect(document.activeElement).toBe(findInput());
  });

  it('focusFilter focuses the Find a Task field', async () => {
    const { fixture, open, findInput } = await setup({
      blockedBy: [row('l1', 'Water form')],
    });

    await open();
    fixture.componentInstance.focusFilter();

    expect(document.activeElement).toBe(findInput());
  });

  it('focus methods do nothing while the sheet is closed', async () => {
    const { fixture, host } = await setup({ blockedBy: [row('l1', 'Water form')] });
    const before = document.activeElement;

    expect(() => {
      fixture.componentInstance.focusRemove(0);
      fixture.componentInstance.focusFilter();
    }).not.toThrow();
    expect(document.activeElement).toBe(before);
    expect(host.contains(document.activeElement)).toBe(false);
  });
});
