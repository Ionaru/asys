// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconName } from '../../atoms/icon/icon';
import { NavItem } from './nav-item';

@Component({
  imports: [NavItem],
  template: `<a
    asys-nav-item
    href="/inbox"
    [icon]="IconName.Inbox"
    label="Inbox"
    [current]="current()"
    [pressed]="pressed()"
    [count]="count()"
  ></a>`,
})
class Host {
  protected readonly IconName = IconName;

  readonly current = signal(false);

  readonly pressed = signal(false);

  readonly count = signal<number | null>(null);
}

@Component({
  imports: [NavItem],
  template: `<a asys-nav-item href="/inbox" [icon]="IconName.Inbox" label="Inbox"></a>`,
})
class DefaultHost {
  protected readonly IconName = IconName;
}

const setup = async (initial: number | null = null) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.count.set(initial);
  await fixture.whenStable();

  const item = (): HTMLAnchorElement => fixture.nativeElement.querySelector('a');
  const count = (): HTMLElement | null =>
    item().querySelector('.asys-nav-item__icon > .asys-count');
  const set = async (value: number | null): Promise<void> => {
    fixture.componentInstance.count.set(value);
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, item, count, set };
};

describe('NavItem', () => {
  it('renders an icon span then a label span, with nothing else, by default', async () => {
    const fixture = TestBed.createComponent(DefaultHost);
    await fixture.whenStable();

    const a: HTMLAnchorElement = fixture.nativeElement.querySelector('a');
    const children = Array.from(a.children);
    const icon = a.querySelector('svg');

    expect(a.classList.contains('asys-nav-item')).toBe(true);
    expect(children.map((c) => c.tagName + '.' + c.className)).toEqual([
      'SPAN.asys-nav-item__icon',
      'SPAN.asys-nav-item__label',
    ]);
    expect(children[1].textContent?.trim()).toBe('Inbox');
    expect(children[0].firstElementChild?.tagName.toLowerCase()).toBe('asys-icon');
    expect(icon?.getAttribute('data-icon')).toBe('inbox');
    expect(icon?.getAttribute('data-prefix')).toBe('far');
    expect(a.hasAttribute('aria-current')).toBe(false);
    expect(a.hasAttribute('aria-label')).toBe(false);
    expect(a.querySelector('.asys-count')).toBeNull();
    expect(a.classList.contains('is-pressed')).toBe(false);
  });

  it('marks the current item with aria-current and the Solid icon, and undoes both', async () => {
    const { fixture, host, item } = await setup();

    host.current.set(true);
    await fixture.whenStable();

    expect(item().getAttribute('aria-current')).toBe('page');
    expect(item().querySelector('svg')?.getAttribute('data-prefix')).toBe('fas');

    host.current.set(false);
    await fixture.whenStable();

    expect(item().hasAttribute('aria-current')).toBe(false);
    expect(item().querySelector('svg')?.getAttribute('data-prefix')).toBe('far');
  });

  it('adds is-pressed while pressed, leaving aria-current alone', async () => {
    const { fixture, host, item } = await setup();

    host.pressed.set(true);
    await fixture.whenStable();

    expect(item().classList.contains('is-pressed')).toBe(true);
    expect(item().hasAttribute('aria-current')).toBe(false);

    host.current.set(true);
    await fixture.whenStable();
    host.pressed.set(false);
    await fixture.whenStable();

    expect(item().classList.contains('is-pressed')).toBe(false);
    expect(item().getAttribute('aria-current')).toBe('page');
  });

  it('draws a count as the last child of the icon span and names the link with it', async () => {
    const { item, count } = await setup(3);
    const icon = item().querySelector('.asys-nav-item__icon');

    expect(icon?.firstElementChild?.tagName.toLowerCase()).toBe('asys-icon');
    expect(icon?.lastElementChild).toBe(count());
    expect(count()?.tagName).toBe('SPAN');
    expect(count()?.textContent?.trim()).toBe('3');
    expect(count()?.getAttribute('aria-hidden')).toBe('true');
    expect(count()?.classList.contains('asys-count--on-signal')).toBe(false);
    expect(count()?.classList.contains('asys-count--quiet')).toBe(false);
    expect(item().querySelector('.asys-nav-item__label .asys-count')).toBeNull();
    expect(item().getAttribute('aria-label')).toBe('Inbox, 3 waiting');
  });

  it.each([0, null])('shows no count and no aria-label for %s', async (value) => {
    const { item, count } = await setup(value);

    expect(count()).toBeNull();
    expect(item().hasAttribute('aria-label')).toBe(false);
  });

  it('caps the count at 99+ while the name keeps the real number', async () => {
    const { item, count } = await setup(150);

    expect(count()?.textContent?.trim()).toBe('99+');
    expect(item().getAttribute('aria-label')).toBe('Inbox, 150 waiting');
  });

  describe('re-creates the count node only when the count rises from a known number', () => {
    it('gives a new node for 1 to 2', async () => {
      const { count, set } = await setup(1);
      const before = count();

      await set(2);

      expect(count()).not.toBeNull();
      expect(count()).not.toBe(before);
      expect(count()?.textContent?.trim()).toBe('2');
    });

    it('keeps the node for 2 to 1', async () => {
      const { count, set } = await setup(2);
      const before = count();

      await set(1);

      expect(count()).toBe(before);
      expect(count()?.textContent?.trim()).toBe('1');
    });

    it('keeps the node for 2 to 2', async () => {
      const { count, set } = await setup(2);
      const before = count();

      await set(2);

      expect(count()).toBe(before);
    });

    it('renders null to 3 as 3 and keeps the node across a re-render', async () => {
      const { fixture, host, count, set } = await setup(null);

      await set(3);
      const before = count();

      expect(before?.textContent?.trim()).toBe('3');

      host.current.set(true);
      await fixture.whenStable();

      expect(count()).toBe(before);
    });

    it('gives a new node for 3 to 4 after null to 3', async () => {
      const { count, set } = await setup(null);

      await set(3);
      const before = count();
      await set(4);

      expect(count()).not.toBe(before);
      expect(count()?.textContent?.trim()).toBe('4');
    });

    it('renders 0 to 1 as 1', async () => {
      const { count, set } = await setup(0);

      await set(1);

      expect(count()?.textContent?.trim()).toBe('1');
    });
  });
});
