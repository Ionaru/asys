// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { InputBox } from './input-box';

@Component({
  imports: [InputBox],
  template: `
    <button type="button" id="other">Other</button>
    <asys-input-box [pill]="pill()"><textarea></textarea></asys-input-box>
  `,
})
class Host {
  readonly pill = signal(false);
}

describe('InputBox', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(Host);

    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;

    return {
      fixture,
      host: fixture.componentInstance,
      box: root.querySelector('asys-input-box') as HTMLElement,
      field: root.querySelector('textarea') as HTMLTextAreaElement,
      other: root.querySelector('#other') as HTMLButtonElement,
    };
  };

  const press = (): MouseEvent => new MouseEvent('mousedown', { bubbles: true, cancelable: true });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('projects its content and carries asys-input-box', async () => {
    const { box, field } = await setup();

    expect(box.classList.contains('asys-input-box')).toBe(true);
    expect(field.parentElement).toBe(box);
  });

  it('is not a pill by default', async () => {
    const { box } = await setup();

    expect(box.classList.contains('asys-input-box--pill')).toBe(false);
  });

  it('adds asys-input-box--pill while pill is set', async () => {
    const { fixture, host, box } = await setup();

    host.pill.set(true);
    await fixture.whenStable();

    expect(box.classList.contains('asys-input-box--pill')).toBe(true);

    host.pill.set(false);
    await fixture.whenStable();

    expect(box.classList.contains('asys-input-box--pill')).toBe(false);
  });

  it('prevents a press on the box itself and focuses the textarea', async () => {
    const { box, field, other } = await setup();
    const event = press();

    other.focus();
    box.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  it('leaves a press on the textarea alone, so it can place the caret', async () => {
    const { field, other } = await setup();
    const event = press();

    other.focus();
    field.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(other);
  });
});
