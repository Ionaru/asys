// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TimePicker } from './time-picker';

@Component({
  imports: [TimePicker],
  template: `
    <asys-time-picker
      [value]="value()"
      [context]="context()"
      (pick)="picks.push($event)"
      (remove)="removes.set(removes() + 1)"
    />
  `,
})
class Host {
  readonly value = signal<string | null>(null);

  readonly context = signal('');

  readonly picks: string[] = [];

  readonly removes = signal(0);
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const setup = async (value: string | null = null, context = '') => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.value.set(value);
  fixture.componentInstance.context.set(context);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const chips = (): HTMLButtonElement[] =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('.asys-time-picker__chips > button'));
  const input = (): HTMLInputElement =>
    root().querySelector('input[type="time"]') as HTMLInputElement;
  const contextLine = (): HTMLElement | null => root().querySelector('p.asys-time-picker__context');
  const remove = (): HTMLButtonElement | null =>
    Array.from(root().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => squash(b.textContent) === 'Remove time',
    ) ?? null;
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
    input,
    contextLine,
    remove,
    press,
    change,
  };
};

describe('TimePicker', () => {
  describe('chips', () => {
    it('renders the six times in order in a labelled group', async () => {
      const { root, chips } = await setup();

      expect(root().querySelector('.asys-time-picker__chips')?.getAttribute('role')).toBe('group');
      expect(root().querySelector('.asys-time-picker__chips')?.getAttribute('aria-label')).toBe(
        'Times',
      );
      expect(chips().every((b) => b.getAttribute('type') === 'button')).toBe(true);
      expect(chips().map((b) => squash(b.textContent))).toEqual([
        '09:00',
        '10:00',
        '12:00',
        '14:00',
        '17:00',
        '18:00',
      ]);
    });

    it('presses the chip equal to the value only', async () => {
      const { chips } = await setup('14:00');

      expect(chips().map((b) => b.getAttribute('aria-pressed'))).toEqual([
        'false',
        'false',
        'false',
        'true',
        'false',
        'false',
      ]);
    });

    it('presses no chip for a value that is not a chip, or without a value', async () => {
      const custom = await setup('17:30');

      expect(custom.chips().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);

      const none = await setup();

      expect(none.chips().every((b) => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    });

    it('emits the time of a clicked chip', async () => {
      const { chips, press, host } = await setup();

      await press(chips()[0]);
      await press(chips()[5]);

      expect(host.picks).toEqual(['09:00', '18:00']);
    });
  });

  describe('Other time', () => {
    it('renders a labelled time input showing the value', async () => {
      const { input } = await setup('17:30');

      expect(Array.from(input().labels ?? []).map((l) => l.textContent?.trim())).toEqual([
        'Other time',
      ]);
      expect(input().value).toBe('17:30');
    });

    it('draws the label and input with the shared field classes', async () => {
      const { input } = await setup('17:30');

      expect(input().classList.contains('asys-input')).toBe(true);
      expect(input().classList.contains('asys-num')).toBe(true);
      expect(input().labels?.[0]?.classList.contains('asys-label')).toBe(true);
    });

    it('shows an empty input without a value', async () => {
      const { input } = await setup();

      expect(input().value).toBe('');
    });

    it('emits the time on change', async () => {
      const { change, host } = await setup();

      await change('17:30');

      expect(host.picks).toEqual(['17:30']);
    });

    it('drops the seconds', async () => {
      const { change, host } = await setup();

      await change('17:30:15');

      expect(host.picks).toEqual(['17:30']);
    });

    it('emits nothing when cleared', async () => {
      const { change, host } = await setup('17:30');

      await change('');

      expect(host.picks).toEqual([]);
    });

    it('emits nothing on input, only on change', async () => {
      const { input, fixture, host } = await setup();

      input().value = '17:30';
      input().dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();

      expect(host.picks).toEqual([]);
    });
  });

  describe('context line', () => {
    it('is absent when the context is empty', async () => {
      const { contextLine } = await setup('09:00', '');

      expect(contextLine()).toBeNull();
    });

    it('shows the context text and follows it', async () => {
      const { fixture, host, contextLine } = await setup(null, 'Due tomorrow');

      expect(squash(contextLine()?.textContent)).toBe('Due tomorrow');

      host.context.set('');
      await fixture.whenStable();

      expect(contextLine()).toBeNull();
    });
  });

  describe('Remove time', () => {
    it('is absent without a value', async () => {
      const { remove } = await setup();

      expect(remove()).toBeNull();
    });

    it('is shown with a value and emits remove', async () => {
      const { remove, press, host } = await setup('09:00');

      expect(remove()?.getAttribute('type')).toBe('button');

      await press(remove() as HTMLButtonElement);

      expect(host.removes()).toBe(1);
      expect(host.picks).toEqual([]);
    });
  });
});
