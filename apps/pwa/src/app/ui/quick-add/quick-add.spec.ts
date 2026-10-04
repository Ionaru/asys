// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { QuickAdd } from './quick-add';

@Component({
  imports: [QuickAdd],
  template: `
    <asys-quick-add
      [(value)]="value"
      [busy]="busy()"
      [message]="message()"
      (add)="added.push($event)"
      (close)="closed = closed + 1"
    />
  `,
})
class Host {
  readonly value = signal('');

  readonly busy = signal(false);

  readonly message = signal<string | null>(null);

  readonly added: string[] = [];

  closed = 0;
}

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const q = <T extends HTMLElement>(selector: string): T | null =>
    fixture.nativeElement.querySelector(selector);
  const input = () => must(q<HTMLInputElement>('.asys-quickadd__input'));
  const button = (label: string): HTMLButtonElement | undefined =>
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find(
      (b) => b.textContent?.trim() === label,
    );
  const type = async (text: string) => {
    input().value = text;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
  };
  const submit = async () => {
    must(q('form')).dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, q, input, button, type, submit };
};

describe('QuickAdd', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a form with a labelled input, the hint and Add and Close buttons', async () => {
    const { q, input, button } = await setup();

    const label = q('label');

    expect(q('form')?.classList.contains('asys-quickadd')).toBe(true);
    expect(label?.textContent?.trim()).toBe('Capture a Task');
    expect(label?.classList.contains('asys-visually-hidden')).toBe(true);
    expect(label?.getAttribute('for')).toBe(input().id);
    expect(input().type).toBe('text');
    expect(input().placeholder).toBe('Capture a Task');
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(q('.asys-quickadd__hint')?.textContent?.trim()).toBe('Goes to the Inbox until Triage');
    expect(button('Add')?.type).toBe('submit');
    expect(button('Close')?.type).toBe('button');
  });

  it('moves focus to the input when first rendered', async () => {
    const { input } = await setup();

    expect(document.activeElement).toBe(input());
  });

  it('shows the value and updates it on input', async () => {
    const { host, input, fixture, type } = await setup();

    host.value.set('Call Marit');
    await fixture.whenStable();

    expect(input().value).toBe('Call Marit');

    await type('Buy milk');

    expect(host.value()).toBe('Buy milk');
  });

  it('disables Add while the value is blank and enables it otherwise', async () => {
    const { button, type } = await setup();

    expect(button('Add')?.disabled).toBe(true);

    await type('   ');

    expect(button('Add')?.disabled).toBe(true);

    await type('Call Marit');

    expect(button('Add')?.disabled).toBe(false);
  });

  it('disables Add while busy', async () => {
    const { host, fixture, button, type } = await setup();
    await type('Call Marit');

    host.busy.set(true);
    await fixture.whenStable();

    expect(button('Add')?.disabled).toBe(true);
  });

  it('emits the trimmed value on submit and does not clear it', async () => {
    const { host, type, submit } = await setup();
    await type('  Call Marit  ');

    await submit();

    expect(host.added).toEqual(['Call Marit']);
    expect(host.value()).toBe('  Call Marit  ');
  });

  it('prevents the form submit from reloading the page', async () => {
    const { q, type, fixture } = await setup();
    await type('Call Marit');
    const event = new Event('submit', { cancelable: true });

    must(q('form')).dispatchEvent(event);
    await fixture.whenStable();

    expect(event.defaultPrevented).toBe(true);
  });

  it('emits add when the Add button is clicked', async () => {
    const { fixture, host, button, type } = await setup();
    await type('Call Marit');

    button('Add')?.click();
    await fixture.whenStable();

    expect(host.added).toEqual(['Call Marit']);
  });

  it('emits nothing on submit when the value is blank', async () => {
    const { host, type, submit } = await setup();

    await submit();
    await type('   ');
    await submit();

    expect(host.added).toEqual([]);
  });

  it('emits nothing on submit while busy', async () => {
    const { host, fixture, type, submit } = await setup();
    await type('Call Marit');
    host.busy.set(true);
    await fixture.whenStable();

    await submit();

    expect(host.added).toEqual([]);
  });

  it('submits when Enter is pressed in the input', async () => {
    const { host, fixture, input, type } = await setup();
    await type('Call Marit');

    // Enter in a text input triggers the form's implicit submission, which is requestSubmit().
    input().form?.requestSubmit();
    await fixture.whenStable();

    expect(host.added).toEqual(['Call Marit']);
  });

  it('emits close from the Close button', async () => {
    const { fixture, host, button } = await setup();

    button('Close')?.click();
    await fixture.whenStable();

    expect(host.closed).toBe(1);
    expect(host.added).toEqual([]);
  });

  it('emits close when Escape is pressed in the input', async () => {
    const { fixture, host, input } = await setup();

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(host.closed).toBe(1);
  });

  it('emits close when Escape is pressed on a button inside', async () => {
    const { fixture, host, button } = await setup();

    button('Add')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(host.closed).toBe(1);
  });

  it('keeps an empty status paragraph with role status when there is no message', async () => {
    const { q } = await setup();

    const status = q('.asys-quickadd__status');

    expect(status).not.toBeNull();
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent?.trim()).toBe('');
  });

  it('shows the message in the status paragraph and clears it again', async () => {
    const { host, fixture, q } = await setup();

    host.message.set('Could not add the Task');
    await fixture.whenStable();

    expect(q('.asys-quickadd__status')?.textContent?.trim()).toBe('Could not add the Task');

    host.message.set(null);
    await fixture.whenStable();

    expect(q('.asys-quickadd__status')).not.toBeNull();
    expect(q('.asys-quickadd__status')?.textContent?.trim()).toBe('');
  });
});
