// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconName } from '../icon/icon';
import { SectionHeader } from './section-header';

@Component({
  imports: [SectionHeader],
  template: `
    <asys-section-header
      [icon]="icon()"
      [title]="'Waiting'"
      [count]="count()"
      [summary]="summary()"
      [(expanded)]="expanded"
      (expandedChange)="emitted.push($event)"
    >
      <p class="projected">Call the dentist</p>
    </asys-section-header>
  `,
})
class Host {
  readonly icon = signal(IconName.HourglassHalf);

  readonly count = signal(0);

  readonly summary = signal<string | null>(null);

  readonly expanded = signal(false);

  readonly emitted: boolean[] = [];
}

@Component({
  imports: [SectionHeader],
  template: `
    <asys-section-header [icon]="icon" [title]="'Waiting'" />
    <asys-section-header [icon]="icon" [title]="'Later'" />
  `,
})
class TwoHost {
  readonly icon = IconName.HourglassHalf;
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const section = (): HTMLElement => fixture.nativeElement.querySelector('section.asys-section');
  const button = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('section.asys-section > button.asys-section-header');
  const body = (): HTMLElement =>
    fixture.nativeElement.querySelector('section.asys-section > .asys-section__body');
  const part = (selector: string): HTMLElement | null => button().querySelector(selector);
  const icon = (selector: string): Element | null | undefined =>
    part(selector)?.querySelector('svg[data-icon]');
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, section, button, body, part, icon, press };
};

