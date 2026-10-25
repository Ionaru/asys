// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DatePicker } from './date-picker';

@Component({
  imports: [DatePicker],
  template: `
    <asys-date-picker
      [today]="today()"
      [value]="value()"
      [removeLabel]="'Remove Due'"
      (pick)="picks.push($event)"
      (remove)="removes.set(removes() + 1)"
    />
  `,
})
class Host {
  readonly today = signal('2026-10-13');

  readonly value = signal<string | null>(null);

  readonly picks: string[] = [];

  readonly removes = signal(0);
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const setup = async (today = '2026-10-13', value: string | null = null) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.today.set(today);
  fixture.componentInstance.value.set(value);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const chips = (): HTMLButtonElement[] =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.asys-date-picker__chips > button'));
  const calendar = (): HTMLElement =>
    root().querySelector('.asys-date-picker__calendar') as HTMLElement;
  const days = (): HTMLButtonElement[] =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('button.asys-date-picker__day'));
  const input = (): HTMLInputElement =>
    root().querySelector('.asys-date-picker__other input') as HTMLInputElement;
  const remove = (): HTMLButtonElement | null =>
    root().querySelector<HTMLButtonElement>('button.asys-date-picker__remove');
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };
  const change = async (text: string): Promise<void> => {
    input().value = text;
    input().dispatchEvent(new Event('change'));
    await fixture.whenStable();
  };

  return {
    fixture,
    host: fixture.componentInstance,
    root,
    chips,
    calendar,
    days,
    input,
    remove,
    press,
    change,
  };
};

