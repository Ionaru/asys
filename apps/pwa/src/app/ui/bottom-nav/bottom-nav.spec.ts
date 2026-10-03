// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { BottomNav } from './bottom-nav';

@Component({ template: '' })
class Stub {}

@Component({ imports: [BottomNav], template: '<asys-bottom-nav [inboxCount]="count()" />' })
class Host {
  readonly count = signal(0);
}

const setup = async () => {
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
  await fixture.whenStable();

  const links = (): HTMLAnchorElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('nav.asys-bottomnav a.asys-bottomnav__item'));

  const go = async (url: string): Promise<void> => {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, links, go };
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
});
