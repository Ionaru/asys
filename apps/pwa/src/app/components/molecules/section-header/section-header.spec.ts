// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconName } from '../../atoms/icon/icon';
import { SectionHeader, SectionHeaderAction } from './section-header';

@Component({
  imports: [SectionHeader],
  template: `
    <button
      asys-section-header
      [icon]="icon()"
      [title]="'Waiting'"
      [count]="count()"
      [summary]="summary()"
      [action]="action()"
      [trailingIcon]="trailingIcon()"
      [expanded]="expanded()"
      [controls]="controls()"
      (click)="clicks = clicks + 1"
    ></button>
  `,
})
class Host {
  readonly icon = signal(IconName.HourglassHalf);

  readonly count = signal(0);

  readonly summary = signal<string | null>(null);

  readonly action = signal(SectionHeaderAction.Expand);

  readonly trailingIcon = signal(IconName.ChevronDown);

  readonly expanded = signal(false);

  readonly controls = signal<string | null>('waiting-rows');

  clicks = 0;
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('button');
  const part = (selector: string): HTMLElement | null => button().querySelector(selector);
  const icon = (selector: string): Element | null | undefined =>
    part(selector)?.querySelector('svg[data-icon]');
  const title = (): string =>
    (part('.asys-section-header__title')?.textContent ?? '').replace(/\s+/g, ' ').trim();

  return { fixture, host: fixture.componentInstance, button, part, icon, title };
};

@Component({
  imports: [SectionHeader],
  template: `<button asys-section-header [icon]="icon" [title]="'Waiting'"></button>`,
})
class DefaultsHost {
  readonly icon = IconName.HourglassHalf;
}

describe('SectionHeader', () => {
  it('draws a chevron-down at the end when no trailing icon is given', async () => {
    const fixture = TestBed.createComponent(DefaultsHost);
    await fixture.whenStable();
    const chevron = fixture.nativeElement.querySelector('.asys-section-header__chevron');

    expect(chevron?.querySelector('svg[data-icon]')?.getAttribute('data-icon')).toBe(
      'chevron-down',
    );
  });

  it('is the button itself, with type=button, no title attribute and its parts in order', async () => {
    const { button } = await setup();
    const parts = [
      'asys-section-header__icon',
      'asys-section-header__text',
      'asys-section-header__chevron',
    ];

    expect(button().classList.contains('asys-section-header')).toBe(true);
    expect(button().getAttribute('type')).toBe('button');
    expect(button().hasAttribute('title')).toBe(false);
    expect(Array.from(button().children, (c) => c.tagName)).toEqual([
      'ASYS-ICON',
      'SPAN',
      'ASYS-ICON',
    ]);
    expect(
      Array.from(button().children, (c) => parts.find((name) => c.classList.contains(name))),
    ).toEqual(parts);
    expect(button().children[0].getAttribute('aria-hidden')).toBe('true');
    expect(button().children[2].getAttribute('aria-hidden')).toBe('true');
  });

  it('draws the icon of the icon input and a chevron-down chevron whatever the icon', async () => {
    const { fixture, host, icon } = await setup();

    expect(icon('.asys-section-header__icon')?.getAttribute('data-icon')).toBe('hourglass-half');
    expect(icon('.asys-section-header__chevron')?.getAttribute('data-icon')).toBe('chevron-down');

    host.icon.set(IconName.Stopwatch);
    await fixture.whenStable();

    expect(icon('.asys-section-header__icon')?.getAttribute('data-icon')).toBe('stopwatch');
    expect(icon('.asys-section-header__chevron')?.getAttribute('data-icon')).toBe('chevron-down');
  });

  it('draws the trailing icon input at the end of the button instead of the chevron', async () => {
    const { fixture, host, button } = await setup();

    host.trailingIcon.set(IconName.Plus);
    await fixture.whenStable();
    const last = button().lastElementChild as HTMLElement;

    expect(last.querySelector('svg[data-icon]')?.getAttribute('data-icon')).toBe('plus');
    expect(button().querySelector('svg[data-icon="chevron-down"]')).toBeNull();
  });

  it('shows the title and no count while the count is 0', async () => {
    const { button, title } = await setup();

    expect(button().querySelector('.asys-section-header__count')).toBeNull();
    expect(title()).toBe('Waiting');
  });

  it('shows a quiet Count inside the title when there is a count, capped at 99+', async () => {
    const { fixture, host, button, title } = await setup();

    host.count.set(3);
    await fixture.whenStable();
    const count = button().querySelector('span.asys-section-header__count') as HTMLElement;

    expect(count.classList.contains('asys-count')).toBe(true);
    expect(count.classList.contains('asys-count--quiet')).toBe(true);
    expect(count.textContent?.trim()).toBe('3');
    expect(count.parentElement?.classList.contains('asys-section-header__title')).toBe(true);
    expect(title()).toBe('Waiting 3');

    host.count.set(120);
    await fixture.whenStable();

    expect(button().querySelector('.asys-section-header__count')?.textContent?.trim()).toBe('99+');
  });

  it('adds the summary after the title only when it is not empty', async () => {
    const { fixture, host, part } = await setup();
    const classes = () =>
      Array.from(part('.asys-section-header__text')?.children ?? [], (c) => c.className);

    host.summary.set('Next Available tomorrow 09:00');
    await fixture.whenStable();

    expect(classes()).toEqual(['asys-section-header__title', 'asys-section-header__summary']);
    expect(part('.asys-section-header__summary')?.textContent?.trim()).toBe(
      'Next Available tomorrow 09:00',
    );

    host.summary.set('');
    await fixture.whenStable();

    expect(classes()).toEqual(['asys-section-header__title']);

    host.summary.set(null);
    await fixture.whenStable();

    expect(classes()).toEqual(['asys-section-header__title']);
  });

  it('mirrors expanded and controls in aria-expanded and aria-controls in Expand', async () => {
    const { fixture, host, button } = await setup();

    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(button().getAttribute('aria-controls')).toBe('waiting-rows');
    expect(button().hasAttribute('aria-haspopup')).toBe(false);

    host.expanded.set(true);
    await fixture.whenStable();

    expect(button().getAttribute('aria-expanded')).toBe('true');

    host.controls.set(null);
    await fixture.whenStable();

    expect(button().hasAttribute('aria-controls')).toBe(false);
  });

  it('announces a dialog and no expanded state or controls in Open', async () => {
    const { fixture, host, button } = await setup();

    host.action.set(SectionHeaderAction.Open);
    host.expanded.set(true);
    host.controls.set('x');
    await fixture.whenStable();

    expect(button().getAttribute('aria-haspopup')).toBe('dialog');
    expect(button().hasAttribute('aria-expanded')).toBe(false);
    expect(button().hasAttribute('aria-controls')).toBe(false);
  });

  it('is stateless: a click reaches the parent handler and leaves aria-expanded alone', async () => {
    const { fixture, host, button } = await setup();

    button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();

    expect(host.clicks).toBe(1);
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });
});
