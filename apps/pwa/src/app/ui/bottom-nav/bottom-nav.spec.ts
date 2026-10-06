// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';

import { BottomNav } from './bottom-nav';

@Component({ template: '' })
class Stub {}

@Component({ imports: [BottomNav], template: '<asys-bottom-nav [inboxCount]="count()" />' })
class Host {
  /** `null` is a count that is not known yet. */
  readonly count = signal<number | null>(0);
}

const setup = async (initial: number | null = 0) => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'now', component: Stub },
        { path: 'today', component: Stub },
        { path: 'inbox', component: Stub },
      ]),
    ],
  });

  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.count.set(initial);
  await fixture.whenStable();

  const links = (): HTMLAnchorElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('nav.asys-bottomnav a.asys-bottomnav__item'));

  const go = async (url: string): Promise<void> => {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  };

  const badge = (): Element | null => fixture.nativeElement.querySelector('.asys-bottomnav__badge');

  const nav = (): BottomNav =>
    fixture.debugElement.query(By.directive(BottomNav)).componentInstance as BottomNav;

  return { fixture, host: fixture.componentInstance, links, go, badge, nav };
};

describe('BottomNav', () => {
  it('renders a primary nav with Now, Today and Inbox in order', async () => {
    const { fixture, links } = await setup();

    expect(
      fixture.nativeElement.querySelector('nav.asys-bottomnav')?.getAttribute('aria-label'),
    ).toBe('Primary');
    expect(links().map((a) => a.getAttribute('href'))).toEqual(['/now', '/today', '/inbox']);
    expect(
      links().map((a) => a.querySelector('.asys-bottomnav__label')?.textContent?.trim()),
    ).toEqual(['Now', 'Today', 'Inbox']);
  });

  it('gives each link an aria-hidden pill', async () => {
    const { links } = await setup();

    for (const link of links()) {
      expect(link.querySelector('.asys-bottomnav__pill')?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('has no aria-current before any route is active', async () => {
    const { links } = await setup();

    expect(links().filter((a) => a.hasAttribute('aria-current'))).toEqual([]);
  });

  it.each([
    ['/now', 0],
    ['/today', 1],
    ['/inbox', 2],
  ])('marks only the link of %s as the current page', async (url, index) => {
    const { links, go } = await setup();

    await go(url);

    const current = links().map((a) => a.getAttribute('aria-current'));

    expect(current[index]).toBe('page');
    expect(current.filter((c) => c !== null)).toEqual(['page']);
  });

  it('moves aria-current when the route changes', async () => {
    const { links, go } = await setup();

    await go('/now');
    await go('/today');

    expect(links()[0].hasAttribute('aria-current')).toBe(false);
    expect(links()[1].getAttribute('aria-current')).toBe('page');
  });

  it('shows no badge at 0', async () => {
    const { fixture } = await setup();

    expect(fixture.nativeElement.querySelector('.asys-bottomnav__badge')).toBeNull();
  });

  it('shows the count in a badge inside the Inbox label when above 0', async () => {
    const { fixture, host, links } = await setup();

    host.count.set(4);
    await fixture.whenStable();

    const badges = fixture.nativeElement.querySelectorAll('.asys-bottomnav__badge');

    expect(badges.length).toBe(1);
    expect(badges[0].textContent?.trim()).toBe('4');
    expect(
      links()[2].querySelector('.asys-bottomnav__label .asys-bottomnav__badge'),
    ).not.toBeNull();

    host.count.set(0);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.asys-bottomnav__badge')).toBeNull();
  });

  it('renders a badge reading 1 when the count goes from 0 to 1', async () => {
    const { fixture, host, badge } = await setup();

    host.count.set(1);
    await fixture.whenStable();

    expect(badge()?.textContent?.trim()).toBe('1');
  });

  describe('re-creates the badge when the count rises', () => {
    it('gives a different node for 1 to 2', async () => {
      const { fixture, host, badge } = await setup();

      host.count.set(1);
      await fixture.whenStable();

      const before = badge();

      host.count.set(2);
      await fixture.whenStable();

      expect(before).not.toBeNull();
      expect(badge()).not.toBeNull();
      expect(badge()).not.toBe(before);
      expect(badge()?.textContent?.trim()).toBe('2');
    });

    it('keeps the node for 2 to 1', async () => {
      const { fixture, host, badge } = await setup();

      host.count.set(2);
      await fixture.whenStable();

      const before = badge();

      host.count.set(1);
      await fixture.whenStable();

      expect(badge()).toBe(before);
      expect(badge()?.textContent?.trim()).toBe('1');
    });

    it('keeps the node for 2 to 2', async () => {
      const { fixture, host, badge } = await setup();

      host.count.set(2);
      await fixture.whenStable();

      const before = badge();

      host.count.set(3);
      host.count.set(2);
      await fixture.whenStable();

      expect(badge()).toBe(before);
    });
  });

  describe('a count that is not known yet', () => {
    it('shows no badge for null at the first render', async () => {
      const { badge } = await setup(null);

      expect(badge()).toBeNull();
    });

    it('shows no badge when the count goes from a number to null', async () => {
      const { fixture, host, badge } = await setup();

      host.count.set(3);
      await fixture.whenStable();
      host.count.set(null);
      await fixture.whenStable();

      expect(badge()).toBeNull();
    });

    it('shows a badge reading 3 when the count goes from null to 3', async () => {
      const { fixture, host, badge } = await setup(null);

      host.count.set(3);
      await fixture.whenStable();

      expect(badge()).not.toBeNull();
      expect(badge()?.textContent?.trim()).toBe('3');
    });

    it('keeps the same badge node across a re-render after null to 3', async () => {
      const { fixture, host, badge, go } = await setup(null);

      host.count.set(3);
      await fixture.whenStable();

      const before = badge();

      await go('/today');
      fixture.detectChanges();

      expect(badge()).not.toBeNull();
      expect(badge()).toBe(before);
    });

    it('re-creates the badge for 3 to 4 after null to 3', async () => {
      const { fixture, host, badge } = await setup(null);

      host.count.set(3);
      await fixture.whenStable();

      const before = badge();

      host.count.set(4);
      await fixture.whenStable();

      expect(before).not.toBeNull();
      expect(badge()).not.toBe(before);
      expect(badge()?.textContent?.trim()).toBe('4');
    });

    it('keeps the node for 3 to 2 after null to 3', async () => {
      const { fixture, host, badge } = await setup(null);

      host.count.set(3);
      await fixture.whenStable();

      const before = badge();

      host.count.set(2);
      await fixture.whenStable();

      expect(badge()).toBe(before);
      expect(badge()?.textContent?.trim()).toBe('2');
    });
  });

  it('returns the Inbox link from inboxTab', async () => {
    const { nav, links } = await setup();

    const tab = nav().inboxTab();

    expect(tab).not.toBeNull();
    expect(tab?.getAttribute('href')?.endsWith('/inbox')).toBe(true);
    expect(tab).toBe(links()[2]);
  });
});
