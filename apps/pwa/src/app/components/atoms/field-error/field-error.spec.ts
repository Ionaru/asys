// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FieldError } from './field-error';

@Component({
  imports: [FieldError],
  template: `<p asys-field-error id="time-error">{{ message() }}</p>`,
})
class Host {
  readonly message = signal('Enter a time');
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const error = (): HTMLElement => fixture.nativeElement.querySelector('p');
  const word = (): HTMLElement | null => error().querySelector('.asys-field__error-word');

  return { fixture, host: fixture.componentInstance, error, word };
};

describe('FieldError', () => {
  it('works on a paragraph with the asys-field__error class and keeps its id', async () => {
    const { error } = await setup();

    expect(error().tagName).toBe('P');
    expect(error().classList.contains('asys-field__error')).toBe(true);
    expect(error().id).toBe('time-error');
  });

  it('renders the triangle-exclamation icon first, hidden from screen readers', async () => {
    const { error } = await setup();

    const icon = error().firstElementChild;
    const glyphs = error().querySelectorAll('svg[data-icon]');

    expect(icon?.tagName.toLowerCase()).toBe('asys-icon');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(glyphs.length).toBe(1);
    expect(glyphs[0].getAttribute('data-icon')).toBe('triangle-exclamation');
  });

  it('spells the word Error: in its own span after the icon', async () => {
    const { error, word } = await setup();

    expect(word()?.tagName).toBe('SPAN');
    expect(word()?.textContent).toBe('Error:');
    expect(word()?.previousElementSibling).toBe(error().querySelector('asys-icon'));
    expect(error().querySelectorAll('.asys-field__error-word').length).toBe(1);
  });

  it('reads Error: followed by one space and the projected message', async () => {
    const { error } = await setup();

    expect(error().textContent?.trim()).toBe('Error: Enter a time');
  });

  it('follows the projected message', async () => {
    const { fixture, host, error, word } = await setup();

    host.message.set('Pick a date');
    await fixture.whenStable();

    expect(error().textContent?.trim()).toBe('Error: Pick a date');
    expect(word()?.textContent).toBe('Error:');
  });
});
