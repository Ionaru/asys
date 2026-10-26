// SPDX-License-Identifier: EUPL-1.2
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Quadrant } from '@asys/domain';

import { LogProgressForm } from '../../organisms/log-progress-form/log-progress-form';
import { SwipeActions } from '../../organisms/swipe-actions/swipe-actions';
import {
  type NowCard,
  type NowDone,
  type NowRow,
  type NowSwipeDone,
  type NowWaitingRow,
  NowTemplate,
} from './now-template';

const must = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Missing value');
  }

  return value;
};

const card = (overrides: Partial<NowCard> = {}): NowCard => ({
  id: 'c1',
  title: 'Write report',
  reason: 'Important and due soon',
  quadrant: Quadrant.Do,
  overdue: false,
  dueFact: null,
  estimate: '45 min',
  area: 'Work',
  morph: false,
  canLogProgress: true,
  busy: false,
  awaitingSync: false,
  formEstimate: null,
  ...overrides,
});

const row = (id: string, overrides: Partial<NowRow> = {}): NowRow => ({
  id,
  title: `Task ${id}`,
  reason: `Reason ${id}`,
  quadrant: Quadrant.Plan,
  overdue: false,
  estimate: '15 min',
  morph: false,
  canLogProgress: true,
  busy: false,
  formEstimate: null,
  ...overrides,
});

const waitingRow = (id: string): NowWaitingRow => ({
  id,
  title: `Waiting ${id}`,
  reason: `Waits ${id}`,
  estimate: '10 min',
  overdue: false,
  morph: false,
});

