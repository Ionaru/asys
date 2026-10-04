// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  IsoWeekday,
  PERSONAL_ACTIVE_HOURS,
  WORK_ACTIVE_HOURS,
  type ActiveHours,
  type Area,
  type DomainState,
} from '@asys/domain';

import { DataStore, SyncStatus } from '../../core/data/data-store';
import { AreaList } from './area-list';

const area = (id: string, name: string, activeHours = WORK_ACTIVE_HOURS): Area => ({
  id,
  name,
  activeHours,
  defaultPrivacy: null,
  version: 1,
});

const domainState = (areas: readonly Area[]): DomainState => ({
  tasks: [],
  links: [],
  areas,
  reviewItems: [],
  settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
});

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async (state: DomainState | null, status: SyncStatus = SyncStatus.Ready) => {
  const refresh = vi.fn<() => void>();
  const stateSignal = signal<DomainState | null>(state);

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: DataStore,
        useValue: {
          state: stateSignal,
          status: signal(status),
          awaitingSync: signal<ReadonlySet<string>>(new Set()),
          refresh,
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AreaList);

  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const text = (el: Element | null = root()): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const items = (): HTMLAnchorElement[] =>
    Array.from(root().querySelectorAll<HTMLAnchorElement>('a')).filter((a) =>
      (a.getAttribute('href') ?? '').match(/^\/settings\/areas\/(?!new$)/),
    );

  return { fixture, root, text, items, refresh, state: stateSignal };
};

describe('AreaList', () => {
  it('shows the heading and one link per Area to its editor', async () => {
    const { root, items } = await setup(domainState([area('a1', 'Work'), area('a2', 'Home')]));

    expect(root().querySelector('h1')?.textContent?.trim()).toBe('Areas');
    expect(items().map((a) => a.getAttribute('href'))).toEqual([
      '/settings/areas/a2',
      '/settings/areas/a1',
    ]);
  });

  it('orders Areas by name, then by id in code units', async () => {
    const { items, text } = await setup(
      domainState([
        area('z', 'Home'),
        area('b', 'Work'),
        area('a', 'Home'),
        area('c', 'alpha'),
        area('d', 'Zeta'),
      ]),
    );

    expect(items().map((a) => a.getAttribute('href'))).toEqual([
      '/settings/areas/a',
      '/settings/areas/z',
      '/settings/areas/b',
      '/settings/areas/d',
      '/settings/areas/c',
    ]);
    expect(text(must(items()[3]))).toContain('Zeta');
  });

  it('shows the name with the Active hours summary below it', async () => {
    const { items, text } = await setup(
      domainState([
        area('w', 'Work', WORK_ACTIVE_HOURS),
        area('p', 'Personal', PERSONAL_ACTIVE_HOURS),
      ]),
    );
    const [personal, work] = items();

    expect(text(personal)).toBe('PersonalEvery day, all day');
    expect(text(work)).toBe('WorkMon–Fri 08:00–18:00');
  });

  it('summarises an Area with some hours on one day', async () => {
    const hours: ActiveHours = {
      [IsoWeekday.Monday]: [[540, 1020]],
      [IsoWeekday.Tuesday]: [],
      [IsoWeekday.Wednesday]: [],
      [IsoWeekday.Thursday]: [],
      [IsoWeekday.Friday]: [],
      [IsoWeekday.Saturday]: [],
      [IsoWeekday.Sunday]: [],
    };
    const { items, text } = await setup(domainState([area('x', 'Gym', hours)]));

    expect(text(must(items()[0]))).toBe('GymMon 09:00–17:00');
  });

  it('links a primary New Area button to /settings/areas/new', async () => {
    const { root } = await setup(domainState([area('w', 'Work')]));
    const link = must(
      Array.from(root().querySelectorAll('a')).find((a) => a.textContent?.trim() === 'New Area'),
    );

    expect(link.getAttribute('href')).toBe('/settings/areas/new');
    expect(link.classList.contains('asys-button--primary')).toBe(true);
  });

  it('says there are no Areas yet, and still offers New Area', async () => {
    const { text, items, root } = await setup(domainState([]));

    expect(text()).toContain('No Areas yet.');
    expect(items()).toHaveLength(0);
    expect(root().querySelector('a[href="/settings/areas/new"]')).not.toBeNull();
  });

  it('shows Loading while there is no state', async () => {
    const { text } = await setup(null);

    expect(text()).toContain('Loading…');
  });

  it('offers Try again after a failed load', async () => {
    const { root, refresh, fixture } = await setup(null, SyncStatus.Failed);

    expect(root().querySelector('[role="alert"]')?.textContent).toContain(
      'ASYS could not load your Tasks.',
    );

    must(
      Array.from(root().querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Try again',
      ),
    ).click();
    await fixture.whenStable();

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
