// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { DateSpec } from '@asys/domain';

import { DateRow } from './date-row';

@Component({
  imports: [DateRow],
  template: `
    <div
      asys-date-row
      label="Due"
      [noneLabel]="noneLabel()"
      [timePrefix]="timePrefix()"
      [today]="today"
      [value]="value()"
      [disabled]="disabled()"
      [describedBy]="describedBy()"
      (openDate)="events.push('openDate')"
      (openTime)="events.push('openTime')"
      (dayBlur)="events.push('dayBlur')"
    ></div>
  `,
})
class Host {
  readonly row = viewChild.required(DateRow);

  readonly today = '2026-10-13';

  readonly noneLabel = signal('None');

  readonly timePrefix = signal('Due at');

  readonly value = signal<DateSpec | null>(null);

  readonly disabled = signal(false);

  readonly describedBy = signal<string | null>(null);

  readonly events: string[] = [];
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const setup = async (value: DateSpec | null = null) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.value.set(value);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const hostEl = (): HTMLElement => root().querySelector('div[asys-date-row]') as HTMLElement;
  const day = (): HTMLButtonElement =>
    root().querySelector('button.asys-date-row__open') as HTMLButtonElement;
  const time = (): HTMLButtonElement | null =>
    root().querySelector<HTMLButtonElement>('button.asys-date-row__time');
  const dayValue = (): HTMLElement => day().querySelector('.asys-field-row__value') as HTMLElement;
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };

  return { fixture, host, hostEl, day, time, dayValue, press };
};

describe('DateRow', () => {
  describe('the day button', () => {
    it('is the first child of the host, which has the row class', async () => {
      const { hostEl, day } = await setup();

      expect(hostEl().classList.contains('asys-date-row')).toBe(true);
      expect(hostEl().firstElementChild).toBe(day());
      expect(day().classList.contains('asys-field-row')).toBe(true);
      expect(day().getAttribute('type')).toBe('button');
      expect(day().getAttribute('aria-haspopup')).toBe('dialog');
      expect(squash(day().querySelector('.asys-field-row__label')?.textContent)).toBe('Due');
    });

    it('shows the none label and no time button while there is no value', async () => {
      const { day, dayValue, time } = await setup();

      expect(squash(dayValue().textContent)).toBe('None');
      expect(dayValue().classList.contains('asys-field-row__value--set')).toBe(false);
      expect(day()).not.toBeNull();
      expect(time()).toBeNull();
    });

    it.each([
      ['2026-10-14', 'Tomorrow'],
      ['2026-10-19', 'Mon 19 Oct'],
      ['2026-10-13', 'Today'],
    ])('shows %s as %s and marks the value as set', async (date, text) => {
      const { dayValue } = await setup({ date });

      expect(squash(dayValue().textContent)).toBe(text);
      expect(dayValue().classList.contains('asys-field-row__value--set')).toBe(true);
    });

    it('uses the none label it is given', async () => {
      const { fixture, host, dayValue } = await setup();

      host.noneLabel.set('Any time');
      await fixture.whenStable();

      expect(squash(dayValue().textContent)).toBe('Any time');
    });
  });

  describe('the time button', () => {
    it('offers to add a time when the value has a date only', async () => {
      const { time } = await setup({ date: '2026-10-14' });
      const button = time() as HTMLButtonElement;

      expect(button.getAttribute('type')).toBe('button');
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
      expect(button.getAttribute('aria-label')).toBe('Add a time to Due');
      expect(button.querySelectorAll('asys-icon')).toHaveLength(1);
      expect(button.querySelector('svg')?.getAttribute('data-icon')).toBe('clock');
      expect(squash(button.textContent)).toBe('');
      expect(button.classList.contains('asys-date-row__time--set')).toBe(false);
    });

    it('shows the time and names it when the value has one', async () => {
      const { time } = await setup({ date: '2026-10-14', time: '17:00' });
      const button = time() as HTMLButtonElement;

      expect(button.getAttribute('aria-label')).toBe('Due at 17:00, change time');
      expect(squash(button.textContent)).toBe('17:00');
      expect(button.classList.contains('asys-date-row__time--set')).toBe(true);
      expect(button.classList.contains('asys-num')).toBe(true);
    });

    it('uses the time prefix it is given', async () => {
      const { fixture, host, time } = await setup({ date: '2026-10-19', time: '09:00' });

      host.timePrefix.set('Available from');
      await fixture.whenStable();

      expect(time()?.getAttribute('aria-label')).toBe('Available from 09:00, change time');
    });

    it('disappears when the value becomes null', async () => {
      const { fixture, host, time } = await setup({ date: '2026-10-14' });

      expect(time()).not.toBeNull();

      host.value.set(null);
      await fixture.whenStable();

      expect(time()).toBeNull();
    });
  });

  describe('outputs', () => {
    it('emits openDate once for a press on the day button, and nothing else', async () => {
      const { host, day, press } = await setup({ date: '2026-10-14' });

      await press(day());

      expect(host.events).toEqual(['openDate']);
    });

    it('emits openTime once for a press on the time button, and nothing else', async () => {
      const { host, time, press } = await setup({ date: '2026-10-14' });

      await press(time() as HTMLButtonElement);

      expect(host.events).toEqual(['openTime']);
    });

    it('emits dayBlur once when the day button loses focus', async () => {
      const { host, day } = await setup({ date: '2026-10-14' });

      day().dispatchEvent(new Event('blur'));

      expect(host.events).toEqual(['dayBlur']);
    });

    it('emits nothing when the time button loses focus', async () => {
      const { host, time } = await setup({ date: '2026-10-14' });

      (time() as HTMLButtonElement).dispatchEvent(new Event('blur'));

      expect(host.events).toEqual([]);
    });
  });

  describe('disabled', () => {
    it('disables both buttons and emits nothing on a click', async () => {
      const { fixture, host, day, time } = await setup({ date: '2026-10-14' });

      host.disabled.set(true);
      await fixture.whenStable();

      expect(day().disabled).toBe(true);
      expect((time() as HTMLButtonElement).disabled).toBe(true);

      day().click();
      (time() as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(host.events).toEqual([]);
    });
  });

  describe('describedBy', () => {
    it('sets aria-describedby on the day button only', async () => {
      const { fixture, host, day, time } = await setup({ date: '2026-10-14' });

      host.describedBy.set('m-1');
      await fixture.whenStable();

      expect(day().getAttribute('aria-describedby')).toBe('m-1');
      expect(time()?.hasAttribute('aria-describedby')).toBe(false);
    });

    it('sets no aria-describedby while it is null', async () => {
      const { day, time } = await setup({ date: '2026-10-14' });

      expect(day().hasAttribute('aria-describedby')).toBe(false);
      expect(time()?.hasAttribute('aria-describedby')).toBe(false);
    });
  });

  describe('focus', () => {
    it('focuses the day button', async () => {
      const { fixture, host, day } = await setup();

      document.body.appendChild(fixture.nativeElement);
      host.row().focus();

      expect(document.activeElement).toBe(day());

      fixture.nativeElement.remove();
    });
  });
});