const setup = async (overrides: Record<string, unknown> = {}) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(NowTemplate);
  const inputs: Record<string, unknown> = {
    moment: 'Monday morning',
    datetime: '2026-10-26T09:00',
    areaControl: null,
    statusLine: '',
    loaded: true,
    loadFailed: false,
    card: null,
    leaving: false,
    inboxTaskCount: 0,
    rows: [],
    otherAreas: [],
    waiting: [],
    waitingSummary: null,
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
  const items = (): HTMLLIElement[] => [
    ...host.querySelectorAll<HTMLLIElement>('ul.now__list:not(.now__list--waiting) > li'),
  ];
  const button = (root: ParentNode, name: string): HTMLButtonElement => {
    const found = [...root.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    if (found === undefined) throw new Error(`Missing button ${name}`);
    return found;
  };
  const swipes = (): SwipeActions[] =>
    fixture.debugElement.queryAll(By.directive(SwipeActions)).map((d) => d.componentInstance);
  const forms = (): LogProgressForm[] =>
    fixture.debugElement.queryAll(By.directive(LogProgressForm)).map((d) => d.componentInstance);
  return { fixture, host, update, items, button, swipes, forms };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('NowTemplate', () => {
  it('B1 shows the load state while not loaded, and in its failed form its retry emits', async () => {
    const { fixture, host, update, button } = await setup({
      loaded: false,
      card: card(),
      rows: [row('r1')],
    });
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retry.subscribe(retry);

    expect(host.querySelector('asys-load-state')).not.toBeNull();
    expect(host.textContent).toContain('Loading…');
    expect(host.querySelector('asys-top-pick')).toBeNull();
    expect(host.querySelector('ul.now__list')).toBeNull();

    await update('loadFailed', true);

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'ASYS could not load your Tasks.',
    );

    button(host, 'Try again').click();

    expect(retry).toHaveBeenCalledOnce();
  });

  it('B2 says Nothing to do right now without a card, with no Inbox link for no Tasks', async () => {
    const { host } = await setup();

    expect(host.querySelector('p.now__text')?.textContent?.trim()).toBe('Nothing to do right now.');
    expect(host.querySelector('a[href="/inbox"]')).toBeNull();
  });

  it('B2 links the Inbox with the number of Tasks that wait for Triage', async () => {
    const { host, update } = await setup({ inboxTaskCount: 1 });

    expect(host.querySelector('a[href="/inbox"]')?.textContent?.trim()).toBe(
      '1 Task waits for Triage.',
    );

    await update('inboxTaskCount', 3);

    expect(host.querySelector('a[href="/inbox"]')?.textContent?.trim()).toBe(
      '3 Tasks wait for Triage.',
    );
  });

  it('B3 renders the card with title, reason, estimate and Area', async () => {
    const { host } = await setup({ card: card() });
    const top = must(host.querySelector('asys-top-pick'));

    expect(top.querySelector('.asys-top-pick__title')?.textContent).toContain('Write report');
    expect(top.querySelector('.asys-top-pick__reason')?.textContent).toContain(
      'Important and due soon',
    );
    expect(top.textContent).toContain('45 min');
    expect(top.textContent).toContain('Work');
    expect(host.querySelector('p.now__text')).toBeNull();
  });

  it('B3 shows the sync note only while the card awaits sync', async () => {
    const { host, update } = await setup({ card: card({ awaitingSync: true }) });

    expect(host.querySelector('asys-top-pick p[asys-sync-note]')).not.toBeNull();

    await update('card', card({ awaitingSync: false }));

    expect(host.querySelector('p[asys-sync-note]')).toBeNull();
  });

  it('B3 shows the Log progress form only when formEstimate is set', async () => {
    const { host, update } = await setup({ card: card({ formEstimate: 30 }) });

    expect(host.querySelector('asys-top-pick asys-log-progress-form')).not.toBeNull();

    await update('card', card({ formEstimate: null }));

    expect(host.querySelector('asys-log-progress-form')).toBeNull();
  });

  it('B4 marks the top pick inert and leaving only while leaving', async () => {
    const { host, update } = await setup({ card: card(), leaving: true });
    const top = must(host.querySelector('asys-top-pick'));

    expect(top.hasAttribute('inert')).toBe(true);
    expect(top.hasAttribute('data-leaving')).toBe(true);

    await update('leaving', false);

    expect(top.hasAttribute('inert')).toBe(false);
    expect(top.hasAttribute('data-leaving')).toBe(false);
  });

  it('B5 emits done with the card id and keyboard false for a pointer click', async () => {
    const { fixture, host } = await setup({ card: card() });
    const done = vi.fn<(event: NowDone) => void>();
    fixture.componentInstance.done.subscribe(done);

    host
      .querySelector('asys-top-pick .asys-top-pick__main-action')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    expect(done).toHaveBeenCalledExactlyOnceWith({ taskId: 'c1', keyboard: false });
  });

  it('B5 emits logProgress with the card id from the Log progress button', async () => {
    const { fixture, host } = await setup({ card: card() });
    const logProgress = vi.fn<(id: string) => void>();
    fixture.componentInstance.logProgress.subscribe(logProgress);

    must(host.querySelector<HTMLButtonElement>('.asys-top-pick__log-progress')).click();

    expect(logProgress).toHaveBeenCalledExactlyOnceWith('c1');
  });

  it('B6 renders rows in input order as links to their Task inside ul.now__list', async () => {
    const { items } = await setup({ rows: [row('r1'), row('r2'), row('r3')] });

    expect(items()).toHaveLength(3);
    const links = items().map((li) => li.querySelector('a'));
    expect(links.map((a) => a?.textContent?.trim())).toEqual([
      expect.stringMatching(/^Task r1\b/),
      expect.stringMatching(/^Task r2\b/),
      expect.stringMatching(/^Task r3\b/),
    ]);
    expect(links.map((a) => a?.getAttribute('href'))).toEqual([
      '/tasks/r1',
      '/tasks/r2',
      '/tasks/r3',
    ]);
  });

  it('B7 emits swipeDone from a row with hadFocus true when focus is inside its li', async () => {
    const { fixture, items, swipes } = await setup({ rows: [row('r1'), row('r2')] });
    const swipeDone = vi.fn<(event: NowSwipeDone) => void>();
    fixture.componentInstance.swipeDone.subscribe(swipeDone);
    must(must(items()[1]).querySelector('a')).focus();

    must(swipes()[0]).commitEnd.emit('r1');
    must(swipes()[1]).commitEnd.emit('r2');

    expect(swipeDone).toHaveBeenNthCalledWith(1, { taskId: 'r1', hadFocus: false });
    expect(swipeDone).toHaveBeenNthCalledWith(2, { taskId: 'r2', hadFocus: true });
  });

  it('B7 emits hadFocus false when the focused row li is leaving', async () => {
    const { fixture, items, swipes } = await setup({ rows: [row('r1')] });
    const swipeDone = vi.fn<(event: NowSwipeDone) => void>();
    fixture.componentInstance.swipeDone.subscribe(swipeDone);
    must(must(items()[0]).querySelector('a')).focus();
    must(items()[0]).setAttribute('data-leaving', '');

    must(swipes()[0]).commitEnd.emit('r1');

    expect(swipeDone).toHaveBeenCalledExactlyOnceWith({ taskId: 'r1', hadFocus: false });
  });

  it('B7 emits hadFocus false on the card, and logProgress from commitStart', async () => {
    const { fixture, swipes, host } = await setup({ card: card() });
    const swipeDone = vi.fn<(event: NowSwipeDone) => void>();
    const logProgress = vi.fn<(id: string) => void>();
    fixture.componentInstance.swipeDone.subscribe(swipeDone);
    fixture.componentInstance.logProgress.subscribe(logProgress);
    must(host.querySelector<HTMLElement>('.asys-top-pick__link')).focus();

    must(swipes()[0]).commitEnd.emit('c1');
    must(swipes()[0]).commitStart.emit('c1');

    expect(swipeDone).toHaveBeenCalledExactlyOnceWith({ taskId: 'c1', hadFocus: false });
    expect(logProgress).toHaveBeenCalledExactlyOnceWith('c1');
  });

  it('B7 emits logProgress from a row commitStart', async () => {
    const { fixture, swipes } = await setup({ rows: [row('r1')] });
    const logProgress = vi.fn<(id: string) => void>();
    fixture.componentInstance.logProgress.subscribe(logProgress);

    must(swipes()[0]).commitStart.emit('r1');

    expect(logProgress).toHaveBeenCalledExactlyOnceWith('r1');
  });

  it('B8 maps the row form save, cancel and focus events to outputs', async () => {
    const { fixture, items, forms } = await setup({ rows: [row('r1', { formEstimate: 30 })] });
    const saveProgress = vi.fn<(minutes: number) => void>();
    const cancelForm = vi.fn<() => void>();
    const formFocus = vi.fn<(inside: boolean) => void>();
    fixture.componentInstance.saveProgress.subscribe(saveProgress);
    fixture.componentInstance.cancelForm.subscribe(cancelForm);
    fixture.componentInstance.formFocus.subscribe(formFocus);
    const form = must(must(items()[0]).querySelector('asys-log-progress-form'));

    expect(forms()).toHaveLength(1);

    must(forms()[0]).save.emit(12);
    must(forms()[0]).cancel.emit();
    form.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    form.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(12);
    expect(cancelForm).toHaveBeenCalledOnce();
    expect(formFocus).toHaveBeenNthCalledWith(1, true);
    expect(formFocus).toHaveBeenNthCalledWith(2, false);
  });

  it('B8 maps the card form save, cancel and focus events to outputs', async () => {
    const { fixture, host, forms } = await setup({ card: card({ formEstimate: 30 }) });
    const saveProgress = vi.fn<(minutes: number) => void>();
    const cancelForm = vi.fn<() => void>();
    const formFocus = vi.fn<(inside: boolean) => void>();
    fixture.componentInstance.saveProgress.subscribe(saveProgress);
    fixture.componentInstance.cancelForm.subscribe(cancelForm);
    fixture.componentInstance.formFocus.subscribe(formFocus);
    const form = must(host.querySelector('asys-top-pick asys-log-progress-form'));

    must(forms()[0]).save.emit(20);
    must(forms()[0]).cancel.emit();
    form.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    form.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));

    expect(saveProgress).toHaveBeenCalledExactlyOnceWith(20);
    expect(cancelForm).toHaveBeenCalledOnce();
    expect(formFocus.mock.calls).toEqual([[true], [false]]);
  });

  it('B9 lists Other Areas in order and emits the clicked areaId', async () => {
    const { fixture, host, update } = await setup({
      otherAreas: [
        { areaId: 'a1', text: 'Home (2)' },
        { areaId: 'a2', text: 'Garden (1)' },
      ],
    });
    const picked = vi.fn<(id: string) => void>();
    fixture.componentInstance.otherAreaPicked.subscribe(picked);
    const group = must(host.querySelector('[role="group"][aria-label="Other Areas"]'));
    const buttons = [...group.querySelectorAll('button')];

    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Home (2)', 'Garden (1)']);

    must(buttons[1]).click();

    expect(picked).toHaveBeenCalledExactlyOnceWith('a2');

    await update('otherAreas', []);

    expect(host.querySelector('[role="group"][aria-label="Other Areas"]')).toBeNull();
  });

  it('B10 renders no section header for an empty Waiting list', async () => {
    const { host } = await setup({ waiting: [] });

    expect(host.querySelector('section.asys-collapsible-section')).toBeNull();
  });

  it('B10 shows the Waiting count and summary, rows only when expanded, and toggles the model', async () => {
    const { fixture, host, update } = await setup({
      waiting: [waitingRow('w1'), waitingRow('w2')],
      waitingSummary: 'Next: tomorrow',
    });
    const header = must(host.querySelector('section.asys-collapsible-section'));

    expect(header.querySelector('.asys-section-header__count')?.textContent?.trim()).toBe('2');
    expect(header.querySelector('.asys-section-header__summary')?.textContent?.trim()).toBe(
      'Next: tomorrow',
    );
    expect(host.querySelectorAll('ul.now__list--waiting > li')).toHaveLength(0);
    expect(fixture.componentInstance.waitingExpanded()).toBe(false);

    must(header.querySelector<HTMLButtonElement>('button.asys-section-header')).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.waitingExpanded()).toBe(true);
    const links = [...host.querySelectorAll('ul.now__list--waiting > li a')];
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      expect.stringMatching(/^Waiting w1\b/),
      expect.stringMatching(/^Waiting w2\b/),
    ]);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/tasks/w1', '/tasks/w2']);

    fixture.componentInstance.waitingExpanded.set(false);
    await fixture.whenStable();

    expect(host.querySelectorAll('ul.now__list--waiting > li')).toHaveLength(0);

    await update('waiting', []);

    expect(host.querySelector('section.asys-collapsible-section')).toBeNull();
  });

  it('B11 shows the Area control only when areaControl is set, and picking emits areaPicked', async () => {
    const { fixture, host, update } = await setup();
    const picked = vi.fn<(id: string | null) => void>();
    fixture.componentInstance.areaPicked.subscribe(picked);

    expect(host.querySelector('asys-area-pick')).toBeNull();

    await update('areaControl', {
      label: 'Work',
      pickedId: null,
      automaticLabel: 'Automatic: Work',
      areas: [
        { id: 'a1', name: 'Work' },
        { id: 'a2', name: 'Home' },
      ],
    });
    const pick = must(host.querySelector('asys-area-pick'));
    const select = must(pick.querySelector('select'));

    expect(pick.textContent).toContain('Work');

    select.value = 'a2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(picked.mock.calls).toEqual([['a2'], [null]]);
  });

  it('B11 links More to Settings', async () => {
    const { host } = await setup();
    const more = host.querySelector('a[aria-label="More: Settings"]');

    expect(more?.getAttribute('href')).toBe('/settings');
  });

  it('B12 focusTop focuses the card title link, else the header heading', async () => {
    const { fixture, host, update } = await setup({ card: card() });

    fixture.componentInstance.focusTop();

    expect(document.activeElement).toBe(host.querySelector('.asys-top-pick__link'));

    await update('card', null);
    fixture.componentInstance.focusTop();

    expect(document.activeElement).toBe(host.querySelector('asys-screen-header h1'));
  });

  it('B12 focusLogProgress focuses the card Log progress button, and does nothing without a card', async () => {
    const { fixture, host, update } = await setup({ card: card() });

    fixture.componentInstance.focusLogProgress();

    expect(document.activeElement).toBe(host.querySelector('.asys-top-pick__log-progress'));

    (document.activeElement as HTMLElement).blur();
    await update('card', null);
    fixture.componentInstance.focusLogProgress();

    expect(document.activeElement).toBe(document.body);
  });

  it('B12 focusAreaPick focuses the Area control, and does nothing without one', async () => {
    const { fixture, host, update } = await setup({
      areaControl: { label: 'Work', pickedId: null, automaticLabel: 'Automatic', areas: [] },
    });

    fixture.componentInstance.focusAreaPick();

    expect(document.activeElement).toBe(host.querySelector('asys-area-pick select'));

    (document.activeElement as HTMLElement).blur();
    await update('areaControl', null);
    fixture.componentInstance.focusAreaPick();

    expect(document.activeElement).toBe(document.body);
  });

  it('B13 focusTask focuses the row link and returns true', async () => {
    const { fixture, items } = await setup({ rows: [row('r1'), row('r2')] });

    expect(fixture.componentInstance.focusTask('r2')).toBe(true);
    expect(document.activeElement).toBe(must(items()[1]).querySelector('a'));
  });

  it('B13 focusTask returns false for an unknown id and leaves focus alone', async () => {
    const { fixture, items } = await setup({ rows: [row('r1')] });
    must(must(items()[0]).querySelector('a')).focus();
    const before = document.activeElement;

    expect(fixture.componentInstance.focusTask('nope')).toBe(false);
    expect(document.activeElement).toBe(before);
  });

  it('B13 focusTask returns false for a row whose li is leaving', async () => {
    const { fixture, items } = await setup({ rows: [row('r1')] });
    must(items()[0]).setAttribute('data-leaving', '');

    expect(fixture.componentInstance.focusTask('r1')).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('B14 cardElement returns the .asys-top-pick element, or null without a card', async () => {
    const { fixture, host, update } = await setup({ card: card() });

    expect(fixture.componentInstance.cardElement()).toBe(
      host.querySelector('asys-top-pick .asys-top-pick'),
    );
    expect(fixture.componentInstance.cardElement()).not.toBeNull();

    await update('card', null);

    expect(fixture.componentInstance.cardElement()).toBeNull();
  });

  it('B15 shows the status line and the moment with its datetime', async () => {
    const { host, update } = await setup({ statusLine: '3 Tasks available' });
    const time = must(host.querySelector('asys-screen-header time'));

    expect(host.querySelector('p[role="status"]')?.textContent?.trim()).toBe('3 Tasks available');
    expect(time.textContent?.trim()).toBe('Monday morning');
    expect(time.getAttribute('datetime')).toBe('2026-10-26T09:00');

    await update('statusLine', '');

    expect(host.querySelector('p[role="status"]')?.textContent?.trim()).toBe('');
  });
});
