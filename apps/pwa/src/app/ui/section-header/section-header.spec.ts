// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SectionHeader } from './section-header';

@Component({
  imports: [SectionHeader],
  template: `
    <asys-section-header
      [title]="'Waiting'"
      [count]="count()"
      [(expanded)]="expanded"
      (expandedChange)="emitted.push($event)"
    />
  `,
})
class Host {
  readonly count = signal(0);

  readonly expanded = signal(false);

  readonly emitted: boolean[] = [];
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const button = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button.asys-section-header');

  return { fixture, host: fixture.componentInstance, button };
};

describe('SectionHeader', () => {
  it('renders a type=button with the title and an aria-hidden chevron', async () => {
    const { fixture, button } = await setup();

    expect(button().getAttribute('type')).toBe('button');
    expect(button().querySelector('.asys-section-header__title')?.textContent?.trim()).toBe(
      'Waiting',
    );
    expect(
      button().querySelector('.asys-section-header__chevron')?.getAttribute('aria-hidden'),
    ).toBe('true');
    expect(fixture.nativeElement.querySelector('asys-section-header')?.hasAttribute('title')).toBe(
      false,
    );
  });

  it('mirrors the expanded model in aria-expanded', async () => {
    const { fixture, host, button } = await setup();

    expect(button().getAttribute('aria-expanded')).toBe('false');

    host.expanded.set(true);
    await fixture.whenStable();

    expect(button().getAttribute('aria-expanded')).toBe('true');
  });

  it('toggles on click and emits the new value', async () => {
    const { fixture, host, button } = await setup();

    button().click();
    await fixture.whenStable();

    expect(host.expanded()).toBe(true);
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(host.emitted).toEqual([true]);

    button().click();
    await fixture.whenStable();

    expect(host.expanded()).toBe(false);
    expect(host.emitted).toEqual([true, false]);
  });

  it('omits the count at 0 and shows it above 0', async () => {
    const { fixture, host, button } = await setup();

    expect(button().querySelector('.asys-section-header__count')).toBeNull();

    host.count.set(3);
    await fixture.whenStable();

    expect(button().querySelector('.asys-section-header__count')?.textContent?.trim()).toBe('3');

    host.count.set(0);
    await fixture.whenStable();

    expect(button().querySelector('.asys-section-header__count')).toBeNull();
  });

  it('orders the title, the count and the chevron', async () => {
    const { fixture, host, button } = await setup();

    host.count.set(2);
    await fixture.whenStable();

    const classes = Array.from(button().children).map((c) => c.className);

    expect(classes).toEqual([
      'asys-section-header__title',
      'asys-section-header__count',
      'asys-section-header__chevron',
    ]);
  });
});
