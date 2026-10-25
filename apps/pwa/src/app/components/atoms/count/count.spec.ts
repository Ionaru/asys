// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Count, CountVariant } from './count';

@Component({
  imports: [Count],
  template: `<span asys-count [value]="value()" [variant]="variant()"></span>`,
})
class Host {
  readonly value = signal(3);

  readonly variant = signal(CountVariant.Filled);
}

@Component({ imports: [Count], template: `<span asys-count [value]="3"></span>` })
class DefaultHost {}

@Component({
  imports: [Count],
  template: `<span asys-count class="x" aria-hidden="true" [value]="3"></span>`,
})
class AttributesHost {}

@Component({
  imports: [Count],
  template: `<span asys-count [value]="2"><span class="extra"> waiting</span></span>`,
})
class ProjectingHost {}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const count = (): HTMLElement => fixture.nativeElement.querySelector('span');

  return { fixture, host: fixture.componentInstance, count };
};

describe('Count', () => {
  it('renders a bare span with the number and no accessibility attributes of its own', async () => {
    const fixture = TestBed.createComponent(DefaultHost);
    await fixture.whenStable();

    const count: HTMLElement = fixture.nativeElement.querySelector('span');

    expect(count.tagName).toBe('SPAN');
    expect(Array.from(count.classList)).toEqual(['asys-count']);
    expect(count.textContent).toBe('3');
    expect(count.hasAttribute('aria-hidden')).toBe(false);
    expect(count.hasAttribute('aria-label')).toBe(false);
    expect(count.hasAttribute('role')).toBe(false);
  });

  it.each([
    [0, '0'],
    [1, '1'],
    [99, '99'],
    [100, '99+'],
    [1000, '99+'],
  ])('shows %i as %s', async (value, text) => {
    const { fixture, host, count } = await setup();

    host.value.set(value);
    await fixture.whenStable();

    expect(count().textContent).toBe(text);
  });

  it('adds the on-signal class for OnSignal only', async () => {
    const { fixture, host, count } = await setup();

    host.variant.set(CountVariant.OnSignal);
    await fixture.whenStable();

    expect(count().classList.contains('asys-count--on-signal')).toBe(true);
    expect(count().classList.contains('asys-count--quiet')).toBe(false);
  });

  it('adds the quiet class for Quiet only', async () => {
    const { fixture, host, count } = await setup();

    host.variant.set(CountVariant.Quiet);
    await fixture.whenStable();

    expect(count().classList.contains('asys-count--quiet')).toBe(true);
    expect(count().classList.contains('asys-count--on-signal')).toBe(false);
  });

  it('adds no variant class for Filled, and swaps the class on the same node', async () => {
    const { fixture, host, count } = await setup();
    const node = count();

    expect(node.classList.contains('asys-count--on-signal')).toBe(false);
    expect(node.classList.contains('asys-count--quiet')).toBe(false);

    host.variant.set(CountVariant.Quiet);
    await fixture.whenStable();

    expect(count()).toBe(node);
    expect(node.classList.contains('asys-count--quiet')).toBe(true);

    host.variant.set(CountVariant.OnSignal);
    await fixture.whenStable();

    expect(count()).toBe(node);
    expect(node.classList.contains('asys-count--quiet')).toBe(false);
    expect(node.classList.contains('asys-count--on-signal')).toBe(true);

    host.variant.set(CountVariant.Filled);
    await fixture.whenStable();

    expect(node.classList.contains('asys-count--on-signal')).toBe(false);
  });

  it('keeps a parent class and aria-hidden beside asys-count', async () => {
    const fixture = TestBed.createComponent(AttributesHost);
    await fixture.whenStable();

    const count: HTMLElement = fixture.nativeElement.querySelector('span');

    expect(count.classList.contains('asys-count')).toBe(true);
    expect(count.classList.contains('x')).toBe(true);
    expect(count.getAttribute('aria-hidden')).toBe('true');
  });

  it('puts projected content right after the number', async () => {
    const fixture = TestBed.createComponent(ProjectingHost);
    await fixture.whenStable();

    const count: HTMLElement = fixture.nativeElement.querySelector('span[asys-count]');

    expect(count.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(count.firstChild?.textContent).toBe('2');
    expect((count.firstChild?.nextSibling as Element | null)?.matches('span.extra')).toBe(true);
    expect(count.textContent).toBe('2 waiting');
  });

  it('updates the text on the same node when the value changes', async () => {
    const { fixture, host, count } = await setup();
    const node = count();

    expect(node.textContent).toBe('3');

    host.value.set(120);
    await fixture.whenStable();

    expect(count()).toBe(node);
    expect(node.textContent).toBe('99+');
  });
});
