// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Icon, IconName, REGULAR_ICONS, SOLID_ICONS } from './icon';

@Component({
  imports: [Icon],
  template: `<asys-icon [name]="name()" [solid]="solid()" [large]="large()" />`,
})
class Host {
  readonly name = signal(IconName.Check);

  readonly solid = signal(false);

  readonly large = signal(false);
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const icon = (): HTMLElement => fixture.nativeElement.querySelector('asys-icon');
  const svg = (): SVGElement | null => icon().querySelector('svg');

  return { fixture, host: fixture.componentInstance, icon, svg };
};

describe('Icon', () => {
  it.each(Object.values(IconName))('maps %s to the Regular glyph of that name', (name) => {
    expect(REGULAR_ICONS[name].prefix).toBe('far');
    expect(REGULAR_ICONS[name].iconName).toBe(name);
  });

  it('has Solid glyphs for the three tabs only, each of the same name', () => {
    expect(Object.keys(SOLID_ICONS).sort()).toEqual(
      [IconName.Bullseye, IconName.CalendarDay, IconName.Inbox].sort(),
    );

    for (const [name, definition] of Object.entries(SOLID_ICONS)) {
      expect(definition?.prefix).toBe('fas');
      expect(definition?.iconName).toBe(name);
    }
  });

  it('renders the named Regular glyph, hidden from screen readers', async () => {
    const { icon, svg } = await setup();

    expect(icon().classList.contains('asys-icon')).toBe(true);
    expect(icon().getAttribute('aria-hidden')).toBe('true');
    expect(svg()?.getAttribute('data-icon')).toBe('check');
    expect(svg()?.getAttribute('data-prefix')).toBe('far');
  });

  it('follows a change of name', async () => {
    const { fixture, host, svg } = await setup();

    host.name.set(IconName.Stopwatch);
    await fixture.whenStable();

    expect(svg()?.getAttribute('data-icon')).toBe('stopwatch');
  });

  it('draws Solid when asked and a Solid glyph exists', async () => {
    const { fixture, host, svg } = await setup();

    host.name.set(IconName.Inbox);
    host.solid.set(true);
    await fixture.whenStable();

    expect(svg()?.getAttribute('data-icon')).toBe('inbox');
    expect(svg()?.getAttribute('data-prefix')).toBe('fas');
  });

  it('falls back to Regular when no Solid glyph exists', async () => {
    const { fixture, host, svg } = await setup();

    host.name.set(IconName.Folder);
    host.solid.set(true);
    await fixture.whenStable();

    expect(svg()?.getAttribute('data-prefix')).toBe('far');
  });

  it('sets the large modifier only when asked', async () => {
    const { fixture, host, icon } = await setup();

    expect(icon().classList.contains('asys-icon--lg')).toBe(false);

    host.large.set(true);
    await fixture.whenStable();

    expect(icon().classList.contains('asys-icon--lg')).toBe(true);
  });
});
