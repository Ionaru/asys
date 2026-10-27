// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Quadrant } from '@asys/domain';

import type { TriageDraft, TriageReason } from '../../organisms/triage-card/triage-card';
import { type InboxCard, type InboxReview, InboxTemplate } from './inbox-template';

const review = (id: string, overrides: Partial<InboxReview> = {}): InboxReview => ({
  id,
  question: `Question ${id}`,
  reason: `Reason ${id}`,
  taskId: null,
  busy: false,
  awaitingSync: false,
  ...overrides,
});

const CARD: InboxCard = { id: 'c1', capturedText: null, awaitingSync: false };

const DRAFT: TriageDraft = {
  title: 'Buy milk',
  notes: '',
  important: null,
  estimateMinutes: 15,
  areaId: '',
  availableFrom: null,
  due: null,
};

const PLAN: TriageReason = { quadrant: Quadrant.Plan, text: 'Important, no deadline: plan it.' };

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async (overrides: Record<string, unknown> = {}) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(InboxTemplate);
  const inputs: Record<string, unknown> = {
    loaded: true,
    loadFailed: false,
    statusLine: '',
    reviews: [],
    card: null,
    position: 1,
    total: 1,
    areas: [],
    today: '2026-10-04',
    cardBusy: false,
    attempts: 0,
    reason: null,
    handled: 0,
    empty: false,
    blockedBy: [],
    blocks: [],
    candidates: [],
    blockerMessage: '',
    blockerAdding: false,
    blockersBusy: false,
    draft: DRAFT,
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
  const text = (el: Element | null | undefined): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const items = (): HTMLLIElement[] => [
    ...host.querySelectorAll<HTMLLIElement>('ul.inbox__reviews > li'),
  ];
  const buttonIn = (root: ParentNode, name: string): HTMLButtonElement | undefined =>
    [...root.querySelectorAll('button')].find((candidate) => text(candidate) === name);
  const button = (root: ParentNode, name: string): HTMLButtonElement =>
    must(buttonIn(root, name), `button ${name}`);
  const click = async (el: HTMLElement): Promise<void> => {
    el.click();
    await fixture.whenStable();
  };
  const cardElement = (): HTMLElement | null => host.querySelector('asys-triage-card');
  const actions = (): HTMLElement | null => host.querySelector('footer.inbox__actions');
  const empty = (): HTMLElement | null => host.querySelector('section.inbox__empty');
  const sheet = (heading: string): HTMLDialogElement =>
    must(
      [...host.querySelectorAll<HTMLDialogElement>('dialog.asys-sheet')].find(
        (d) => text(d.querySelector('h2.asys-sheet__heading')) === heading,
      ),
      `the ${heading} sheet`,
    );
  const more = (): HTMLButtonElement =>
    must(host.querySelector<HTMLButtonElement>('button[aria-label="More for this Task"]'));
  return {
    fixture,
    host,
    update,
    text,
    items,
    buttonIn,
    button,
    click,
    cardElement,
    actions,
    empty,
    sheet,
    more,
  };
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('InboxTemplate', () => {
  it('B1 shows the heading and the status line, empty or not', async () => {
    const { host, update } = await setup({ statusLine: '2 to triage' });
    const h1 = host.querySelector('h1');
    const status = host.querySelector('p.asys-page__status.inbox__status');

    for (const name of ['asys-page__title', 'inbox__title', 'asys-text', 'asys-text--title']) {
      expect(h1?.classList.contains(name), name).toBe(true);
    }
    for (const name of ['asys-page__status', 'inbox__status', 'asys-text', 'asys-text--body']) {
      expect(status?.classList.contains(name), name).toBe(true);
    }
    expect(h1?.getAttribute('tabindex')).toBe('-1');
    expect(h1?.textContent?.trim()).toBe('Inbox');
    expect(h1?.nextElementSibling).toBe(status);
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent?.trim()).toBe('2 to triage');

    await update('statusLine', '');

    expect(host.querySelector('p.inbox__status')?.textContent).toBe('');
  });

  it('B2 shows the load state only while not loaded, and its retry emits', async () => {
    const { fixture, host, update, button, actions, empty } = await setup({
      loaded: false,
      reviews: [review('r1')],
      card: CARD,
      empty: true,
    });
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retry.subscribe(retry);

    expect(host.querySelector('asys-load-state')).not.toBeNull();
    expect(host.querySelector('ul.inbox__reviews')).toBeNull();
    expect(host.querySelector('asys-triage-card')).toBeNull();
    expect(empty()).toBeNull();
    expect(actions()).toBeNull();
    expect(host.textContent).toContain('Loading…');

    await update('loadFailed', true);

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'ASYS could not load your Tasks.',
    );

    button(host, 'Try again').click();

    expect(retry).toHaveBeenCalledOnce();

    await update('loaded', true);

    expect(host.querySelector('asys-load-state')).toBeNull();
  });

  it('B3 lists the reviews in order with question, reason and a Dismiss action', async () => {
    const { host, items, update, button } = await setup({
      reviews: [review('r1'), review('r2', { busy: true })],
    });

    expect(items()).toHaveLength(2);
    expect(
      items().map((li) => li.querySelector('.asys-review__question')?.textContent?.trim()),
    ).toEqual(['Question r1', 'Question r2']);
    expect(
      items().map((li) => li.querySelector('.asys-review__reason')?.textContent?.trim()),
    ).toEqual(['Reason r1', 'Reason r2']);
    expect(button(items()[0]!, 'Dismiss').disabled).toBe(false);
    expect(button(items()[1]!, 'Dismiss').disabled).toBe(true);

    await update('reviews', []);

    expect(host.querySelector('ul.inbox__reviews')).toBeNull();
  });

  it('B4 links Open Task to the Task only when the review has a taskId', async () => {
    const { items } = await setup({
      reviews: [review('r1', { taskId: 't1' }), review('r2')],
    });
    const link = items()[0]?.querySelector('a');

    expect(link?.textContent?.trim()).toBe('Open Task');
    expect(link?.getAttribute('href')).toMatch(/\/tasks\/t1$/);
    expect(link?.hasAttribute('asys-button')).toBe(true);
    expect(items()[1]?.querySelector('a')).toBeNull();
  });

  it('B5 shows the sync note after a review that awaits sync', async () => {
    const { items } = await setup({
      reviews: [review('r1', { awaitingSync: true }), review('r2')],
    });
    const note = items()[0]?.querySelector('p[asys-sync-note].inbox__sync');

    expect(note).not.toBeNull();
    expect(note?.previousElementSibling).toBe(items()[0]?.querySelector('asys-review-item'));
    expect(items()[1]?.querySelector('p[asys-sync-note]')).toBeNull();
  });

  it('B6 emits dismiss with the review id when its Dismiss is clicked', async () => {
    const { fixture, items, button } = await setup({ reviews: [review('r1'), review('r2')] });
    const dismiss = vi.fn<(id: string) => void>();
    fixture.componentInstance.dismiss.subscribe(dismiss);

    button(items()[1]!, 'Dismiss').click();

    expect(dismiss).toHaveBeenCalledExactlyOnceWith('r2');
  });

  describe('the card', () => {
    it('B7 comes first, before the Review items, with its inputs', async () => {
      const { host, text, cardElement } = await setup({
        reviews: [review('r1')],
        card: { ...CARD, capturedText: 'buy milk tomorrow' },
        position: 2,
        total: 5,
        areas: [{ id: 'a1', name: 'Home' }],
        draft: { ...DRAFT, areaId: 'a1' },
      });
      const card = must(cardElement());

      expect(host.querySelectorAll('asys-triage-card')).toHaveLength(1);
      expect(card.nextElementSibling).toBe(host.querySelector('ul.inbox__reviews'));
      expect(text(card.querySelector('.asys-triage__progress'))).toBe('2 of 5');
      expect(card.querySelector<HTMLTextAreaElement>('.asys-triage__title')?.value).toBe(
        'Buy milk',
      );
      expect(card.querySelector('section')?.getAttribute('data-focus-title')).toBe('c1');
      expect(text(card.querySelector('.asys-triage__captured-text'))).toBe('buy milk tomorrow');
      expect(text(card.querySelector('asys-choice-row'))).toContain('Home');
    });

    it('B7 passes attempts, the reason and busy to the card', async () => {
      const { host, update, cardElement } = await setup({ card: CARD, attempts: 1 });
      const card = must(cardElement());

      expect(card.querySelector('.asys-triage__hint--missing')).not.toBeNull();

      await update('reason', PLAN);

      expect(card.querySelector('.asys-triage__hint')).toBeNull();
      expect(card.querySelector('.asys-triage__reason')?.textContent).toContain(PLAN.text);

      await update('cardBusy', true);

      expect(host.querySelector<HTMLTextAreaElement>('.asys-triage__title')?.disabled).toBe(true);
    });

    it('B7 writes the draft model when the card changes', async () => {
      const { fixture, button, cardElement, click } = await setup({ card: CARD });
      const draftChange = vi.fn<(draft: TriageDraft) => void>();
      fixture.componentInstance.draft.subscribe(draftChange);

      await click(button(must(cardElement()), 'Important'));

      expect(fixture.componentInstance.draft()).toEqual({ ...DRAFT, important: true });
      expect(draftChange).toHaveBeenCalledExactlyOnceWith({ ...DRAFT, important: true });
    });

    it('B7 puts the sync note right after the card when it awaits sync, and none for a null card', async () => {
      const { host, update, cardElement } = await setup({
        card: { ...CARD, awaitingSync: true },
      });

      expect(cardElement()?.nextElementSibling?.matches('p[asys-sync-note].inbox__sync')).toBe(
        true,
      );

      await update('card', { ...CARD, awaitingSync: false });

      expect(host.querySelector('p[asys-sync-note]')).toBeNull();

      await update('card', null);

      expect(host.querySelector('asys-triage-card')).toBeNull();
    });

    it('B7 keeps the card for the same id and builds a new one for a new id', async () => {
      const { update, cardElement } = await setup({ card: CARD });
      const first = cardElement();

      await update('card', { ...CARD, awaitingSync: true });

      expect(cardElement()).toBe(first);

      await update('card', { ...CARD, id: 'c2' });

      expect(cardElement()).not.toBeNull();
      expect(cardElement()).not.toBe(first);
      expect(cardElement()?.querySelector('section')?.getAttribute('data-focus-title')).toBe('c2');
    });
  });

  describe('the empty card', () => {
    it('B8 shows Inbox is empty only when empty, without progress before a Task was handled', async () => {
      const { host, update, text, empty } = await setup({ empty: true });
      const section = must(empty());
      const heading = must(section.querySelector('h2'));
      const line = must(section.querySelector('p.inbox__empty-text'));

      expect(text(heading)).toBe('Inbox is empty');
      expect(heading.classList.contains('asys-text--display')).toBe(true);
      expect(text(line)).toBe('New captures land here.');
      expect(line.classList.contains('asys-text--reason')).toBe(true);
      expect(section.querySelector('.inbox__progress')).toBeNull();
      expect(host.querySelector('asys-triage-card')).toBeNull();

      await update('empty', false);

      expect(empty()).toBeNull();
    });

    it('B8 says how many Tasks were triaged once one was handled', async () => {
      const { text, empty } = await setup({ empty: true, handled: 3 });

      expect(text(empty()?.querySelector('.inbox__progress'))).toBe('3 of 3 triaged');
    });
  });

  describe('the action bar', () => {
    it('B9 shows Drop then Triage only while there is a card', async () => {
      const { update, actions, text } = await setup({ card: CARD });
      const bar = must(actions());
      const buttons = [...bar.querySelectorAll<HTMLButtonElement>('button')];

      expect(bar.tagName).toBe('FOOTER');
      expect(bar.hasAttribute('asys-action-bar')).toBe(true);
      expect(buttons.map((b) => text(b))).toEqual(['Drop', 'Triage']);
      expect(buttons[0]?.classList.contains('asys-button--secondary')).toBe(true);
      expect(buttons[1]?.classList.contains('asys-button--primary')).toBe(true);
      expect(buttons[1]?.classList.contains('inbox__triage')).toBe(true);
      for (const b of buttons) {
        expect(b.classList.contains('asys-button--large')).toBe(true);
      }

      await update('card', null);

      expect(actions()).toBeNull();
    });

    it('B9 names the Quadrant on Triage once there is a reason', async () => {
      const { update, actions, text } = await setup({ card: CARD, reason: PLAN });

      expect(text(actions()?.querySelector('.inbox__triage'))).toBe('Triage as Plan');

      await update('reason', null);

      expect(text(actions()?.querySelector('.inbox__triage'))).toBe('Triage');
    });

    it('B9 emits triage and dropTask, and is disabled only while the card is busy', async () => {
      const { fixture, update, actions, button } = await setup({ card: CARD, attempts: 2 });
      const triage = vi.fn<() => void>();
      const dropTask = vi.fn<() => void>();
      fixture.componentInstance.triage.subscribe(triage);
      fixture.componentInstance.dropTask.subscribe(dropTask);
      const bar = must(actions());

      expect(button(bar, 'Triage').disabled).toBe(false);
      expect(button(bar, 'Drop').disabled).toBe(false);

      button(bar, 'Triage').click();
      button(bar, 'Drop').click();

      expect(triage).toHaveBeenCalledOnce();
      expect(dropTask).toHaveBeenCalledOnce();

      await update('cardBusy', true);

      expect(button(bar, 'Triage').disabled).toBe(true);
      expect(button(bar, 'Drop').disabled).toBe(true);
    });
  });

  describe('the More sheet', () => {
    it('B10 opens from the card with Open in the editor, Blocked by and Drop', async () => {
      const { sheet, more, click, text } = await setup({ card: CARD });

      expect(sheet('More').open).toBe(false);

      await click(more());

      const dialog = sheet('More');
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button[asys-button]')];

      expect(dialog.open).toBe(true);
      expect(buttons.map((b) => text(b)).filter((name) => name !== '')).toEqual([
        'Open in the editor',
        'Blocked by',
        'Drop',
      ]);
      const [open, blockedBy, drop] = buttons.filter((b) => text(b) !== '');
      expect(open?.classList.contains('asys-button--block')).toBe(true);
      expect(blockedBy?.classList.contains('asys-button--block')).toBe(true);
      expect(drop?.classList.contains('asys-button--danger')).toBe(true);
    });

    it('B10 closes before Open in the editor emits openEditor', async () => {
      const { fixture, sheet, more, click, button } = await setup({ card: CARD });
      const openEditor = vi.fn<() => void>();
      fixture.componentInstance.openEditor.subscribe(openEditor);

      await click(more());
      await click(button(sheet('More'), 'Open in the editor'));

      expect(openEditor).toHaveBeenCalledOnce();
      expect(sheet('More').open).toBe(false);
    });

    it('B10 closes before Drop emits dropTask', async () => {
      const { fixture, sheet, more, click, button } = await setup({ card: CARD });
      const dropTask = vi.fn<() => void>();
      fixture.componentInstance.dropTask.subscribe(dropTask);

      await click(more());
      await click(button(sheet('More'), 'Drop'));

      expect(dropTask).toHaveBeenCalledOnce();
      expect(sheet('More').open).toBe(false);
    });

    it('B10 swaps itself for the Blocked by sheet', async () => {
      const { host, sheet, more, click, button } = await setup({ card: CARD });

      expect(host.querySelector('button.asys-section-header')).toBeNull();
      expect(sheet('Blocked by').open).toBe(false);

      await click(more());
      await click(button(sheet('More'), 'Blocked by'));

      expect(sheet('More').open).toBe(false);
      expect(sheet('Blocked by').open).toBe(true);
    });
  });

  describe('the Blocked by sheet', () => {
    const openBlockers = async (
      s: Awaited<ReturnType<typeof setup>>,
    ): Promise<HTMLDialogElement> => {
      await s.click(s.more());
      await s.click(s.button(s.sheet('More'), 'Blocked by'));

      return s.sheet('Blocked by');
    };

    it('B11 passes the blocker inputs and re-emits add and remove', async () => {
      const s = await setup({
        card: CARD,
        blockedBy: [{ linkId: 'l1', title: 'Water form', busy: false }],
        blocks: [{ id: 't9', title: 'Send invoice' }],
        candidates: [{ id: 't2', title: 'Call Jan' }],
        blockerMessage: 'Not added.',
      });
      const addBlocker = vi.fn<(id: string) => void>();
      const removeBlocker = vi.fn<(id: string) => void>();
      s.fixture.componentInstance.addBlocker.subscribe(addBlocker);
      s.fixture.componentInstance.removeBlocker.subscribe(removeBlocker);
      const dialog = await openBlockers(s);

      expect(s.text(dialog.querySelector('.task-blockers__row'))).toContain('Water form');
      expect(s.text(dialog)).toContain('Call Jan');
      expect(s.text(dialog)).toContain('Send invoice');
      expect(s.text(dialog.querySelector('p.task-blockers__message'))).toBe('Not added.');

      must(dialog.querySelector<HTMLButtonElement>('.task-blockers__remove')).click();
      must(dialog.querySelector<HTMLButtonElement>('.task-blockers__candidate')).click();

      expect(removeBlocker).toHaveBeenCalledExactlyOnceWith('l1');
      expect(addBlocker).toHaveBeenCalledExactlyOnceWith('t2');

      await s.update('blockersBusy', true);

      expect(dialog.querySelector<HTMLButtonElement>('.task-blockers__remove')?.disabled).toBe(
        true,
      );

      await s.update('blockersBusy', false);
      await s.update('blockerAdding', true);

      expect(dialog.querySelector<HTMLButtonElement>('.task-blockers__candidate')?.disabled).toBe(
        true,
      );
    });

    it('B11 reports the Find a Task text as blockerFilterChange', async () => {
      const s = await setup({ card: CARD });
      const change = vi.fn<(filter: string) => void>();
      s.fixture.componentInstance.blockerFilter.subscribe(change);
      const dialog = await openBlockers(s);
      const field = must(dialog.querySelector<HTMLTextAreaElement>('asys-text-field textarea'));

      field.value = 'inv';
      field.dispatchEvent(new Event('input', { bubbles: true }));

      expect(change).toHaveBeenCalledExactlyOnceWith('inv');
    });

    it('B11 focuses the card’s More button once it closes', async () => {
      const s = await setup({ card: CARD });
      const dialog = await openBlockers(s);

      await s.click(must(dialog.querySelector<HTMLButtonElement>('button.asys-sheet__close')));
      await s.fixture.whenStable();

      expect(dialog.open).toBe(false);
      expect(document.activeElement).toBe(s.more());
    });

    it('B11 focuses the blocker controls through the section', async () => {
      const s = await setup({
        card: CARD,
        blockedBy: [
          { linkId: 'l1', title: 'Water form', busy: false },
          { linkId: 'l2', title: 'Call Jan', busy: false },
        ],
      });
      const dialog = await openBlockers(s);

      s.fixture.componentInstance.focusBlockerRemove(1);

      expect(document.activeElement).toBe(dialog.querySelectorAll('.task-blockers__remove')[1]);

      s.fixture.componentInstance.focusBlockerFilter();

      expect(document.activeElement).toBe(dialog.querySelector('asys-text-field textarea'));
    });
  });

  it('B12 focusCard focuses the card, never its Title, else the heading', async () => {
    const { fixture, host, update } = await setup({ card: CARD });

    fixture.componentInstance.focusCard();

    expect(document.activeElement).toBe(host.querySelector('section.asys-triage'));

    await update('card', null);
    fixture.componentInstance.focusCard();

    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('B13 focusReview focuses the indexed review question, else the heading', async () => {
    const { fixture, host, items } = await setup({ reviews: [review('r1'), review('r2')] });

    fixture.componentInstance.focusReview(1);

    expect(document.activeElement).toBe(items()[1]?.querySelector('.asys-review__question'));

    fixture.componentInstance.focusReview(0);

    expect(document.activeElement).toBe(items()[0]?.querySelector('.asys-review__question'));

    fixture.componentInstance.focusReview(2);

    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('B13 focusReview focuses the heading when there are no reviews', async () => {
    const { fixture, host } = await setup();

    fixture.componentInstance.focusReview(0);

    expect(document.activeElement).toBe(host.querySelector('h1'));
  });
});
