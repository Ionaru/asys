// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AreaPickControl, type AreaChoice } from './area-pick';

const AREAS: readonly AreaChoice[] = [
  { id: 'p', name: 'Personal' },
  { id: 'w', name: 'Work' },
];

@Component({
  imports: [AreaPickControl],
  template: `
    <asys-area-pick
      [label]="label()"
      [pickedId]="pickedId()"
      [automaticLabel]="automaticLabel()"
      [areas]="areas()"
      (areaPicked)="picks.update((all) => [...all, $event])"
    />
  `,
})
class Host {
  readonly control = viewChild.required(AreaPickControl);

  readonly label = signal('Work');

  readonly pickedId = signal<string | null>(null);

  readonly automaticLabel = signal('Automatic: Work');

  readonly areas = signal<readonly AreaChoice[]>(AREAS);

  readonly picks = signal<readonly (string | null)[]>([]);
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root = (): HTMLElement => fixture.nativeElement;
  const control = (): HTMLElement => root().querySelector('asys-area-pick') as HTMLElement;
  const chip = (): HTMLElement => root().querySelector('span.asys-area-pick__chip') as HTMLElement;
  const select = (): HTMLSelectElement =>
    root().querySelector('select.asys-area-pick__select') as HTMLSelectElement;
  const choose = async (value: string) => {
    select().value = value;
    select().dispatchEvent(new Event('change', { bubbles: true }));
    await fixture.whenStable();
  };

  return { fixture, host, root, control, chip, select, choose };
};

describe('AreaPickControl', () => {
  describe('chip', () => {
    it('is hidden from assistive technology', async () => {
      const { chip } = await setup();

      expect(chip().getAttribute('aria-hidden')).toBe('true');
    });

    it('shows the label, then the state line, then the chevron', async () => {
      const { chip } = await setup();

      const parts = Array.from(
        chip().querySelectorAll('.asys-area-pick__label, .asys-area-pick__state, asys-icon'),
      );

      expect(parts.map((c) => c.tagName.toLowerCase())).toEqual(['span', 'span', 'asys-icon']);
      expect(parts[0].classList.contains('asys-area-pick__label')).toBe(true);
      expect(parts[0].textContent?.trim()).toBe('Work');
      expect(parts[1].classList.contains('asys-area-pick__state')).toBe(true);
    });

    it('follows a change of the label', async () => {
      const { fixture, host, chip } = await setup();

      host.label.set('Work + Personal');
      await fixture.whenStable();

      expect(chip().querySelector('.asys-area-pick__label')?.textContent?.trim()).toBe(
        'Work + Personal',
      );
    });

    it('reads Automatic while nothing is picked', async () => {
      const { chip } = await setup();

      expect(chip().querySelector('.asys-area-pick__state')?.textContent?.trim()).toBe('Automatic');
    });

    it('reads Picked while an Area is picked', async () => {
      const { fixture, host, chip } = await setup();

      host.pickedId.set('p');
      await fixture.whenStable();

      expect(chip().querySelector('.asys-area-pick__state')?.textContent?.trim()).toBe('Picked');

      host.pickedId.set(null);
      await fixture.whenStable();

      expect(chip().querySelector('.asys-area-pick__state')?.textContent?.trim()).toBe('Automatic');
    });
  });

  describe('host', () => {
    it('has the asys-area-pick class and no picked modifier while automatic', async () => {
      const { control } = await setup();

      expect(control().classList.contains('asys-area-pick')).toBe(true);
      expect(control().classList.contains('asys-area-pick--picked')).toBe(false);
    });

    it('has the picked modifier while an Area is picked', async () => {
      const { fixture, host, control } = await setup();

      host.pickedId.set('w');
      await fixture.whenStable();

      expect(control().classList.contains('asys-area-pick--picked')).toBe(true);

      host.pickedId.set(null);
      await fixture.whenStable();

      expect(control().classList.contains('asys-area-pick--picked')).toBe(false);
    });
  });

  describe('select', () => {
    it('is named Current Area', async () => {
      const { select } = await setup();

      expect(select().getAttribute('aria-label')).toBe('Current Area');
    });

    it('offers Automatic first, then the Areas in the given order', async () => {
      const { select } = await setup();

      const options = Array.from(select().options);

      expect(options.map((o) => o.value)).toEqual(['', 'p', 'w']);
      expect(options.map((o) => o.textContent?.trim())).toEqual([
        'Automatic: Work',
        'Personal',
        'Work',
      ]);
    });

    it('keeps the order it is given, not the alphabetical one', async () => {
      const { fixture, host, select } = await setup();

      host.areas.set([
        { id: 'w', name: 'Work' },
        { id: 'p', name: 'Personal' },
      ]);
      await fixture.whenStable();

      expect(Array.from(select().options).map((o) => o.value)).toEqual(['', 'w', 'p']);
    });

    it('follows a change of the automatic label', async () => {
      const { fixture, host, select } = await setup();

      host.automaticLabel.set('Automatic: Personal');
      await fixture.whenStable();

      expect(select().options[0].textContent?.trim()).toBe('Automatic: Personal');
    });

    it('selects the first option while nothing is picked', async () => {
      const { select } = await setup();

      expect(select().options[0].selected).toBe(true);
      expect(select().value).toBe('');
    });

    it('selects the picked Area', async () => {
      const { fixture, host, select } = await setup();

      host.pickedId.set('p');
      await fixture.whenStable();

      expect(select().value).toBe('p');
      expect(select().options[1].selected).toBe(true);
    });

    it('follows a change of pickedId and back to the first option', async () => {
      const { fixture, host, select } = await setup();

      host.pickedId.set('p');
      await fixture.whenStable();
      host.pickedId.set('w');
      await fixture.whenStable();

      expect(select().value).toBe('w');
      expect(select().options[2].selected).toBe(true);

      host.pickedId.set(null);
      await fixture.whenStable();

      expect(select().value).toBe('');
      expect(select().options[0].selected).toBe(true);
    });
  });

  describe('areaPicked', () => {
    it('emits the id of the chosen Area', async () => {
      const { host, choose } = await setup();

      await choose('w');

      expect(host.picks()).toEqual(['w']);
    });

    it('emits null when Automatic is chosen', async () => {
      const { fixture, host, choose } = await setup();

      host.pickedId.set('p');
      await fixture.whenStable();
      await choose('');

      expect(host.picks()).toEqual([null]);
    });

    it('emits once per change', async () => {
      const { host, choose } = await setup();

      await choose('p');
      await choose('w');
      await choose('');

      expect(host.picks()).toEqual(['p', 'w', null]);
    });

    it('does not emit without a change', async () => {
      const { fixture, host } = await setup();

      host.pickedId.set('p');
      await fixture.whenStable();
      host.label.set('Personal');
      await fixture.whenStable();

      expect(host.picks()).toEqual([]);
    });

    it('does not change pickedId itself', async () => {
      const { host, control, choose } = await setup();

      await choose('w');

      expect(host.pickedId()).toBeNull();
      expect(control().classList.contains('asys-area-pick--picked')).toBe(false);
    });
  });

  it('focuses the native select', async () => {
    const { fixture, host, select } = await setup();

    document.body.appendChild(fixture.nativeElement);
    host.control().focus();

    expect(document.activeElement).toBe(select());
  });
});
