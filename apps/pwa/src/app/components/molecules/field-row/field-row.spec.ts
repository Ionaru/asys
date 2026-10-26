// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconName } from '../../atoms/icon/icon';
import { FieldRow } from './field-row';

@Component({
  imports: [FieldRow],
  template: `
    <button
      asys-field-row
      [label]="label()"
      [value]="value()"
      [set]="set()"
      [icon]="icon()"
      [disabled]="disabled()"
      (click)="clicks = clicks + 1"
    ></button>
  `,
})
class Host {
  readonly label = signal('Area');
  readonly value = signal('Personal');
  readonly set = signal(false);
  readonly icon = signal<IconName | null>(null);
  readonly disabled = signal(false);
  readonly row = viewChild.required(FieldRow);
  clicks = 0;
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('button');
  const valueEl = (): HTMLElement => button().querySelector('.asys-field-row__value')!;

  return { fixture, host: fixture.componentInstance, button, valueEl };
};

describe('FieldRow', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('is a button with the row class, type and popup hint, and its three parts in order', async () => {
    const { button } = await setup();

    expect(button().classList.contains('asys-field-row')).toBe(true);
    expect(button().getAttribute('type')).toBe('button');
    expect(button().getAttribute('aria-haspopup')).toBe('dialog');
    expect(button().hasAttribute('value')).toBe(false);

    const kids = Array.from(button().children);

    expect(kids.map((k) => k.tagName)).toEqual(['SPAN', 'SPAN', 'ASYS-ICON']);
    expect(kids[0].classList.contains('asys-field-row__label')).toBe(true);
    expect(kids[1].classList.contains('asys-field-row__value')).toBe(true);
    expect(kids[2].classList.contains('asys-field-row__chevron')).toBe(true);

    const svg = kids[2].querySelector('svg');

    expect(svg?.getAttribute('data-icon')).toBe('chevron-right');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the label and the value, and follows a changed value', async () => {
    const { fixture, host, button, valueEl } = await setup();

    expect(button().querySelector('.asys-field-row__label')?.textContent?.trim()).toBe('Area');
    expect(valueEl().textContent?.trim()).toBe('Personal');

    host.value.set('No Area');
    await fixture.whenStable();

    expect(valueEl().textContent?.trim()).toBe('No Area');
  });

  it('marks the value with --set only while set is true', async () => {
    const { fixture, host, valueEl } = await setup();

    expect(valueEl().classList.contains('asys-field-row__value--set')).toBe(false);

    host.set.set(true);
    await fixture.whenStable();

    expect(valueEl().classList.contains('asys-field-row__value--set')).toBe(true);

    host.set.set(false);
    await fixture.whenStable();

    expect(valueEl().classList.contains('asys-field-row__value--set')).toBe(false);
  });

  it('draws an icon as the first child of the value only when one is given', async () => {
    const { fixture, host, valueEl } = await setup();

    expect(valueEl().querySelector('asys-icon')).toBeNull();

    host.icon.set(IconName.Folder);
    await fixture.whenStable();

    expect(valueEl().querySelectorAll('asys-icon').length).toBe(1);
    expect(valueEl().firstElementChild?.tagName).toBe('ASYS-ICON');
    expect(valueEl().querySelector('svg')?.getAttribute('data-icon')).toBe('folder');
    expect(valueEl().textContent?.trim()).toBe('Personal');
  });

  it('focus() focuses the host button', async () => {
    const { host, button } = await setup();

    expect(document.activeElement).not.toBe(button());

    host.row().focus();

    expect(document.activeElement).toBe(button());
  });

  it('does not run the parent click handler while disabled, and runs it once otherwise', async () => {
    const { fixture, host, button } = await setup();

    host.disabled.set(true);
    await fixture.whenStable();

    expect(button().disabled).toBe(true);

    button().click();

    expect(host.clicks).toBe(0);

    host.disabled.set(false);
    await fixture.whenStable();

    expect(button().disabled).toBe(false);

    button().click();

    expect(host.clicks).toBe(1);
  });
});