describe('SectionHeader', () => {
  it('renders a section named by the title, holding the header button and then the body', async () => {
    const { fixture, section, button, body } = await setup();

    expect(section().tagName).toBe('SECTION');
    expect(section().getAttribute('aria-label')).toBe('Waiting');
    expect(section().parentElement?.tagName).toBe('ASYS-SECTION-HEADER');
    expect(section().children).toHaveLength(2);
    expect(section().children[0]).toBe(button());
    expect(section().children[1]).toBe(body());
    expect(fixture.nativeElement.querySelector('asys-section-header')?.hasAttribute('title')).toBe(
      false,
    );
  });

  it('renders a type=button with the title', async () => {
    const { button, part } = await setup();

    expect(button().getAttribute('type')).toBe('button');
    expect(part('.asys-section-header__title')?.textContent?.trim()).toBe('Waiting');
  });

  it('orders the icon, the text and the chevron in the button', async () => {
    const { button } = await setup();
    const parts = [
      'asys-section-header__icon',
      'asys-section-header__text',
      'asys-section-header__chevron',
    ];

    expect(Array.from(button().children, (c) => c.tagName)).toEqual([
      'ASYS-ICON',
      'SPAN',
      'ASYS-ICON',
    ]);
    expect(
      Array.from(button().children, (c) => parts.find((name) => c.classList.contains(name))),
    ).toEqual(parts);
  });

  it('draws the icon of the icon input, hidden from screen readers', async () => {
    const { fixture, host, part, icon } = await setup();

    expect(part('.asys-section-header__icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(icon('.asys-section-header__icon')?.getAttribute('data-icon')).toBe('hourglass-half');

    host.icon.set(IconName.Stopwatch);
    await fixture.whenStable();

    expect(icon('.asys-section-header__icon')?.getAttribute('data-icon')).toBe('stopwatch');
  });

  it('draws a chevron-down chevron, hidden from screen readers, whatever the icon', async () => {
    const { fixture, host, part, icon } = await setup();

    expect(part('.asys-section-header__chevron')?.getAttribute('aria-hidden')).toBe('true');
    expect(icon('.asys-section-header__chevron')?.getAttribute('data-icon')).toBe('chevron-down');

    host.icon.set(IconName.Stopwatch);
    await fixture.whenStable();

    expect(icon('.asys-section-header__chevron')?.getAttribute('data-icon')).toBe('chevron-down');
  });

  it('mirrors the expanded model in aria-expanded', async () => {
    const { fixture, host, button } = await setup();

    expect(button().getAttribute('aria-expanded')).toBe('false');

    host.expanded.set(true);
    await fixture.whenStable();

    expect(button().getAttribute('aria-expanded')).toBe('true');
  });

  it('points aria-controls at the body', async () => {
    const { button, body } = await setup();

    expect(body().id).not.toBe('');
    expect(button().getAttribute('aria-controls')).toBe(body().id);
  });

  it('hides the body while collapsed and shows it while expanded', async () => {
    const { fixture, host, body } = await setup();

    expect(body().hidden).toBe(true);
    expect(body().hasAttribute('hidden')).toBe(true);

    host.expanded.set(true);
    await fixture.whenStable();

    expect(body().hidden).toBe(false);
    expect(body().hasAttribute('hidden')).toBe(false);

    host.expanded.set(false);
    await fixture.whenStable();

    expect(body().hidden).toBe(true);
  });

  it('toggles on a click, emits the new value and writes it back through the two-way binding', async () => {
    const { fixture, host, button, body, press } = await setup();

    await press(button());

    expect(host.expanded()).toBe(true);
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(body().hidden).toBe(false);
    expect(host.emitted).toEqual([true]);

    await press(button());

    expect(host.expanded()).toBe(false);
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(body().hidden).toBe(true);
    expect(host.emitted).toEqual([true, false]);

    // The binding runs the other way as well.
    host.expanded.set(true);
    await fixture.whenStable();

    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(body().hidden).toBe(false);
  });

  it('projects the content into the body, whether it is collapsed or expanded', async () => {
    const { fixture, host, button, body } = await setup();
    const projected = (): HTMLElement | null => fixture.nativeElement.querySelector('.projected');

    expect(projected()?.textContent?.trim()).toBe('Call the dentist');
    expect(projected()?.closest('.asys-section__body')).toBe(body());
    expect(button().querySelector('.projected')).toBeNull();

    host.expanded.set(true);
    await fixture.whenStable();

    expect(projected()?.closest('.asys-section__body')).toBe(body());
    expect(button().querySelector('.projected')).toBeNull();
  });

  it('shows the title with the count inside it, and no count at 0', async () => {
    const { fixture, host, part } = await setup();
    const title = (): HTMLElement | null => part('.asys-section-header__title');

    expect(part('.asys-section-header__count')).toBeNull();
    expect(title()?.textContent?.trim()).toBe('Waiting');

    host.count.set(3);
    await fixture.whenStable();

    const count = part('.asys-section-header__count');

    expect(count?.textContent?.trim()).toBe('3');
    expect(count?.parentElement).toBe(title());
    expect(title()?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/^Waiting\s*3$/);

    host.count.set(0);
    await fixture.whenStable();

    expect(part('.asys-section-header__count')).toBeNull();
    expect(title()?.textContent?.trim()).toBe('Waiting');
  });

  it('shows the summary after the title, and only for a non-empty string', async () => {
    const { fixture, host, part } = await setup();
    const summary = (): HTMLElement | null => part('.asys-section-header__summary');

    expect(summary()).toBeNull();

    host.summary.set('Next Available tomorrow 09:00');
    await fixture.whenStable();

    expect(summary()?.textContent?.trim()).toBe('Next Available tomorrow 09:00');
    expect(summary()?.parentElement).toBe(part('.asys-section-header__text'));
    expect(
      Array.from(part('.asys-section-header__text')?.children ?? [], (c) => c.className),
    ).toEqual(['asys-section-header__title', 'asys-section-header__summary']);

    host.summary.set('');
    await fixture.whenStable();

    expect(summary()).toBeNull();

    host.summary.set('Next Available 15:30');
    await fixture.whenStable();

    expect(summary()?.textContent?.trim()).toBe('Next Available 15:30');

    host.summary.set(null);
    await fixture.whenStable();

    expect(summary()).toBeNull();
    expect(
      Array.from(part('.asys-section-header__text')?.children ?? [], (c) => c.className),
    ).toEqual(['asys-section-header__title']);
  });

  it('keeps the summary and the count apart: the count in the title, the summary beside it', async () => {
    const { fixture, host, part } = await setup();

    host.count.set(2);
    host.summary.set('Next Available tomorrow 09:00');
    await fixture.whenStable();

    expect(part('.asys-section-header__title .asys-section-header__count')).not.toBeNull();
    expect(part('.asys-section-header__title .asys-section-header__summary')).toBeNull();
    expect(part('.asys-section-header__text > .asys-section-header__summary')).not.toBeNull();
  });
});

describe('SectionHeader body ids', () => {
  it('gives each instance its own body id, and aria-controls points at its own body', async () => {
    const fixture = TestBed.createComponent(TwoHost);
    await fixture.whenStable();

    const sections = Array.from<HTMLElement>(
      fixture.nativeElement.querySelectorAll('section.asys-section'),
    );
    const bodies = sections.map((s) => s.querySelector<HTMLElement>('.asys-section__body'));
    const buttons = sections.map((s) => s.querySelector<HTMLButtonElement>('button'));

    expect(sections.map((s) => s.getAttribute('aria-label'))).toEqual(['Waiting', 'Later']);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.id).not.toBe('');
    expect(bodies[1]?.id).not.toBe('');
    expect(bodies[0]?.id).not.toBe(bodies[1]?.id);
    expect(buttons[0]?.getAttribute('aria-controls')).toBe(bodies[0]?.id);
    expect(buttons[1]?.getAttribute('aria-controls')).toBe(bodies[1]?.id);
  });
});
