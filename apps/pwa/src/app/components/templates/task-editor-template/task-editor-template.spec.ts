// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { type DateSpec, type TaskExplanation, TaskExplanationTag } from '@asys/domain';

import { TaskBlockers } from '../../organisms/task-blockers/task-blockers';
import { TaskEditorTemplate } from './task-editor-template';

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

interface Draft {
  important: boolean | null;
  estimateMinutes: number | null;
  areaId: string;
  availableFrom: DateSpec | null;
  due: DateSpec | null;
}

const DRAFT: Draft = {
  important: true,
  estimateMinutes: 30,
  areaId: '',
  availableFrom: null,
  due: null,
};

const INBOX: TaskExplanation = { _tag: TaskExplanationTag.Inbox };

const setup = async (overrides: Record<string, unknown> = {}) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(TaskEditorTemplate);
  const editForm = TestBed.runInInjectionContext(() => form(signal<Draft>({ ...DRAFT })));
  const inputs: Record<string, unknown> = {
    taskId: 't1',
    morph: false,
    heading: 'Call Marit',
    statusText: '',
    saved: false,
    saveFailed: false,
    loaded: true,
    loadFailed: false,
    found: true,
    taskOpen: true,
    readOnly: false,
    leaving: false,
    dirty: false,
    awaiting: false,
    title: 'Call Marit',
    notes: '',
    needsTitle: false,
    notesShown: false,
    capturedText: null,
    importantField: editForm.important,
    estimateField: editForm.estimateMinutes,
    areaField: editForm.areaId,
    availableFromField: editForm.availableFrom,
    dueField: editForm.due,
    areas: [],
    today: '2026-10-04',
    explanation: null,
    overdue: false,
    blocked: false,
    doneBlocked: false,
    actionBlocked: false,
    canLogProgress: false,
    logOpen: false,
    logMessage: '',
    logEstimate: null,
    moreOpen: false,
    confirmingDrop: false,
    dropMessage: '',
    dropTitle: 'Call Marit',
    blockersBusy: false,
    blockerSummary: 'Waits for no other Task. No Task waits for this one.',
    blockedBy: [],
    blocks: [],
    blockerCandidates: [],
    blockerMessage: '',
    blockerAdding: false,
    blockerFilter: '',
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
  const buttonIn = (scope: ParentNode, name: string): HTMLButtonElement | undefined =>
    [...scope.querySelectorAll('button')].find((b) => text(b) === name);
  const button = (scope: ParentNode, name: string): HTMLButtonElement =>
    must(buttonIn(scope, name), `button ${name}`);
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };
  const sheet = (heading: string): HTMLDialogElement =>
    must(
      [...host.querySelectorAll<HTMLDialogElement>('dialog.asys-sheet')].find(
        (d) => text(d.querySelector('h2.asys-sheet__heading')) === heading,
      ),
      `the ${heading} sheet`,
    );
  const bar = (): HTMLElement => must(host.querySelector('header.task-editor__bar'));
  const footer = (): HTMLElement | null => host.querySelector('footer.task-editor__actions');
  const heading = (): HTMLElement => must(host.querySelector('h1'));
  const card = (): HTMLElement | null => host.querySelector('section.task-editor__card');
  const titleField = (): HTMLTextAreaElement =>
    must(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Title"]'));
  const notesField = (): HTMLTextAreaElement | null =>
    host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Notes"]');
  const typeInto = (el: HTMLTextAreaElement, value: string): void => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const blockers = (): HTMLElement => must(host.querySelector('asys-task-blockers'));

  return {
    fixture,
    host,
    update,
    text,
    buttonIn,
    button,
    press,
    sheet,
    bar,
    footer,
    heading,
    card,
    titleField,
    notesField,
    typeInto,
    blockers,
  };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('TaskEditorTemplate', () => {
  it('T1 shows the load state while not loaded, and in its failed form its retry emits', async () => {
    const { fixture, host, update, button, card } = await setup({ loaded: false, found: false });
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retry.subscribe(retry);

    expect(host.querySelector('asys-load-state')).not.toBeNull();
    expect(host.textContent).toContain('Loading…');
    expect(card()).toBeNull();

    await update('loadFailed', true);

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'ASYS could not load your Tasks.',
    );

    button(host, 'Try again').click();

    expect(retry).toHaveBeenCalledOnce();
  });

  it('T2 shows the card, the blockers section and, for an open Task, the footer with Mark Done', async () => {
    const { host, card, footer, buttonIn, update } = await setup();

    expect(host.querySelector('asys-load-state')).toBeNull();
    expect(card()).not.toBeNull();
    expect(host.querySelector('asys-task-blockers')).not.toBeNull();
    expect(footer()).not.toBeNull();
    expect(buttonIn(must(footer()), 'Mark Done')).toBeDefined();
    expect(host.querySelector('button[aria-label="More actions"]')).not.toBeNull();

    await update('taskOpen', false);

    expect(card()).not.toBeNull();
    expect(host.querySelector('asys-task-blockers')).not.toBeNull();
    expect(footer()).toBeNull();
    expect(host.querySelector('button[aria-label="More actions"]')).toBeNull();
  });

  it('T3 says the Task is no longer open and links to Now, with the card only while dirty', async () => {
    const { host, text, card, update } = await setup({ found: false });
    const link = must(
      [...host.querySelectorAll('a')].find((a) => text(a) === 'Go to Now'),
      'link',
    );

    expect(text()).toContain('This Task is no longer open.');
    expect(link.getAttribute('href')).toBe('/now');
    expect(card()).toBeNull();
    expect(host.querySelector('asys-task-blockers')).toBeNull();
    expect(host.querySelector('footer.task-editor__actions')).toBeNull();

    await update('dirty', true);

    expect(card()).not.toBeNull();
    expect(text()).toContain('This Task is no longer open.');

    await update('leaving', true);

    expect(text()).not.toContain('This Task is no longer open.');
    expect([...host.querySelectorAll('a')].find((a) => text(a) === 'Go to Now')).toBeUndefined();
    expect(card()).toBeNull();
  });

  it('T4 reports Mark Done as a pointer activation, and Back and More actions', async () => {
    const { fixture, host, button, footer, press } = await setup();
    const done = vi.fn<(keyboard: boolean) => void>();
    const back = vi.fn<() => void>();
    const more = vi.fn<() => void>();
    fixture.componentInstance.done.subscribe(done);
    fixture.componentInstance.back.subscribe(back);
    fixture.componentInstance.more.subscribe(more);

    await press(button(must(footer()), 'Mark Done'));

    expect(done).toHaveBeenCalledExactlyOnceWith(false);

    button(must(footer()), 'Mark Done').click();

    expect(done).toHaveBeenLastCalledWith(true);

    must(host.querySelector<HTMLButtonElement>('button[aria-label="Back"]')).click();

    expect(back).toHaveBeenCalledOnce();

    must(host.querySelector<HTMLButtonElement>('button[aria-label="More actions"]')).click();

    expect(more).toHaveBeenCalledOnce();
  });

  it('T4 hides More actions while read-only', async () => {
    const { host, update } = await setup();

    expect(host.querySelector('button[aria-label="More actions"]')).not.toBeNull();

    await update('readOnly', true);

    expect(host.querySelector('button[aria-label="More actions"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Back"]')).not.toBeNull();
  });

  it('T5 shows Try again when the save failed, and it emits retrySave', async () => {
    const { fixture, host, update, buttonIn } = await setup();
    const retrySave = vi.fn<() => void>();
    fixture.componentInstance.retrySave.subscribe(retrySave);

    expect(buttonIn(host, 'Try again')).toBeUndefined();

    await update('saveFailed', true);
    must(buttonIn(host, 'Try again')).click();

    expect(retrySave).toHaveBeenCalledOnce();
  });

  it('T5 shows Saved in the top bar while saved', async () => {
    const { host, update, text } = await setup();
    const saved = (): HTMLElement => must(host.querySelector('.task-editor__saved'));

    expect(text(saved())).toBe('');

    await update('saved', true);

    expect(text(saved())).toBe('Saved');
  });

  it('shows the heading, then the status text', async () => {
    const { host, update, heading } = await setup({ heading: 'Call Marit' });

    expect(heading().textContent?.trim()).toBe('Call Marit');
    expect(host.querySelector('p.task-editor__status')?.textContent?.trim()).toBe('');

    await update('statusText', 'Saved.');

    expect(host.querySelector('p.task-editor__status')?.textContent?.trim()).toBe('Saved.');
  });

  it('shows the sync note while the Task awaits the server', async () => {
    const { host, update } = await setup();

    expect(host.querySelector('p[asys-sync-note]')).toBeNull();

    await update('awaiting', true);

    expect(host.querySelector('p[asys-sync-note]')).not.toBeNull();
  });

  it('T6 shows the title, reports typing as titleChange and a change as commit', async () => {
    const { fixture, titleField, typeInto } = await setup({ title: 'Call Marit' });
    const titleChange = vi.fn<(title: string) => void>();
    const commit = vi.fn<() => void>();
    fixture.componentInstance.titleChange.subscribe(titleChange);
    fixture.componentInstance.commit.subscribe(commit);

    expect(titleField().value).toBe('Call Marit');
    expect(titleField().getAttribute('data-task-id')).toBe('t1');

    typeInto(titleField(), 'Call Marit back');

    expect(titleChange).toHaveBeenCalledExactlyOnceWith('Call Marit back');
    expect(commit).not.toHaveBeenCalled();

    titleField().dispatchEvent(new Event('change', { bubbles: true }));

    expect(commit).toHaveBeenCalledOnce();
  });

  it('T6 flags a missing title and points the title at the message', async () => {
    const { host, titleField, update } = await setup();

    expect(host.querySelector('[asys-field-error]')).toBeNull();
    expect(titleField().getAttribute('aria-describedby')).toBeNull();

    await update('needsTitle', true);

    const error = must(host.querySelector('[asys-field-error]'));

    expect(error.textContent?.trim()).toBe('Error: Needs a title');
    expect(error.id).not.toBe('');
    expect(titleField().getAttribute('aria-describedby')).toBe(error.id);
    expect(titleField().getAttribute('aria-invalid')).toBe('true');
  });

  it('T6 disables the title while read-only', async () => {
    const { titleField } = await setup({ readOnly: true });

    expect(titleField().disabled).toBe(true);
  });

  it('T7 offers Add notes, which emits addNotes, until the notes are shown', async () => {
    const { fixture, button, card, notesField, update } = await setup({ notesShown: false });
    const addNotes = vi.fn<() => void>();
    fixture.componentInstance.addNotes.subscribe(addNotes);

    expect(notesField()).toBeNull();

    button(must(card()), 'Add notes').click();

    expect(addNotes).toHaveBeenCalledOnce();

    await update('notesShown', true);

    expect(notesField()).not.toBeNull();
    expect(
      [...must(card()).querySelectorAll('button')].some(
        (b) => b.textContent?.trim() === 'Add notes',
      ),
    ).toBe(false);
  });

  it('T7 shows the notes, reports typing as notesChange and a change as commit', async () => {
    const { fixture, notesField, typeInto } = await setup({ notesShown: true, notes: 'Ask Marit' });
    const notesChange = vi.fn<(notes: string) => void>();
    const commit = vi.fn<() => void>();
    fixture.componentInstance.notesChange.subscribe(notesChange);
    fixture.componentInstance.commit.subscribe(commit);

    expect(must(notesField()).value).toBe('Ask Marit');

    typeInto(must(notesField()), 'Ask Marit about Friday');

    expect(notesChange).toHaveBeenCalledExactlyOnceWith('Ask Marit about Friday');
    expect(commit).not.toHaveBeenCalled();

    must(notesField()).dispatchEvent(new Event('change', { bubbles: true }));

    expect(commit).toHaveBeenCalledOnce();
  });

  it('T8 shows the captured text only when there is some', async () => {
    const { host, text, update } = await setup({ capturedText: 'raw' });
    const captured = (): HTMLElement | null => host.querySelector('.task-editor__captured');

    expect(text(captured())).toContain('Captured text');
    expect(text(host.querySelector('.task-editor__captured-text'))).toBe('raw');

    await update('capturedText', null);

    expect(captured()).toBeNull();
    expect(text()).not.toContain('Captured text');
  });

  it('T9 explains an Inbox Task as waiting for Triage', async () => {
    const { host, text } = await setup({ explanation: INBOX });

    expect(text(host.querySelector('.task-editor__reason'))).toContain('In the Inbox until Triage');
  });

  it('T9 shows the Overdue and Blocked badges only when they apply', async () => {
    const { host, text, update } = await setup({ explanation: INBOX });
    const badges = (): string[] =>
      [...host.querySelectorAll('.task-editor__reason asys-status-badge')].map((b) => text(b));

    expect(badges()).toEqual([]);

    await update('overdue', true);

    expect(badges()).toEqual(['Overdue']);

    await update('blocked', true);

    expect(badges()).toEqual(['Overdue', 'Blocked']);

    await update('overdue', false);

    expect(badges()).toEqual(['Blocked']);
  });

  it('T9 shows the badges alone when there is no reason to give but the Task is overdue or blocked', async () => {
    const { host, text } = await setup({
      explanation: { _tag: TaskExplanationTag.NotOpen },
      overdue: true,
      blocked: true,
    });

    expect(
      [...host.querySelectorAll('.task-editor__reason asys-status-badge')].map((b) => text(b)),
    ).toEqual(['Overdue', 'Blocked']);
    expect(host.querySelector('.task-editor__reason-text')).toBeNull();
  });

  it('T10 offers Log progress, and pressing it reports logOpen as true', async () => {
    const { fixture, button, footer, update, buttonIn } = await setup();
    const logOpenChange = vi.fn<(open: boolean) => void>();
    fixture.componentInstance.logOpen.subscribe(logOpenChange);

    expect(buttonIn(must(footer()), 'Log progress')).toBeUndefined();

    await update('canLogProgress', true);
    button(must(footer()), 'Log progress').click();
    await fixture.whenStable();

    expect(logOpenChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(fixture.componentInstance.logOpen()).toBe(true);
  });

  it('T10 reports the minutes the Log progress form saves, and its Cancel as cancelLog', async () => {
    const { fixture, sheet, button, typeInto } = await setup({
      canLogProgress: true,
      logOpen: true,
      logEstimate: 30,
      logMessage: 'Could not log.',
    });
    const logProgress = vi.fn<(minutes: number) => void>();
    const logOpenChange = vi.fn<(open: boolean) => void>();
    const cancelLog = vi.fn<() => void>();
    fixture.componentInstance.logProgress.subscribe(logProgress);
    fixture.componentInstance.logOpen.subscribe(logOpenChange);
    fixture.componentInstance.cancelLog.subscribe(cancelLog);
    const dialog = sheet('Log progress');

    expect(dialog.textContent).toContain('Could not log.');
    expect(dialog.querySelector('asys-log-progress-form')).not.toBeNull();

    typeInto(
      must(dialog.querySelector<HTMLTextAreaElement>('asys-log-progress-form textarea')),
      '10',
    );
    button(dialog, 'Save').click();

    expect(logProgress).toHaveBeenCalledExactlyOnceWith(10);

    button(dialog, 'Cancel').click();
    await fixture.whenStable();

    // The page closes the sheet; a model change here would also move focus as for a person's close.
    expect(cancelLog).toHaveBeenCalledOnce();
    expect(logOpenChange).not.toHaveBeenCalled();
  });

  it('T10 shows no Log progress form without an Estimate to lower', async () => {
    const { sheet } = await setup({ logOpen: true, logEstimate: null });

    expect(sheet('Log progress').querySelector('asys-log-progress-form')).toBeNull();
  });

  it('T10 disables Log progress while the action is blocked, and Mark Done while Done is', async () => {
    const { footer, button, update } = await setup({ canLogProgress: true });

    expect(button(must(footer()), 'Log progress').disabled).toBe(false);
    expect(button(must(footer()), 'Mark Done').disabled).toBe(false);

    await update('actionBlocked', true);

    expect(button(must(footer()), 'Log progress').disabled).toBe(true);
    expect(button(must(footer()), 'Mark Done').disabled).toBe(false);

    await update('actionBlocked', false);
    await update('doneBlocked', true);

    expect(button(must(footer()), 'Mark Done').disabled).toBe(true);
    expect(button(must(footer()), 'Log progress').disabled).toBe(false);
  });

  it('T11 offers Drop in the More sheet, and pressing it reports confirmingDrop as true', async () => {
    const { fixture, sheet, button } = await setup({ moreOpen: true, dropMessage: 'Not dropped.' });
    const confirmingDropChange = vi.fn<(confirming: boolean) => void>();
    fixture.componentInstance.confirmingDrop.subscribe(confirmingDropChange);
    const dialog = sheet('More');

    expect(dialog.textContent).toContain('Not dropped.');

    button(dialog, 'Drop').click();
    await fixture.whenStable();

    expect(confirmingDropChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(fixture.componentInstance.confirmingDrop()).toBe(true);
  });

  it('T11 asks to confirm the Drop by the Task title, and reports confirm and cancel', async () => {
    const { fixture, sheet, button } = await setup({
      moreOpen: true,
      confirmingDrop: true,
      dropTitle: 'Water form',
    });
    const drop = vi.fn<() => void>();
    const cancelDrop = vi.fn<() => void>();
    fixture.componentInstance.dropTask.subscribe(drop);
    fixture.componentInstance.cancelDrop.subscribe(cancelDrop);
    const confirm = must(sheet('More').querySelector<HTMLElement>('asys-inline-confirm'));

    expect(confirm.querySelector('.asys-confirm__message')?.textContent?.trim()).toBe(
      'Drop “Water form”? This cannot be undone.',
    );

    button(confirm, 'Drop').click();

    expect(drop).toHaveBeenCalledOnce();
    expect(cancelDrop).not.toHaveBeenCalled();

    button(confirm, 'Cancel').click();

    expect(cancelDrop).toHaveBeenCalledOnce();
  });

  it('T11 disables the confirming Drop while the action is blocked', async () => {
    const { sheet, button } = await setup({
      moreOpen: true,
      confirmingDrop: true,
      actionBlocked: true,
    });

    expect(button(must(sheet('More').querySelector('asys-inline-confirm')), 'Drop').disabled).toBe(
      true,
    );
  });

  it('T12 focuses the heading', async () => {
    const { heading, fixture } = await setup();

    fixture.componentInstance.focusHeading();

    expect(document.activeElement).toBe(heading());
  });

  it('T12 focuses Log progress, or the heading when it is not rendered', async () => {
    const { fixture, footer, button, heading, update } = await setup({ canLogProgress: true });

    fixture.componentInstance.focusLogButton();

    expect(document.activeElement).toBe(button(must(footer()), 'Log progress'));

    await update('canLogProgress', false);
    button(must(footer()), 'Mark Done').focus();
    fixture.componentInstance.focusLogButton();

    expect(document.activeElement).toBe(heading());
  });

  it('T12 focuses More actions, or the heading when it is not rendered', async () => {
    const { fixture, host, heading, update } = await setup();

    fixture.componentInstance.focusMoreButton();

    expect(document.activeElement).toBe(host.querySelector('button[aria-label="More actions"]'));

    await update('readOnly', true);
    fixture.componentInstance.focusMoreButton();

    expect(document.activeElement).toBe(heading());
  });

  it('T12 focuses the notes, or the heading when they are not shown', async () => {
    const { fixture, heading, notesField, update } = await setup({ notesShown: true });

    fixture.componentInstance.focusNotes();

    expect(document.activeElement).toBe(notesField());

    await update('notesShown', false);
    fixture.componentInstance.focusNotes();

    expect(document.activeElement).toBe(heading());
  });

  it('T12 focuses Drop in the More sheet, or the heading when it is not rendered', async () => {
    const { fixture, sheet, button, heading, update } = await setup({ moreOpen: true });

    fixture.componentInstance.focusDropButton();

    expect(document.activeElement).toBe(button(sheet('More'), 'Drop'));

    await update('confirmingDrop', true);
    fixture.componentInstance.focusDropButton();

    expect(document.activeElement).toBe(heading());
  });

  it('T13 exposes the top bar and the footer as elements for the page to measure', async () => {
    const { fixture, bar, footer, update } = await setup();

    expect(fixture.componentInstance.barElement()).toBe(bar());
    expect(fixture.componentInstance.barElement()?.classList.contains('task-editor__bar')).toBe(
      true,
    );
    expect(fixture.componentInstance.footerElement()).toBe(footer());
    expect(fixture.componentInstance.footerElement()).not.toBeNull();

    await update('taskOpen', false);

    expect(fixture.componentInstance.footerElement()).toBeUndefined();
    expect(fixture.componentInstance.barElement()).toBe(bar());
  });

  it('T14 passes the blocker inputs to the blockers section', async () => {
    const { blockers, text, sheet, update, press } = await setup({
      blockerSummary: 'Waits for Water form. No Task waits for this one.',
      blockedBy: [{ linkId: 'l1', title: 'Water form', busy: false }],
      blocks: [{ id: 't9', title: 'Send invoice' }],
      blockerCandidates: [{ id: 't2', title: 'Call Jan' }],
      blockerMessage: 'Not added.',
    });

    expect(text(blockers())).toContain('Waits for Water form. No Task waits for this one.');

    await press(must(blockers().querySelector<HTMLButtonElement>('button.asys-section-header')));

    const dialog = sheet('Blocked by');

    expect(text(dialog.querySelector('.task-blockers__row'))).toContain('Water form');
    expect(text(dialog)).toContain('Call Jan');
    expect(text(dialog)).toContain('Send invoice');
    expect(text(dialog.querySelector('p.task-blockers__message'))).toBe('Not added.');

    const removeButton = must(dialog.querySelector<HTMLButtonElement>('.task-blockers__remove'));
    const candidate = must(dialog.querySelector<HTMLButtonElement>('.task-blockers__candidate'));

    expect(removeButton.disabled).toBe(false);
    expect(candidate.disabled).toBe(false);

    await update('blockersBusy', true);

    expect(removeButton.disabled).toBe(true);
    expect(candidate.disabled).toBe(true);

    await update('blockersBusy', false);
    await update('blockerAdding', true);

    expect(removeButton.disabled).toBe(false);
    expect(candidate.disabled).toBe(true);
  });

  it('T14 re-emits the section Remove and add as removeBlocker and addBlocker', async () => {
    const { fixture, blockers, sheet, press } = await setup({
      blockedBy: [{ linkId: 'l1', title: 'Water form', busy: false }],
      blockerCandidates: [{ id: 't2', title: 'Call Jan' }],
    });
    const removeBlocker = vi.fn<(linkId: string) => void>();
    const addBlocker = vi.fn<(blockerId: string) => void>();
    fixture.componentInstance.removeBlocker.subscribe(removeBlocker);
    fixture.componentInstance.addBlocker.subscribe(addBlocker);

    await press(must(blockers().querySelector<HTMLButtonElement>('button.asys-section-header')));

    const dialog = sheet('Blocked by');

    must(dialog.querySelector<HTMLButtonElement>('.task-blockers__remove')).click();

    expect(removeBlocker).toHaveBeenCalledExactlyOnceWith('l1');
    expect(addBlocker).not.toHaveBeenCalled();

    must(dialog.querySelector<HTMLButtonElement>('.task-blockers__candidate')).click();

    expect(addBlocker).toHaveBeenCalledExactlyOnceWith('t2');
  });

  it('T14 reports the text typed in Find a Task as blockerFilterChange', async () => {
    const { fixture, blockers, sheet, press, typeInto } = await setup();
    const blockerFilterChange = vi.fn<(filter: string) => void>();
    fixture.componentInstance.blockerFilter.subscribe(blockerFilterChange);

    await press(must(blockers().querySelector<HTMLButtonElement>('button.asys-section-header')));
    typeInto(
      must(sheet('Blocked by').querySelector<HTMLTextAreaElement>('asys-text-field textarea')),
      'inv',
    );

    expect(blockerFilterChange).toHaveBeenCalledExactlyOnceWith('inv');
  });

  it('T14 focuses the blocker controls through the section, and does nothing without one', async () => {
    const { fixture, blockers, sheet, press, update } = await setup({
      blockedBy: [
        { linkId: 'l1', title: 'Water form', busy: false },
        { linkId: 'l2', title: 'Call Jan', busy: false },
      ],
    });

    await press(must(blockers().querySelector<HTMLButtonElement>('button.asys-section-header')));

    const removes = [
      ...sheet('Blocked by').querySelectorAll<HTMLButtonElement>('.task-blockers__remove'),
    ];

    fixture.componentInstance.focusBlockerRemove(1);

    expect(document.activeElement).toBe(removes[1]);

    fixture.componentInstance.focusBlockerFilter();

    expect(document.activeElement).toBe(
      sheet('Blocked by').querySelector('asys-text-field textarea'),
    );

    await update('found', false);

    expect(() => {
      fixture.componentInstance.focusBlockerRemove(0);
      fixture.componentInstance.focusBlockerFilter();
    }).not.toThrow();
    expect(fixture.debugElement.query(By.directive(TaskBlockers))).toBeNull();
  });
});
