// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { TriageDraft } from '../../organisms/triage-card/triage-card';
import { InboxCard, InboxReview, InboxTemplate } from './inbox-template';

const review = (id: string, overrides: Partial<InboxReview> = {}): InboxReview => ({
  id,
  question: `Question ${id}`,
  reason: `Reason ${id}`,
  taskId: null,
  busy: false,
  awaitingSync: false,
  ...overrides,
});

const defaultCard: InboxCard = {
  id: 'c1',
  title: 'Buy milk',
  rawText: 'buy milk tomorrow',
  awaitingSync: false,
};

const defaultDraft: TriageDraft = { important: null, estimateMinutes: 15, areaId: null };

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
    cardBusy: false,
    canLater: false,
    empty: false,
    draft: defaultDraft,
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
    ...host.querySelectorAll<HTMLLIElement>('ul.inbox__reviews > li'),
  ];
  const button = (root: ParentNode, name: string): HTMLButtonElement => {
    const found = [...root.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === name,
    );
    if (found === undefined) throw new Error(`Missing button ${name}`);
    return found;
  };
  const cardElement = (): HTMLElement | null => host.querySelector('asys-triage-card');
  return { fixture, host, update, items, button, cardElement };
};

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
    const { fixture, host, update, button } = await setup({
      loaded: false,
      reviews: [review('r1')],
      card: defaultCard,
      empty: true,
    });
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retry.subscribe(retry);

    expect(host.querySelector('asys-load-state')).not.toBeNull();
    expect(host.querySelector('ul.inbox__reviews')).toBeNull();
    expect(host.querySelector('asys-triage-card')).toBeNull();
    expect(host.querySelector('p.inbox__text')).toBeNull();
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
    for (const li of items()) {
      expect(li.querySelector('asys-review-item')).not.toBeNull();
      expect(button(li, 'Dismiss')).toBeDefined();
    }
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

  it('B7 renders the Triage card with its inputs, writes the draft and maps its outputs', async () => {
    const { fixture, host, button, cardElement, update } = await setup({
      reviews: [review('r1')],
      card: defaultCard,
      position: 2,
      total: 5,
      canLater: true,
      areas: [{ id: 'a1', name: 'Home' }],
      draft: { important: null, estimateMinutes: 15, areaId: 'a1' },
    });
    const triage = vi.fn<(draft: TriageDraft) => void>();
    const dropTask = vi.fn<() => void>();
    const later = vi.fn<(id: string) => void>();
    const edit = vi.fn<(id: string) => void>();
    fixture.componentInstance.triage.subscribe(triage);
    fixture.componentInstance.dropTask.subscribe(dropTask);
    fixture.componentInstance.later.subscribe(later);
    fixture.componentInstance.edit.subscribe(edit);
    const card = cardElement()!;

    expect(host.querySelectorAll('asys-triage-card')).toHaveLength(1);
    expect(host.querySelector('ul.inbox__reviews')?.nextElementSibling).toBe(card);
    expect(card.querySelector('.asys-triage__progress')?.textContent?.trim()).toBe('2 of 5');
    expect(card.querySelector('.asys-triage__title')?.textContent?.trim()).toBe('Buy milk');
    expect(card.querySelector('.asys-triage__raw')?.textContent?.trim()).toBe('buy milk tomorrow');
    expect(card.textContent).toContain('Home');
    expect(button(card, 'Later')).toBeDefined();

    button(card, 'Important').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.draft()).toEqual({
      important: true,
      estimateMinutes: 15,
      areaId: 'a1',
    });

    button(card, 'Triage').click();
    button(card, 'Later').click();
    button(card, 'Edit').click();
    button(card, 'Drop').click();
    await fixture.whenStable();
    button(card.querySelector('asys-inline-confirm')!, 'Drop').click();

    expect(triage).toHaveBeenCalledExactlyOnceWith({
      important: true,
      estimateMinutes: 15,
      areaId: 'a1',
    });
    expect(later).toHaveBeenCalledExactlyOnceWith('c1');
    expect(edit).toHaveBeenCalledExactlyOnceWith('c1');
    expect(dropTask).toHaveBeenCalledOnce();

    await update('canLater', false);

    expect(
      [...card.querySelectorAll('button')].some((b) => b.textContent?.trim() === 'Later'),
    ).toBe(false);

    await update('cardBusy', true);

    expect(button(card, 'Triage').disabled).toBe(true);
  });

  it('B7 puts the sync note right after the card when it awaits sync, and none for a null card', async () => {
    const { host, update, cardElement } = await setup({
      card: { ...defaultCard, awaitingSync: true },
    });

    expect(cardElement()?.nextElementSibling?.matches('p[asys-sync-note].inbox__sync')).toBe(true);

    await update('card', { ...defaultCard, awaitingSync: false });

    expect(host.querySelector('p[asys-sync-note]')).toBeNull();

    await update('card', null);

    expect(host.querySelector('asys-triage-card')).toBeNull();
  });

  it('B7 keeps the card for the same id and builds a new one for a new id', async () => {
    const { update, cardElement } = await setup({ card: defaultCard });
    const first = cardElement();

    await update('card', { ...defaultCard, title: 'Buy oat milk' });

    expect(cardElement()).toBe(first);
    expect(cardElement()?.querySelector('.asys-triage__title')?.textContent?.trim()).toBe(
      'Buy oat milk',
    );

    await update('card', { ...defaultCard, id: 'c2' });

    expect(cardElement()).not.toBeNull();
    expect(cardElement()).not.toBe(first);
  });

  it('B8 says Nothing waits here only when empty', async () => {
    const { host, update } = await setup({ empty: true });

    expect(host.querySelector('p.inbox__text')?.textContent?.trim()).toBe('Nothing waits here.');

    await update('empty', false);

    expect(host.querySelector('p.inbox__text')).toBeNull();
  });

  it('B9 focusCard focuses the card title, else the heading', async () => {
    const { fixture, host, update } = await setup({ card: defaultCard });

    fixture.componentInstance.focusCard();

    expect(document.activeElement).toBe(host.querySelector('.asys-triage__title'));

    await update('card', null);
    fixture.componentInstance.focusCard();

    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('B10 focusReview focuses the indexed review question, else the heading', async () => {
    const { fixture, host, items } = await setup({ reviews: [review('r1'), review('r2')] });

    fixture.componentInstance.focusReview(1);

    expect(document.activeElement).toBe(items()[1]?.querySelector('.asys-review__question'));

    fixture.componentInstance.focusReview(0);

    expect(document.activeElement).toBe(items()[0]?.querySelector('.asys-review__question'));

    fixture.componentInstance.focusReview(2);

    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('B10 focusReview focuses the heading when there are no reviews', async () => {
    const { fixture, host } = await setup();

    fixture.componentInstance.focusReview(0);

    expect(document.activeElement).toBe(host.querySelector('h1'));
  });
});
