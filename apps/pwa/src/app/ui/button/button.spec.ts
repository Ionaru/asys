// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Button, ButtonSize, ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `
    <button asys-button id="b" [variant]="variant()" [size]="size()" [block]="block()">Go</button>
    <a asys-button id="a" href="/x" [variant]="Variant.Primary">Link</a>
    <button id="plain">Plain</button>
    <button asys-button id="default">Default</button>
    <button asys-button id="off" disabled>Off</button>
  `,
})
class Host {
  protected readonly Variant = ButtonVariant;

  readonly variant = signal(ButtonVariant.Secondary);

  readonly size = signal(ButtonSize.Default);

  readonly block = signal(false);
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const el = (id: string): HTMLElement => fixture.nativeElement.querySelector(`#${id}`);

  return { fixture, host: fixture.componentInstance, el };
};

describe('Button', () => {
  it('defaults to the secondary variant at default size without block', async () => {
    const { el } = await setup();

    const classes = Array.from(el('default').classList).sort();

    expect(classes).toEqual(['asys-button', 'asys-button--secondary']);
  });

  it.each([
    [ButtonVariant.Primary, 'asys-button--primary'],
    [ButtonVariant.Secondary, 'asys-button--secondary'],
    [ButtonVariant.Quiet, 'asys-button--quiet'],
    [ButtonVariant.Danger, 'asys-button--danger'],
  ])('maps variant %s to exactly %s', async (variant, expected) => {
    const { fixture, host, el } = await setup();

    host.variant.set(variant);
    await fixture.whenStable();

    const variants = Array.from(el('b').classList).filter((c) =>
      /^asys-button--(primary|secondary|quiet|danger)$/.test(c),
    );

    expect(variants).toEqual([expected]);
    expect(el('b').classList.contains('asys-button')).toBe(true);
  });

  it('adds asys-button--small only for the small size', async () => {
    const { fixture, host, el } = await setup();

    expect(el('b').classList.contains('asys-button--small')).toBe(false);

    host.size.set(ButtonSize.Small);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--small')).toBe(true);

    host.size.set(ButtonSize.Default);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--small')).toBe(false);
  });

  it('adds asys-button--block only when block is true', async () => {
    const { fixture, host, el } = await setup();

    expect(el('b').classList.contains('asys-button--block')).toBe(false);

    host.block.set(true);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--block')).toBe(true);

    host.block.set(false);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--block')).toBe(false);
  });

  it('replaces the previous variant class when the variant changes', async () => {
    const { fixture, host, el } = await setup();

    host.variant.set(ButtonVariant.Danger);
    await fixture.whenStable();
    host.variant.set(ButtonVariant.Quiet);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--danger')).toBe(false);
    expect(el('b').classList.contains('asys-button--quiet')).toBe(true);
  });

  it('works on an anchor element', async () => {
    const { el } = await setup();

    expect(el('a').tagName).toBe('A');
    expect(el('a').classList.contains('asys-button')).toBe(true);
    expect(el('a').classList.contains('asys-button--primary')).toBe(true);
    expect(el('a').textContent).toContain('Link');
  });

  it('leaves a plain button without the design system classes', async () => {
    const { el } = await setup();

    expect(el('plain').className).toBe('');
  });

  it('projects its content and keeps the native disabled attribute', async () => {
    const { el } = await setup();

    expect(el('b').textContent).toContain('Go');
    expect(el('off').hasAttribute('disabled')).toBe(true);
    expect(el('b').hasAttribute('disabled')).toBe(false);
  });
});
