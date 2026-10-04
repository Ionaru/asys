// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { InlineConfirm } from './inline-confirm';

const MESSAGE = 'Drop “Call Marit”? This cannot be undone.';

@Component({
  imports: [InlineConfirm],
  template: `
    <asys-inline-confirm
      [message]="message"
      confirmLabel="Drop"
      [busy]="busy()"
      (confirm)="confirmed = confirmed + 1"
      (cancel)="cancelled = cancelled + 1"
    />
  `,
})
class Host {
  readonly message = MESSAGE;

  readonly busy = signal(false);

  confirmed = 0;

  cancelled = 0;
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const q = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('button'));
  const button = (label: string): HTMLButtonElement | undefined =>
    buttons().find((b) => b.textContent?.trim() === label);

  return { fixture, host: fixture.componentInstance, q, buttons, button };
};

describe('InlineConfirm', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the message as a labelled group', async () => {
    const { q } = await setup();

    const group = q('.asys-confirm');

    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.getAttribute('aria-label')).toBe(MESSAGE);
    expect(q('.asys-confirm__message')?.textContent?.trim()).toBe(MESSAGE);
  });

  it('renders a danger confirm button then a quiet Cancel button', async () => {
    const { buttons } = await setup();

    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Drop', 'Cancel']);
    expect(buttons().map((b) => b.type)).toEqual(['button', 'button']);
    expect(buttons()[0].classList.contains('asys-button--danger')).toBe(true);
    expect(buttons()[1].classList.contains('asys-button--quiet')).toBe(true);
  });

  it('moves focus to Cancel when first rendered', async () => {
    const { button } = await setup();

    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('emits confirm from the confirm button only', async () => {
    const { fixture, host, button } = await setup();

    button('Drop')?.click();
    await fixture.whenStable();

    expect([host.confirmed, host.cancelled]).toEqual([1, 0]);
  });

  it('emits cancel from the Cancel button only', async () => {
    const { fixture, host, button } = await setup();

    button('Cancel')?.click();
    await fixture.whenStable();

    expect([host.confirmed, host.cancelled]).toEqual([0, 1]);
  });

  it('emits cancel when Escape is pressed inside the component', async () => {
    const { fixture, host, button } = await setup();

    button('Cancel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect([host.confirmed, host.cancelled]).toEqual([0, 1]);
  });

  it('emits cancel when Escape is pressed on the confirm button', async () => {
    const { fixture, host, button } = await setup();

    button('Drop')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(host.cancelled).toBe(1);
  });

  it('does not emit cancel for other keys', async () => {
    const { fixture, host, button } = await setup();

    button('Cancel')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    await fixture.whenStable();

    expect(host.cancelled).toBe(0);
  });

  it('disables the confirm button while busy, but never Cancel', async () => {
    const { fixture, host, button } = await setup();

    host.busy.set(true);
    await fixture.whenStable();

    expect(button('Drop')?.disabled).toBe(true);
    expect(button('Cancel')?.disabled).toBe(false);

    button('Drop')?.click();
    await fixture.whenStable();

    expect(host.confirmed).toBe(0);

    button('Cancel')?.click();
    await fixture.whenStable();

    expect(host.cancelled).toBe(1);
  });
});
