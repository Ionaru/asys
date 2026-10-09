// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, type Type } from '@angular/core';
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

/** Projects a button, as the shell projects Capture. */
@Component({
  imports: [BottomNav],
  template: `<asys-bottom-nav [inboxCount]="count()"
    ><button type="button" class="projected">Capture</button></asys-bottom-nav
  >`,
})
class ProjectingHost {
  readonly count = signal<number | null>(0);
}

const setup = async (initial: number | null = 0, component: Type<Host> = Host) => {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'now', component: Stub },
        { path: 'today', component: Stub },
        { path: 'inbox', component: Stub },
      ]),
    ],
  });

  const fixture = TestBed.createComponent(component);

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

  it('holds only the word in each label', async () => {
    const { fixture, host, links } = await setup();

    host.count.set(3);
    await fixture.whenStable();

    expect(
      links().map((a) => a.querySelector('.asys-bottomnav__label')?.textContent?.trim()),
    ).toEqual(['Now', 'Today', 'Inbox']);
  });

  it('has no pill', async () => {
    const { fixture, links, go } = await setup();

    expect(fixture.nativeElement.querySelector('.asys-bottomnav__pill')).toBeNull();

    await go('/now');

    expect(fixture.nativeElement.querySelector('.asys-bottomnav__pill')).toBeNull();
    expect(links().every((a) => a.querySelector('.asys-bottomnav__pill') === null)).toBe(true);
  });

  describe('the icons', () => {
    const glyph = (link: HTMLAnchorElement | undefined): SVGElement | null =>
      link?.querySelector('.asys-bottomnav__icon svg[data-icon]') ?? null;

    it('gives each link an icon holding its glyph, in Regular before any route is active', async () => {
      const { links } = await setup();

      expect(links().map((a) => glyph(a)?.getAttribute('data-icon'))).toEqual([
        'bullseye',
        'calendar-day',
        'inbox',
      ]);
      expect(links().map((a) => glyph(a)?.getAttribute('data-prefix'))).toEqual([
        'far',
        'far',
        'far',
      ]);
    });

    it('puts each glyph inside an __icon span that comes before the label', async () => {
      const { links } = await setup();

      for (const link of links()) {
        const icon = link.querySelector('.asys-bottomnav__icon');
        const label = link.querySelector('.asys-bottomnav__label');

        expect(icon?.tagName).toBe('SPAN');
        expect(icon?.querySelector('asys-icon')).not.toBeNull();
        expect(icon?.nextElementSibling).toBe(label);
      }
    });

    it.each([
      ['/now', 0],
      ['/today', 1],
      ['/inbox', 2],
    ])('draws Solid only on the link of %s and Regular on the others', async (url, index) => {
      const { links, go } = await setup();

      await go(url);

      const prefixes = links().map((a) => glyph(a)?.getAttribute('data-prefix'));

      expect(prefixes[index]).toBe('fas');
      expect(prefixes.filter((prefix) => prefix === 'far')).toHaveLength(2);
      expect(links().map((a) => glyph(a)?.getAttribute('data-icon'))).toEqual([
        'bullseye',
        'calendar-day',
        'inbox',
      ]);
    });

    it('moves the Solid glyph when the route changes', async () => {
      const { links, go } = await setup();

      await go('/now');
      await go('/today');

      expect(links().map((a) => glyph(a)?.getAttribute('data-prefix'))).toEqual([
        'far',
        'fas',
        'far',
      ]);
    });
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

  it('shows the count in an aria-hidden badge inside the Inbox icon, after the glyph, when above 0', async () => {
    const { fixture, host, links } = await setup();

    host.count.set(4);
    await fixture.whenStable();

    const badges = fixture.nativeElement.querySelectorAll('.asys-bottomnav__badge');
    const icon = links()[2].querySelector('.asys-bottomnav__icon');

    expect(badges.length).toBe(1);
    expect(badges[0].textContent?.trim()).toBe('4');
    expect(badges[0].getAttribute('aria-hidden')).toBe('true');
    expect(badges[0].parentElement).toBe(icon);
    expect(icon?.firstElementChild?.matches('asys-icon')).toBe(true);
    expect(icon?.lastElementChild).toBe(badges[0]);
    expect(links()[2].querySelector('.asys-bottomnav__label .asys-bottomnav__badge')).toBeNull();
    expect(links()[2].querySelector('.asys-bottomnav__label')?.textContent?.trim()).toBe('Inbox');

    host.count.set(0);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.asys-bottomnav__badge')).toBeNull();
  });

  it('keeps the badge out of the Now and Today icons', async () => {
    const { fixture, host, links } = await setup();

    host.count.set(4);
    await fixture.whenStable();

    expect(links()[0].querySelector('.asys-bottomnav__badge')).toBeNull();
    expect(links()[1].querySelector('.asys-bottomnav__badge')).toBeNull();
  });

  describe('the Inbox name', () => {
    const inboxLabel = (links: () => HTMLAnchorElement[]): string | null =>
      links()[2].getAttribute('aria-label');

    it.each([
      ['Inbox, 3 waiting', 3],
      ['Inbox, 1 waiting', 1],
    ])('reads "%s" as the aria-label at a count of %d', async (name, count) => {
      const { fixture, host, links } = await setup();

      host.count.set(count);
      await fixture.whenStable();

      expect(inboxLabel(links)).toBe(name);
    });

    it('has no aria-label at 0', async () => {
      const { links } = await setup();

      expect(links()[2].hasAttribute('aria-label')).toBe(false);
    });

    it('has no aria-label while the count is not known yet', async () => {
      const { links } = await setup(null);

      expect(links()[2].hasAttribute('aria-label')).toBe(false);
    });

    it('follows the count, and drops the aria-label again at 0 or null', async () => {
      const { fixture, host, links } = await setup();

      host.count.set(3);
      await fixture.whenStable();

      expect(inboxLabel(links)).toBe('Inbox, 3 waiting');

      host.count.set(2);
      await fixture.whenStable();

      expect(inboxLabel(links)).toBe('Inbox, 2 waiting');

      host.count.set(0);
      await fixture.whenStable();

      expect(links()[2].hasAttribute('aria-label')).toBe(false);

      host.count.set(3);
      await fixture.whenStable();
      host.count.set(null);
      await fixture.whenStable();

      expect(links()[2].hasAttribute('aria-label')).toBe(false);
    });

    it('gives Now and Today no aria-label', async () => {
      const { fixture, host, links } = await setup();

      host.count.set(3);
      await fixture.whenStable();

      expect(links()[0].hasAttribute('aria-label')).toBe(false);
      expect(links()[1].hasAttribute('aria-label')).toBe(false);
    });
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

  describe('projected content', () => {
    it('renders it inside the nav, after the three links', async () => {
      const { fixture, links } = await setup(0, ProjectingHost);
      const nav = fixture.nativeElement.querySelector('nav.asys-bottomnav') as HTMLElement;
      const projected = nav.querySelector('button.projected');

      expect(projected).not.toBeNull();
      expect(projected?.parentElement).toBe(nav);
      expect(Array.from(nav.children).slice(0, 3)).toEqual(links());
      expect(Array.from(nav.children)[3]).toBe(projected);
      expect(nav.lastElementChild).toBe(projected);
    });

    it('keeps the three links in order, and the badge in the Inbox icon', async () => {
      const { fixture, host, links } = await setup(0, ProjectingHost);

      host.count.set(2);
      await fixture.whenStable();

      expect(links().map((a) => a.getAttribute('href'))).toEqual(['/now', '/today', '/inbox']);
      expect(
        links()[2].querySelector('.asys-bottomnav__icon .asys-bottomnav__badge'),
      ).not.toBeNull();
    });

    it('renders nothing after the links when nothing is projected', async () => {
      const { fixture, links } = await setup();
      const nav = fixture.nativeElement.querySelector('nav.asys-bottomnav') as HTMLElement;

      expect(nav.lastElementChild).toBe(links()[2]);
    });
  });
});
