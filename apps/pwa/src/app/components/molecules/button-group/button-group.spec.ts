// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Button } from '../../atoms/button/button';
import { ButtonGroup } from './button-group';

@Component({
  imports: [ButtonGroup, Button],
  template: `
    <div asys-button-group [fill]="fill()">
      <button asys-button>Done</button>
      <button asys-button>Later</button>
      @if (note()) {
        <p>Needs a name</p>
      }
    </div>
  `,
})
class Host {
  readonly fill = signal(false);

  readonly note = signal(false);
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const group = (): HTMLElement => fixture.nativeElement.querySelector('[asys-button-group]');
  const settle = () => fixture.whenStable();

  return { fixture, host: fixture.componentInstance, group, settle };
};

describe('ButtonGroup', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('stays a div with the group class and holds the Buttons directly, in order', async () => {
    const { group } = await setup();

    const el = group();

    expect(el.tagName).toBe('DIV');
    expect(el.classList.contains('asys-button-group')).toBe(true);
    expect(el.classList.contains('asys-button-group--fill')).toBe(false);
    expect(Array.from(el.children).map((c) => [c.tagName, c.textContent?.trim()])).toEqual([
      ['BUTTON', 'Done'],
      ['BUTTON', 'Later'],
    ]);
  });

  it('adds the fill modifier while fill is true and drops it when false', async () => {
    const { host, group, settle } = await setup();

    host.fill.set(true);
    await settle();

    expect(group().classList.contains('asys-button-group')).toBe(true);
    expect(group().classList.contains('asys-button-group--fill')).toBe(true);

    host.fill.set(false);
    await settle();

    expect(group().classList.contains('asys-button-group')).toBe(true);
    expect(group().classList.contains('asys-button-group--fill')).toBe(false);
  });

  it('sets no role and no aria attribute', async () => {
    const { group } = await setup();

    const names = group().getAttributeNames();

    expect(names).not.toContain('role');
    expect(names.filter((n) => n.startsWith('aria-'))).toEqual([]);
  });

  it('projects content that is not a Button as is, after the Button', async () => {
    const { host, group, settle } = await setup();

    host.note.set(true);
    await settle();

    const last = group().lastElementChild;

    expect(last?.tagName).toBe('P');
    expect(last?.textContent?.trim()).toBe('Needs a name');
    expect(group().children[1].textContent?.trim()).toBe('Later');
  });

  it('carries its layout rules with it', async () => {
    const { host, group, settle } = await setup();
    const button = (): HTMLElement => group().querySelector('button[asys-button]')!;

    expect(getComputedStyle(group()).display).toBe('flex');
    expect(getComputedStyle(button()).minWidth).toBe('var(--tap-target)');

    host.fill.set(true);
    await settle();

    const style = getComputedStyle(button());

    expect(style.minWidth === 'min-content' || style.whiteSpace === 'nowrap').toBe(true);
  });
});
