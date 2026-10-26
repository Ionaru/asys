// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconName } from '../../atoms/icon/icon';
import type { SelectOption } from '../../molecules/select-field/select-field';
import { OptionList } from './option-list';

const OPTIONS: readonly SelectOption[] = [
  { value: '', label: 'No Area' },
  { value: 'work', label: 'Work' },
  { value: 'home', label: 'Home' },
];

@Component({
  imports: [OptionList],
  template: `
    <ul
      asys-option-list
      [options]="options"
      [value]="value()"
      [icon]="icon()"
      (choose)="picks.push($event)"
    ></ul>
  `,
})
class Host {
  readonly options = OPTIONS;
  readonly value = signal('work');
  readonly icon = signal<IconName | null>(null);
  readonly picks: string[] = [];
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const setup = async (value = 'work', icon: IconName | null = null) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.value.set(value);
  fixture.componentInstance.icon.set(icon);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const list = (): HTMLUListElement => fixture.nativeElement.querySelector('ul');
  const items = (): HTMLLIElement[] => Array.from(list().children) as HTMLLIElement[];
  const rows = (): HTMLButtonElement[] =>
    Array.from(list().querySelectorAll<HTMLButtonElement>('button.asys-field-row'));
  const pressed = (): (string | null)[] => rows().map((b) => b.getAttribute('aria-pressed'));
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };

  return { fixture, host, list, items, rows, pressed, press };
};

describe('OptionList', () => {
  it('renders a list of one button row per option, in order', async () => {
    const { list, items, rows } = await setup();

    expect(list().classList.contains('asys-option-list')).toBe(true);
    expect(items()).toHaveLength(3);
    expect(items().every((li) => li.tagName === 'LI')).toBe(true);
    expect(items().map((li) => li.querySelectorAll('button.asys-field-row').length)).toEqual([
      1, 1, 1,
    ]);
    expect(rows().map((b) => b.getAttribute('type'))).toEqual(['button', 'button', 'button']);
    expect(
      rows().map((b) => squash(b.querySelector('.asys-field-row__label')?.textContent)),
    ).toEqual(['No Area', 'Work', 'Home']);
  });

  describe('the chosen row', () => {
    it('presses exactly the row equal to the value', async () => {
      const { pressed } = await setup('work');

      expect(pressed()).toEqual(['false', 'true', 'false']);
    });

    it('presses the empty option for the empty value', async () => {
      const { pressed } = await setup('');

      expect(pressed()).toEqual(['true', 'false', 'false']);
    });

    it('presses nothing when no option matches', async () => {
      const { pressed } = await setup('gone');

      expect(pressed()).toEqual(['false', 'false', 'false']);
    });

    it('follows the value', async () => {
      const { fixture, host, pressed } = await setup('work');

      host.value.set('home');
      await fixture.whenStable();

      expect(pressed()).toEqual(['false', 'false', 'true']);
    });
  });

  describe('the check and the icon', () => {
    it('ends every row with a hidden check icon', async () => {
      const { rows } = await setup();

      for (const row of rows()) {
        const check = row.lastElementChild as HTMLElement;

        expect(check.tagName).toBe('ASYS-ICON');
        expect(check.classList.contains('asys-option-list__check')).toBe(true);
        const svg = check.querySelector('svg');

        expect(svg?.getAttribute('data-icon')).toBe('check');
        expect(svg?.getAttribute('aria-hidden')).toBe('true');
      }
    });

    it('has only the label and the check without an icon', async () => {
      const { rows } = await setup('work', null);

      for (const row of rows()) {
        const kids = Array.from(row.children);

        expect(kids.map((c) => c.tagName)).toEqual(['SPAN', 'ASYS-ICON']);
        expect(kids[0].classList.contains('asys-field-row__label')).toBe(true);
        expect(kids[1].classList.contains('asys-option-list__check')).toBe(true);
      }
    });

    it('puts the icon before the label when one is given', async () => {
      const { rows } = await setup('work', IconName.Folder);

      for (const row of rows()) {
        expect(Array.from(row.children).map((c) => c.tagName)).toEqual([
          'ASYS-ICON',
          'SPAN',
          'ASYS-ICON',
        ]);
        expect(row.children[0].querySelector('svg')?.getAttribute('data-icon')).toBe('folder');
      }
    });
  });

  describe('choosing', () => {
    it('emits the value of the pressed row each time', async () => {
      const { host, rows, press } = await setup('work');

      await press(rows()[2]);

      expect(host.picks).toEqual(['home']);

      await press(rows()[0]);

      expect(host.picks).toEqual(['home', '']);
    });

    it('keeps no state of its own: the value stays until the host changes it', async () => {
      const { host, rows, pressed, press } = await setup('work');

      await press(rows()[2]);

      expect(pressed()).toEqual(['false', 'true', 'false']);
      expect(host.value()).toBe('work');
    });

    it('emits the value of the row that is already chosen', async () => {
      const { host, rows, press } = await setup('work');

      await press(rows()[1]);

      expect(host.picks).toEqual(['work']);
    });
  });

  it('does not mark the rows as opening a popup', async () => {
    const { rows } = await setup();

    expect(rows().some((b) => b.hasAttribute('aria-haspopup'))).toBe(false);
  });
});