describe('DatePicker', () => {
  describe('quick dates', () => {
    it('labels the group and shows three chips', async () => {
      const { root, chips } = await setup();

      expect(root().querySelector('.asys-date-picker__chips')?.getAttribute('role')).toBe('group');
      expect(root().querySelector('.asys-date-picker__chips')?.getAttribute('aria-label')).toBe(
        'Quick dates',
      );
      expect(chips().every((b) => b.getAttribute('type') === 'button')).toBe(true);
      expect(chips()).toHaveLength(3);
    });

    it.each([
      ['2026-10-13', 'a Tuesday', ['Today', 'Tomorrow', 'Mon 19 Oct'], '2026-10-19'],
      ['2026-10-17', 'a Saturday', ['Today', 'Tomorrow', 'Mon 19 Oct'], '2026-10-19'],
      ['2026-10-18', 'a Sunday', ['Today', 'Tomorrow', 'Mon 26 Oct'], '2026-10-26'],
      ['2026-10-19', 'a Monday', ['Today', 'Tomorrow', 'Mon 26 Oct'], '2026-10-26'],
    ])('with today %s (%s) shows %j', async (today, _day, labels, third) => {
      const { chips, press, host } = await setup(today);

      expect(chips().map((b) => squash(b.textContent))).toEqual(labels);

      await press(chips()[2]);

      expect(host.picks).toEqual([third]);
    });

    it('emits today and tomorrow from the first two chips', async () => {
      const { chips, press, host } = await setup('2026-10-13');

      await press(chips()[0]);
      await press(chips()[1]);

      expect(host.picks).toEqual(['2026-10-13', '2026-10-14']);
    });

    it('presses the chip equal to the value only', async () => {
      const { chips } = await setup('2026-10-13', '2026-10-14');

      expect(chips().map((b) => b.getAttribute('aria-pressed'))).toEqual([
        'false',
        'true',
        'false',
      ]);
    });

    it('presses no chip without a value', async () => {
      const { chips } = await setup();

      expect(chips().map((b) => b.getAttribute('aria-pressed'))).toEqual([
        'false',
        'false',
        'false',
      ]);
    });
  });

  describe('calendar', () => {
    it('is a labelled group of seven weekday headers and 14 days', async () => {
      const { calendar, days } = await setup();
      const dow = Array.from(calendar().querySelectorAll('span.asys-date-picker__dow'));

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
    });

    it('runs from the Monday of the week, showing the day of the month', async () => {
      const { days } = await setup();

      expect(days().map((b) => squash(b.textContent))).toEqual([
        '12',
        '13',
        '14',
        '15',
        '16',
        '17',
        '18',
        '19',
        '20',
        '21',
        '22',
        '23',
        '24',
        '25',
      ]);
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
      expect(days().filter((b) => b.classList.contains('asys-date-picker__day--today'))).toEqual([
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
    });

    it('runs into the next month and year, with the year where it differs', async () => {
      const { calendar, days, chips } = await setup('2026-12-30');

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
      expect(chips().map((b) => squash(b.textContent))).toEqual([
        'Today',
        'Tomorrow',
        'Mon 4 Jan 2027',
      ]);
    });

    it('emits a date in the next year', async () => {
      const { days, press, host } = await setup('2026-12-30');

      await press(days()[4]);

      expect(host.picks).toEqual(['2027-01-01']);
    });
  });

  describe('Other date', () => {
    it('draws the label and input with the shared field classes', async () => {
      const { input } = await setup();

      expect(input().classList.contains('asys-input')).toBe(true);
      expect(input().labels?.[0]?.classList.contains('asys-label')).toBe(true);
    });

    it('renders a labelled date input with today as its minimum', async () => {
      const { input } = await setup();

      expect(input().getAttribute('type')).toBe('date');
      expect(input().getAttribute('min')).toBe('2026-10-13');
      expect(Array.from(input().labels ?? []).map((l) => l.textContent?.trim())).toEqual([
        'Other date',
      ]);
    });

    it('shows the value, or nothing without one', async () => {
      const without = await setup();

      expect(without.input().value).toBe('');

      const withValue = await setup('2026-10-13', '2026-11-02');

      expect(withValue.input().value).toBe('2026-11-02');
    });

    it('gives each instance its own id', async () => {
      const a = await setup();
      const b = await setup();

      expect(a.input().id).not.toBe('');
      expect(a.input().id).not.toBe(b.input().id);
    });

    it.each(['2026-11-02', '2026-10-13'])('emits %s on change', async (date) => {
      const { change, host } = await setup();

      await change(date);

      expect(host.picks).toEqual([date]);
    });

    it.each(['2026-10-12', '2025-01-01', ''])('emits nothing on change with %j', async (text) => {
      const { change, host } = await setup();

      await change(text);

      expect(host.picks).toEqual([]);
    });

    // jsdom sanitises an invalid type=date value to '', so the getter is overridden to
    // reach the LocalDate guard with the raw text.
    it.each(['2026-02-30', '2026-10'])(
      'emits nothing and shows no error for the unparsable text %j',
      async (text) => {
        const { fixture, input, root, host } = await setup();

        Object.defineProperty(input(), 'value', { configurable: true, get: () => text });
        input().dispatchEvent(new Event('change'));
        await fixture.whenStable();

        expect(host.picks).toEqual([]);
        expect(root().querySelector('p[asys-field-error]')).toBeNull();
        expect(input().getAttribute('aria-invalid')).toBeNull();
      },
    );

    it('says why a past date was not taken', async () => {
      const { root, input, change, host } = await setup();

      await change('2026-10-12');

      const message = root().querySelector('p[asys-field-error]') as HTMLElement;

      expect(host.picks).toEqual([]);
      expect(squash(message.textContent)).toContain('Pick today or a later date.');
      expect(message.id).not.toBe('');
      expect(input().getAttribute('aria-invalid')).toBe('true');
      expect(input().getAttribute('aria-describedby')).toBe(message.id);
    });

    it('gives each instance its own error paragraph id', async () => {
      const a = await setup();
      const b = await setup();

      await a.change('2026-10-12');
      await b.change('2026-10-12');

      const idA = a.root().querySelector('p[asys-field-error]')?.id;
      const idB = b.root().querySelector('p[asys-field-error]')?.id;

      expect(idA).toBeTruthy();
      expect(idA).not.toBe(idB);
    });

    it('clears the error on a later valid chip', async () => {
      const { root, input, change, chips, press, host } = await setup();

      await change('2026-10-12');

      expect(root().querySelector('p[asys-field-error]')).not.toBeNull();

      await press(chips()[0]);

      expect(root().querySelector('p[asys-field-error]')).toBeNull();
      expect(input().getAttribute('aria-invalid')).toBeNull();
      expect(host.picks).toEqual(['2026-10-13']);
    });

    it('clears the error on a later valid day', async () => {
      const { root, change, days, press } = await setup();

      await change('2026-10-12');
      await press(days()[3]);

      expect(root().querySelector('p[asys-field-error]')).toBeNull();
    });

    it('clears the error on a later valid Other date', async () => {
      const { root, change, host } = await setup();

      await change('2026-10-12');
      await change('2026-11-02');

      expect(root().querySelector('p[asys-field-error]')).toBeNull();
      expect(host.picks).toEqual(['2026-11-02']);
    });

    it('clears the error when the input is emptied', async () => {
      const { root, change, host } = await setup();

      await change('2026-10-12');
      await change('');

      expect(root().querySelector('p[asys-field-error]')).toBeNull();
      expect(host.picks).toEqual([]);
    });

    it('emits nothing on input, only on change', async () => {
      const { input, fixture, host } = await setup();

      input().value = '2026-11-02';
      input().dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();

      expect(host.picks).toEqual([]);
    });
  });

  describe('Remove', () => {
    it('is absent without a value', async () => {
      const { remove } = await setup();

      expect(remove()).toBeNull();
    });

    it('shows the remove label with a value and emits remove', async () => {
      const { remove, press, host } = await setup('2026-10-13', '2026-10-15');

      expect(remove()?.getAttribute('type')).toBe('button');
      expect(squash(remove()?.textContent)).toBe('Remove Due');

      await press(remove() as HTMLButtonElement);

      expect(host.removes()).toBe(1);
      expect(host.picks).toEqual([]);
    });

    it('appears and disappears with the value', async () => {
      const { fixture, host, remove } = await setup();

      host.value.set('2026-10-15');
      await fixture.whenStable();

      expect(remove()).not.toBeNull();

      host.value.set(null);
      await fixture.whenStable();

      expect(remove()).toBeNull();
    });
  });
});
