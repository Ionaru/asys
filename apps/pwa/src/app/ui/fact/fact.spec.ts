// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconName } from '../icon/icon';
import { Fact } from './fact';

@Component({
  imports: [Fact],
  template: `
    <ul class="asys-facts">
      <li asys-fact id="first" [icon]="icon()" [label]="label()" [strong]="strong()">10 min</li>
      <li asys-fact id="second" [icon]="IconName.CalendarDay" label="Due:">
        <span class="asys-num">3</span> Oct
      </li>
    </ul>
  `,
})
class Host {
  protected readonly IconName = IconName;

  readonly icon = signal(IconName.Stopwatch);

  readonly label = signal('Estimate:');

  readonly strong = signal(false);
}

const collapsed = (el: Element | null | undefined): string | undefined =>
  el?.textContent?.replace(/\s+/g, ' ').trim();

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const fact = (id = 'first'): HTMLElement => fixture.nativeElement.querySelector(`#${id}`);
  const glyph = (id = 'first'): string | null | undefined =>
    fact(id).querySelector('svg[data-icon]')?.getAttribute('data-icon');

  return { fixture, host: fixture.componentInstance, fact, glyph };
};

describe('Fact', () => {
  it('works on a list item with exactly the class asys-fact by default', async () => {
    const { fact } = await setup();

    expect(fact().tagName).toBe('LI');
    expect(fact().parentElement?.tagName).toBe('UL');
    expect(Array.from(fact().classList)).toEqual(['asys-fact']);
  });

  it('adds asys-fact--strong only when strong', async () => {
    const { fixture, host, fact } = await setup();

    expect(fact().classList.contains('asys-fact--strong')).toBe(false);

    host.strong.set(true);
    await fixture.whenStable();

    expect(Array.from(fact().classList).sort()).toEqual(['asys-fact', 'asys-fact--strong']);
    expect(fact('second').classList.contains('asys-fact--strong')).toBe(false);

    host.strong.set(false);
    await fixture.whenStable();

    expect(fact().classList.contains('asys-fact--strong')).toBe(false);
  });

  it('renders the icon first', async () => {
    const { fact, glyph } = await setup();

    expect(fact().firstElementChild?.tagName.toLowerCase()).toBe('asys-icon');
    expect(fact().querySelectorAll('svg[data-icon]').length).toBe(1);
    expect(glyph()).toBe('stopwatch');
    expect(glyph('second')).toBe('calendar-day');
  });

  it('follows a change of icon', async () => {
    const { fixture, host, glyph } = await setup();

    host.icon.set(IconName.Folder);
    await fixture.whenStable();

    expect(glyph()).toBe('folder');
  });

  it('puts the label in a visually hidden span after the icon', async () => {
    const { fixture, host, fact } = await setup();

    const hidden = fact().querySelectorAll('.asys-visually-hidden');

    expect(hidden.length).toBe(1);
    expect(hidden[0].tagName).toBe('SPAN');
    expect(hidden[0].textContent?.trim()).toBe('Estimate:');
    expect(hidden[0].previousElementSibling).toBe(fact().querySelector('asys-icon'));

    host.label.set('Left:');
    await fixture.whenStable();

    expect(fact().querySelector('.asys-visually-hidden')?.textContent?.trim()).toBe('Left:');
  });

  it('projects the value after the hidden label with no added space', async () => {
    const { fact } = await setup();

    expect(fact().textContent?.trim()).toBe('Estimate:10 min');
  });

  it('projects markup as the value too', async () => {
    const { fact } = await setup();

    const value = fact('second').querySelector('.asys-num');

    expect(value?.textContent).toBe('3');
    expect(value?.previousElementSibling?.classList.contains('asys-visually-hidden')).toBe(true);
    expect(collapsed(fact('second'))).toBe('Due:3 Oct');
  });
});
