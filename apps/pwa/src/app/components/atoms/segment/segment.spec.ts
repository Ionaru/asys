// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Segment } from './segment';

@Component({
  imports: [Segment],
  template: `
    <button
      asys-segment
      id="seg"
      aria-describedby="hint"
      [pressed]="pressed()"
      [num]="num()"
      [stacked]="stacked()"
      [disabled]="disabled()"
      (click)="clicks.update((n) => n + 1)"
    >
      Important
    </button>
  `,
})
class Host {
  readonly pressed = signal(false);
  readonly num = signal(false);
  readonly stacked = signal(false);
  readonly disabled = signal(false);
  readonly clicks = signal(0);
}

@Component({
  imports: [Segment],
  template: `
    <button asys-segment [stacked]="true" [num]="true" aria-label="45 min">
      <span class="asys-segment__value">45</span><span class="asys-segment__unit">min</span>
    </button>
  `,
})
class StackedHost {}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('button');

  return { fixture, host: fixture.componentInstance, button };
};

describe('Segment', () => {
  it('renders a plain unpressed button with the asys-segment class and its text', async () => {
    const { button } = await setup();

    expect(button().classList.contains('asys-segment')).toBe(true);
    expect(button().classList.contains('asys-segment--num')).toBe(false);
    expect(button().classList.contains('asys-segment--stacked')).toBe(false);
    expect(button().getAttribute('type')).toBe('button');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().textContent?.trim()).toBe('Important');
  });

  it('sets aria-pressed from pressed and does not change it on a click', async () => {
    const { fixture, host, button } = await setup();

    host.pressed.set(true);
    await fixture.whenStable();

    expect(button().getAttribute('aria-pressed')).toBe('true');

    host.pressed.set(false);
    await fixture.whenStable();

    expect(button().getAttribute('aria-pressed')).toBe('false');

    button().click();
    await fixture.whenStable();

    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles the num and stacked modifier classes independently', async () => {
    const { fixture, host, button } = await setup();

    host.num.set(true);
    await fixture.whenStable();

    expect(button().classList.contains('asys-segment--num')).toBe(true);
    expect(button().classList.contains('asys-segment--stacked')).toBe(false);

    host.num.set(false);
    host.stacked.set(true);
    await fixture.whenStable();

    expect(button().classList.contains('asys-segment--num')).toBe(false);
    expect(button().classList.contains('asys-segment--stacked')).toBe(true);

    host.num.set(true);
    await fixture.whenStable();

    expect(button().classList.contains('asys-segment--num')).toBe(true);
    expect(button().classList.contains('asys-segment--stacked')).toBe(true);

    host.num.set(false);
    host.stacked.set(false);
    await fixture.whenStable();

    expect(button().classList.contains('asys-segment')).toBe(true);
    expect(button().classList.contains('asys-segment--num')).toBe(false);
    expect(button().classList.contains('asys-segment--stacked')).toBe(false);
  });

  it('keeps the projected value and unit spans in order and the consumer aria-label', async () => {
    const fixture = TestBed.createComponent(StackedHost);
    await fixture.whenStable();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    expect(button.getAttribute('aria-label')).toBe('45 min');
    expect(button.classList.contains('asys-segment--stacked')).toBe(true);
    expect(button.classList.contains('asys-segment--num')).toBe(true);
    expect(Array.from(button.children).map((c) => [c.className, c.textContent])).toEqual([
      ['asys-segment__value', '45'],
      ['asys-segment__unit', 'min'],
    ]);
  });

  it('calls the consumer click handler once per click, and not while natively disabled', async () => {
    const { fixture, host, button } = await setup();

    button().click();

    expect(host.clicks()).toBe(1);

    host.disabled.set(true);
    await fixture.whenStable();

    expect(button().disabled).toBe(true);

    button().click();

    expect(host.clicks()).toBe(1);
  });

  it('passes consumer attributes through unchanged', async () => {
    const { button } = await setup();

    expect(button().id).toBe('seg');
    expect(button().getAttribute('aria-describedby')).toBe('hint');
  });
});
