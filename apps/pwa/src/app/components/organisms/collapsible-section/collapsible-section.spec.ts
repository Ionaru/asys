// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconName } from '../../atoms/icon/icon';
import { CollapsibleSection } from './collapsible-section';

@Component({
  imports: [CollapsibleSection],
  template: `
    <section
      asys-collapsible-section
      [icon]="icon"
      [title]="'Waiting'"
      [count]="count()"
      [summary]="summary()"
      [(expanded)]="expanded"
      (expandedChange)="emitted.push($event)"
    >
      <p class="projected">Call the dentist</p>
    </section>
  `,
})
class Host {
  readonly icon = IconName.HourglassHalf;

  readonly count = signal(0);

  readonly summary = signal<string | null>(null);

  readonly expanded = signal(false);

  readonly emitted: boolean[] = [];
}

@Component({
  imports: [CollapsibleSection],
  template: `
    <section asys-collapsible-section [icon]="icon" [title]="'Waiting'"></section>
    <section asys-collapsible-section [icon]="icon" [title]="'Later'"></section>
  `,
})
class TwoHost {
  readonly icon = IconName.HourglassHalf;
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement.querySelector('section');
  const button = (): HTMLButtonElement => root().querySelector('button') as HTMLButtonElement;
  const body = (): HTMLElement =>
    root().querySelector('.asys-collapsible-section__body') as HTMLElement;
  const press = async (): Promise<void> => {
    button().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, root, button, body, press };
};

describe('CollapsibleSection', () => {
  it('renders a section named by the title, holding the header button and then the body', async () => {
    const { root, button, body } = await setup();

    expect(root().tagName).toBe('SECTION');
    expect(root().classList.contains('asys-collapsible-section')).toBe(true);
    expect(root().getAttribute('aria-label')).toBe('Waiting');
    expect(root().hasAttribute('title')).toBe(false);
    expect(root().children).toHaveLength(2);
    expect(root().children[0]).toBe(button());
    expect(button().classList.contains('asys-section-header')).toBe(true);
    expect(root().children[1]).toBe(body());
  });

  it('gives the body an id that the button controls, and a different one per instance', async () => {
    const { button, body } = await setup();

    expect(body().id).not.toBe('');
    expect(button().getAttribute('aria-controls')).toBe(body().id);

    const two = TestBed.createComponent(TwoHost);
    await two.whenStable();
    const sections = Array.from(two.nativeElement.querySelectorAll('section')) as HTMLElement[];
    const bodies = sections.map((s) => s.querySelector('.asys-collapsible-section__body'));
    const buttons = sections.map((s) => s.querySelector('button'));

    expect(bodies[0]?.id).not.toBe(bodies[1]?.id);
    expect(buttons[0]?.getAttribute('aria-controls')).toBe(bodies[0]?.id);
    expect(buttons[1]?.getAttribute('aria-controls')).toBe(bodies[1]?.id);
  });

  it('starts collapsed with the rows projected into the body, never the button', async () => {
    const { fixture, button, body } = await setup();
    const projected = fixture.nativeElement.querySelector('.projected') as HTMLElement;

    expect(body().hidden).toBe(true);
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(body().contains(projected)).toBe(true);
    expect(button().contains(projected)).toBe(false);
  });

  it('toggles on clicks, emitting expandedChange each time', async () => {
    const { host, button, body, press } = await setup();

    await press();

    expect(host.expanded()).toBe(true);
    expect(host.emitted).toEqual([true]);
    expect(body().hidden).toBe(false);
    expect(button().getAttribute('aria-expanded')).toBe('true');

    await press();

    expect(host.emitted).toEqual([true, false]);
    expect(body().hidden).toBe(true);
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });

  it('follows the parent setting expanded, with the projected content still in the body', async () => {
    const { fixture, host, button, body } = await setup();

    host.expanded.set(true);
    await fixture.whenStable();

    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(body().hidden).toBe(false);
    expect(body().contains(fixture.nativeElement.querySelector('.projected'))).toBe(true);
  });

  it('passes the count and the summary to the header and announces no dialog', async () => {
    const { fixture, host, button } = await setup();

    host.count.set(2);
    host.summary.set('Next Available tomorrow 09:00');
    await fixture.whenStable();

    expect(button().querySelector('.asys-section-header__count')?.textContent?.trim()).toBe('2');
    expect(button().querySelector('.asys-section-header__summary')?.textContent?.trim()).toBe(
      'Next Available tomorrow 09:00',
    );
    expect(button().hasAttribute('aria-haspopup')).toBe(false);
  });
});
