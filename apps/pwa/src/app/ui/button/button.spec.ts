// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { IconName } from '../icon/icon';
import { Button, ButtonSize, ButtonVariant } from './button';

@Component({
  imports: [Button],
  template: `
    <button
      asys-button
      id="b"
      [variant]="variant()"
      [size]="size()"
      [block]="block()"
      [icon]="icon()"
      [iconOnly]="iconOnly()"
    >
      Go
    </button>
    <a asys-button id="a" href="/x" [variant]="Variant.Primary">Link</a>
    <button id="plain">Plain</button>
    <button asys-button id="default">Default</button>
    <button asys-button id="off" disabled>Off</button>
    <a asys-button id="link-icon" href="/y" [icon]="IconName.Plus">Add</a>
    <button
      asys-button
      id="icon-only"
      aria-label="Add a Task"
      [iconOnly]="true"
      [icon]="IconName.Plus"
    ></button>
    <button asys-button id="large" [size]="Size.Large" [icon]="IconName.Check">Save</button>
  `,
})
class Host {
  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly IconName = IconName;

  readonly variant = signal(ButtonVariant.Secondary);

  readonly size = signal(ButtonSize.Default);

  readonly block = signal(false);

  readonly icon = signal<IconName | null>(null);

  readonly iconOnly = signal(false);
}

const label = (el: HTMLElement): string | undefined => el.textContent?.replace(/\s+/g, ' ').trim();

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const el = (id: string): HTMLElement => fixture.nativeElement.querySelector(`#${id}`);
  const iconOf = (id: string): HTMLElement | null => el(id).querySelector('asys-icon');
  const glyphOf = (id: string): string | null | undefined =>
    iconOf(id)?.querySelector('svg')?.getAttribute('data-icon');

  return { fixture, host: fixture.componentInstance, el, iconOf, glyphOf };
};

describe('Button', () => {
  it('names the three sizes', () => {
    expect(ButtonSize.Default).toBe('default');
    expect(ButtonSize.Small).toBe('small');
    expect(ButtonSize.Large).toBe('large');
  });

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

  it('adds asys-button--large only for the large size', async () => {
    const { fixture, host, el } = await setup();

    expect(el('b').classList.contains('asys-button--large')).toBe(false);

    host.size.set(ButtonSize.Large);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--large')).toBe(true);
    expect(el('b').classList.contains('asys-button--small')).toBe(false);

    host.size.set(ButtonSize.Small);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--large')).toBe(false);
    expect(el('b').classList.contains('asys-button--small')).toBe(true);

    host.size.set(ButtonSize.Default);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--large')).toBe(false);
  });

  it('keeps the variant class beside the large size', async () => {
    const { el } = await setup();

    expect(Array.from(el('large').classList).sort()).toEqual(
      ['asys-button', 'asys-button--secondary', 'asys-button--large'].sort(),
    );
  });

  it('adds asys-button--icon only when iconOnly is true', async () => {
    const { fixture, host, el } = await setup();

    expect(el('b').classList.contains('asys-button--icon')).toBe(false);
    expect(el('default').classList.contains('asys-button--icon')).toBe(false);

    host.iconOnly.set(true);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--icon')).toBe(true);
    expect(el('icon-only').classList.contains('asys-button--icon')).toBe(true);

    host.iconOnly.set(false);
    await fixture.whenStable();

    expect(el('b').classList.contains('asys-button--icon')).toBe(false);
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

  it('renders no icon without an icon', async () => {
    const { el, iconOf } = await setup();

    expect(iconOf('b')).toBeNull();
    expect(iconOf('default')).toBeNull();
    expect(el('b').querySelector('svg')).toBeNull();
  });

  it('renders the icon first, before the projected label', async () => {
    const { fixture, host, el, iconOf, glyphOf } = await setup();

    host.icon.set(IconName.Plus);
    await fixture.whenStable();

    expect(el('b').firstElementChild).toBe(iconOf('b'));
    expect(glyphOf('b')).toBe('plus');
    expect(el('b').querySelectorAll('asys-icon').length).toBe(1);
    expect(label(el('b'))).toBe('Go');

    const nodes: Node[] = Array.from(el('b').childNodes);
    const icon = nodes.indexOf(iconOf('b') as Node);
    const text = nodes.findIndex(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.includes('Go'),
    );

    expect(icon).toBeGreaterThanOrEqual(0);
    expect(text).toBeGreaterThan(icon);
  });

  it('follows a change of icon and drops it again for null', async () => {
    const { fixture, host, el, iconOf, glyphOf } = await setup();

    host.icon.set(IconName.Plus);
    await fixture.whenStable();
    host.icon.set(IconName.Check);
    await fixture.whenStable();

    expect(glyphOf('b')).toBe('check');

    host.icon.set(null);
    await fixture.whenStable();

    expect(iconOf('b')).toBeNull();
    expect(label(el('b'))).toBe('Go');
  });

  it('renders the icon on an anchor too', async () => {
    const { el, iconOf, glyphOf } = await setup();

    expect(el('link-icon').firstElementChild).toBe(iconOf('link-icon'));
    expect(glyphOf('link-icon')).toBe('plus');
    expect(label(el('link-icon'))).toBe('Add');
  });

  it('renders the icon beside the large size', async () => {
    const { el, glyphOf } = await setup();

    expect(el('large').classList.contains('asys-button--large')).toBe(true);
    expect(glyphOf('large')).toBe('check');
    expect(label(el('large'))).toBe('Save');
  });

  it('leaves the accessible name of an icon-only button to its consumer', async () => {
    const { el, glyphOf } = await setup();

    expect(el('icon-only').getAttribute('aria-label')).toBe('Add a Task');
    expect(glyphOf('icon-only')).toBe('plus');
    expect(label(el('icon-only'))).toBe('');
  });

  it('does not set an aria-label of its own', async () => {
    const { fixture, host, el } = await setup();

    host.iconOnly.set(true);
    host.icon.set(IconName.Plus);
    await fixture.whenStable();

    expect(el('b').hasAttribute('aria-label')).toBe(false);
  });

  it('projects its content and keeps the native disabled attribute', async () => {
    const { el } = await setup();

    expect(label(el('b'))).toBe('Go');
    expect(el('off').hasAttribute('disabled')).toBe(true);
    expect(el('b').hasAttribute('disabled')).toBe(false);
  });
});
