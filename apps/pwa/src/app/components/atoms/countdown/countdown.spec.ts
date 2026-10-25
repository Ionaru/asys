// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Countdown } from './countdown';

@Component({
  imports: [Countdown],
  template: `<span asys-countdown [duration]="duration()" [paused]="paused()"></span>`,
})
class Host {
  readonly duration = signal<string | null>(null);

  readonly paused = signal(false);
}

@Component({ imports: [Countdown], template: `<span asys-countdown></span>` })
class BareHost {}

const DURATION = '--asys-countdown-duration';

describe('Countdown', () => {
  it('renders a hidden span holding a ring and a fill disc', async () => {
    const fixture = TestBed.createComponent(BareHost);
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement.querySelector('span');
    const svgs = host.querySelectorAll('svg');
    const circles = host.querySelectorAll('circle');
    const ring = circles[0];
    const fill = circles[1];

    expect(host.tagName).toBe('SPAN');
    expect(Array.from(host.classList)).toEqual(['asys-countdown']);
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].getAttribute('viewBox')).toBe('0 0 20 20');
    expect(circles).toHaveLength(2);
    expect(ring.matches('circle.asys-countdown__ring')).toBe(true);
    expect(ring.getAttribute('cx')).toBe('10');
    expect(ring.getAttribute('cy')).toBe('10');
    expect(ring.getAttribute('r')).toBe('9');
    expect(fill.matches('circle.asys-countdown__fill')).toBe(true);
    expect(fill.getAttribute('r')).toBe('3.25');
    expect(fill.getAttribute('pathLength')).toBe('100');
    expect(fill.getAttribute('transform')).toBe('rotate(-90 10 10)');
  });

  it('writes the duration property only while a duration is set', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement.querySelector('span');

    expect(host.style.getPropertyValue(DURATION)).toBe('');

    fixture.componentInstance.duration.set('8000ms');
    await fixture.whenStable();

    expect(host.style.getPropertyValue(DURATION)).toBe('8000ms');

    fixture.componentInstance.duration.set(null);
    await fixture.whenStable();

    expect(host.style.getPropertyValue(DURATION)).toBe('');
  });

  it('marks itself is-paused while paused and drops it again on the same node', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement.querySelector('span');

    expect(host.classList.contains('is-paused')).toBe(false);

    fixture.componentInstance.paused.set(true);
    await fixture.whenStable();

    expect(host.classList.contains('is-paused')).toBe(true);

    fixture.componentInstance.paused.set(false);
    await fixture.whenStable();

    expect(host.classList.contains('is-paused')).toBe(false);
    expect(fixture.nativeElement.querySelector('span')).toBe(host);
  });
});
