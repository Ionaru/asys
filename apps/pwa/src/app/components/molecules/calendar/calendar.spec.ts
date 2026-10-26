// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Calendar } from './calendar';

@Component({
  imports: [Calendar],
  template: `
    <div asys-calendar [today]="today()" [value]="value()" (pick)="picks.push($event)"></div>
  `,
})
class Host {
  readonly today = signal('2026-10-13');

  readonly value = signal<string | null>(null);

  readonly picks: string[] = [];
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const setup = async (today = '2026-10-13', value: string | null = null) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.today.set(today);
  fixture.componentInstance.value.set(value);
  await fixture.whenStable();

  const calendar = (): HTMLElement => fixture.nativeElement.querySelector('div[asys-calendar]');
  const days = (): HTMLButtonElement[] =>
    Array.from(calendar().querySelectorAll<HTMLButtonElement>('button.asys-calendar__day'));
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, calendar, days, press };
};

describe('Calendar', () => {
  it('is a labelled group of seven weekday headers and 14 days', async () => {
    const { calendar, days } = await setup();
    const dow = Array.from(calendar().querySelectorAll('span.asys-calendar__dow'));

    expect(calendar().tagName).toBe('DIV');
    expect(calendar().classList.contains('asys-calendar')).toBe(true);
    expect(calendar().getAttribute('role')).toBe('group');
    expect(calendar().getAttribute('aria-label')).toBe('Days from Mon 12 Oct to Sun 25 Oct');
    expect(dow.map((s) => s.textContent?.trim())).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
    expect(dow.every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(days()).toHaveLength(14);
    expect(days().every((b) => b.getAttribute('type') === 'button')).toBe(true);
    expect(days().every((b) => b.classList.contains('asys-num'))).toBe(true);
  });

  it('runs from the Monday of the week, showing the day of the month', async () => {
    const { days } = await setup();

    expect(days().map((b) => squash(b.textContent))).toEqual(
      Array.from({ length: 14 }, (_, i) => String(12 + i)),
    );
  });

  it('starts on the Monday when today is a Sunday', async () => {
    const { calendar, days } = await setup('2026-10-18');

    expect(squash(days()[0].textContent)).toBe('12');
    expect(calendar().getAttribute('aria-label')).toBe('Days from Mon 12 Oct to Sun 25 Oct');
  });

  it('labels each day, with Today prefixed for today', async () => {
    const { days } = await setup();

    expect(days()[0].getAttribute('aria-label')).toBe('Mon 12 Oct');
    expect(days()[1].getAttribute('aria-label')).toBe('Today, Tue 13 Oct');
    expect(days()[3].getAttribute('aria-label')).toBe('Thu 15 Oct');
  });

  it('marks today alone as the current date', async () => {
    const { days } = await setup();

    expect(days().filter((b) => b.getAttribute('aria-current') === 'date')).toEqual([days()[1]]);
    expect(days().filter((b) => b.classList.contains('asys-calendar__day--today'))).toEqual([
      days()[1],
    ]);
  });

  it('disables the days before today only', async () => {
    const { days } = await setup();

    expect(days().map((b) => b.disabled)).toEqual([
      true,
      ...Array.from({ length: 13 }, () => false),
    ]);
  });

  it('disables the whole first week up to today when today is a Sunday', async () => {
    const { days } = await setup('2026-10-18');

    expect(days().map((b) => b.disabled)).toEqual([
      ...Array.from({ length: 6 }, () => true),
      ...Array.from({ length: 8 }, () => false),
    ]);
  });

  it('emits the date of an enabled day, today included', async () => {
    const { days, press, host } = await setup();

    await press(days()[3]);
    await press(days()[1]);

    expect(host.picks).toEqual(['2026-10-15', '2026-10-13']);
  });

  it('emits nothing for a disabled day', async () => {
    const { fixture, days, host } = await setup();

    days()[0].click();
    await fixture.whenStable();

    expect(host.picks).toEqual([]);
  });

  it('presses the day equal to the value only', async () => {
    const { days } = await setup('2026-10-13', '2026-10-15');

    expect(days().map((b) => b.getAttribute('aria-pressed'))).toEqual(
      Array.from({ length: 14 }, (_, i) => (i === 3 ? 'true' : 'false')),
    );
  });

  it('follows the value when it changes', async () => {
    const { fixture, host, days } = await setup('2026-10-13', '2026-10-15');

    host.value.set('2026-10-20');
    await fixture.whenStable();

    expect(days().filter((b) => b.getAttribute('aria-pressed') === 'true')).toEqual([days()[8]]);

    host.value.set(null);
    await fixture.whenStable();

    expect(days().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
  });

  it('runs into the next month and year, with the year where it differs', async () => {
    const { calendar, days } = await setup('2026-12-30');

    expect(calendar().getAttribute('aria-label')).toBe('Days from Mon 28 Dec to Sun 10 Jan 2027');
    expect(days().map((b) => squash(b.textContent))).toEqual([
      '28',
      '29',
      '30',
      '31',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    expect(days()[2].getAttribute('aria-label')).toBe('Today, Wed 30 Dec');
    expect(days()[4].getAttribute('aria-label')).toBe('Fri 1 Jan 2027');
  });

  it('emits a date in the next year', async () => {
    const { days, press, host } = await setup('2026-12-30');

    await press(days()[4]);

    expect(host.picks).toEqual(['2027-01-01']);
  });
});
