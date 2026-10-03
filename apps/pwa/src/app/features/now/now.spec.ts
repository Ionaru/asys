// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PickResult, RankedTask, WaitingTask } from '@asys/domain';

import { DataStore, SyncStatus } from '../../core/data/data-store';
import { Now } from './now';

const ranked = (title: string, reasonText: string): RankedTask =>
  ({ task: { id: title, title }, reason: {}, reasonText }) as unknown as RankedTask;

const waiting = (title: string): WaitingTask =>
  ({ task: { id: title, title }, reasons: [] }) as unknown as WaitingTask;

const setup = async (now: PickResult | null, initial = SyncStatus.Ready) => {
  const refresh = vi.fn<() => void>();
  const nowSignal = signal<PickResult | null>(now);
  const status = signal(initial);

  TestBed.configureTestingModule({
    providers: [{ provide: DataStore, useValue: { now: nowSignal, status, refresh } }],
  });

  const fixture = TestBed.createComponent(Now);
  const root = (): HTMLElement => fixture.nativeElement;
  const text = (): string => (root().textContent ?? '').replace(/\s+/g, ' ');
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  await settle();

  const header = (): HTMLButtonElement | null => root().querySelector('button.asys-section-header');

  return { fixture, root, text, settle, header, nowSignal, status, refresh };
};

describe('Now', () => {
  it('renders the Now heading', async () => {
    const { root } = await setup(null);

    expect(root().querySelector('h1')?.textContent?.trim()).toBe('Now');
  });

  describe('without a result', () => {
    it('shows Loading while the status is Loading', async () => {
      const { text } = await setup(null, SyncStatus.Loading);

      expect(text()).toContain('Loading…');
      expect(text()).not.toContain('Nothing to show yet.');
    });

    it('shows an alert and a Try again button while the status is Failed', async () => {
      const { root } = await setup(null, SyncStatus.Failed);

      expect(root().querySelector('p[role="alert"]')?.textContent?.trim()).toBe(
        'ASYS could not load your Tasks.',
      );
      expect(
        Array.from(root().querySelectorAll('button')).some(
          (b) => b.textContent?.trim() === 'Try again',
        ),
      ).toBe(true);
    });

    it('Try again refreshes the data store', async () => {
      const { root, settle, refresh } = await setup(null, SyncStatus.Failed);

      Array.from(root().querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === 'Try again')
        ?.click();
      await settle();

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it.each([SyncStatus.Idle, SyncStatus.Loading, SyncStatus.Ready, SyncStatus.Stale])(
      'shows no alert or Try again while the status is %s',
      async (status) => {
        const { root } = await setup(null, status);

        expect(root().querySelector('p[role="alert"]')).toBeNull();
        expect(
          Array.from(root().querySelectorAll('button')).some(
            (b) => b.textContent?.trim() === 'Try again',
          ),
        ).toBe(false);
      },
    );

    it('shows the Tasks, not the alert, when a result exists although the status is Failed', async () => {
      const { root, text } = await setup(
        { ranked: [ranked('A', 'why')], waiting: [] },
        SyncStatus.Failed,
      );

      expect(root().querySelector('p[role="alert"]')).toBeNull();
      expect(text()).toContain('A');
    });

    it.each([SyncStatus.Idle, SyncStatus.Ready, SyncStatus.Stale])(
      'shows Nothing to show yet. while the status is %s',
      async (status) => {
        const { text } = await setup(null, status);

        expect(text()).toContain('Nothing to show yet.');
        expect(text()).not.toContain('Loading…');
      },
    );
  });

  describe('ranked Tasks', () => {
    it('lists titles and reason texts in order', async () => {
      const { root } = await setup({
        ranked: [
          ranked('Pay the invoice', 'Overdue since Mon 29 Sep'),
          ranked('Call the dentist', 'Do today'),
          ranked('Water the plants', 'Plan for later'),
        ],
        waiting: [],
      });

      const items = Array.from(root().querySelectorAll('ul > li')).map((li) =>
        Array.from(li.children)
          .map((child) => (child.textContent ?? '').trim())
          .join(' '),
      );

      expect(items).toEqual([
        'Pay the invoice Overdue since Mon 29 Sep',
        'Call the dentist Do today',
        'Water the plants Plan for later',
      ]);
    });

    it('shows Nothing to do right now. for an empty ranked list', async () => {
      const { text, root } = await setup({ ranked: [], waiting: [] });

      expect(text()).toContain('Nothing to do right now.');
      expect(root().querySelectorAll('li').length).toBe(0);
    });

    it('does not show Nothing to do right now. when there are ranked Tasks', async () => {
      const { text } = await setup({ ranked: [ranked('A', 'why')], waiting: [] });

      expect(text()).not.toContain('Nothing to do right now.');
    });

    it('updates when the result changes', async () => {
      const { text, settle, nowSignal } = await setup({
        ranked: [ranked('A', 'why')],
        waiting: [],
      });

      nowSignal.set({ ranked: [ranked('B', 'because')], waiting: [] });
      await settle();

      expect(text()).toContain('B');
      expect(text()).toContain('because');
      expect(text()).not.toContain('A why');
    });
  });

  describe('Waiting', () => {
    it('has no header when nothing waits', async () => {
      const { root, text } = await setup({ ranked: [ranked('A', 'why')], waiting: [] });

      expect(root().querySelector('asys-section-header')).toBeNull();
      expect(text()).not.toContain('Waiting');
    });

    it('shows the header with the count, collapsed by default', async () => {
      const { header, text } = await setup({
        ranked: [ranked('A', 'why')],
        waiting: [waiting('Blocked one'), waiting('Blocked two')],
      });

      expect(header()?.querySelector('.asys-section-header__title')?.textContent?.trim()).toBe(
        'Waiting',
      );
      expect(header()?.querySelector('.asys-section-header__count')?.textContent?.trim()).toBe('2');
      expect(header()?.getAttribute('aria-expanded')).toBe('false');
      expect(text()).not.toContain('Blocked one');
      expect(text()).not.toContain('Blocked two');
    });

    it('shows the waiting titles after expanding and hides them after collapsing', async () => {
      const { header, text, settle } = await setup({
        ranked: [],
        waiting: [waiting('Blocked one'), waiting('Blocked two')],
      });

      header()?.click();
      await settle();

      expect(header()?.getAttribute('aria-expanded')).toBe('true');
      expect(text()).toContain('Blocked one');
      expect(text()).toContain('Blocked two');

      header()?.click();
      await settle();

      expect(text()).not.toContain('Blocked one');
    });

    it('shows the Waiting section even when no Task is ranked', async () => {
      const { header, text } = await setup({ ranked: [], waiting: [waiting('Blocked one')] });

      expect(header()).not.toBeNull();
      expect(text()).toContain('Nothing to do right now.');
    });
  });
});
