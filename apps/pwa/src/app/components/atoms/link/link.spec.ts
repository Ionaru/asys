// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';

import { Link } from './link';

@Component({
  imports: [Link, RouterLink],
  template: `<a asys-link routerLink="/now" [block]="block()">Go to Now</a>`,
})
class Host {
  readonly block = signal(false);
}

@Component({
  imports: [Link, RouterLink],
  template: `<a asys-link routerLink="/now">Go to Now</a>`,
})
class DefaultHost {}

@Component({
  imports: [Link],
  template: `<a asys-link>Bleed <b>the</b> radiators</a>`,
})
class ProjectingHost {}

const setup = async () => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const link = (): HTMLAnchorElement => fixture.nativeElement.querySelector('a');

  return { fixture, host: fixture.componentInstance, link };
};

describe('Link', () => {
  it('renders an inline anchor with the asys-link class, its href and its text, and no accessibility attributes', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DefaultHost);
    await fixture.whenStable();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a');

    expect(link.tagName).toBe('A');
    expect(link.classList.contains('asys-link')).toBe(true);
    expect(link.classList.contains('asys-link--block')).toBe(false);
    expect(link.getAttribute('href')).toBe('/now');
    expect(link.textContent?.trim()).toBe('Go to Now');
    expect(link.hasAttribute('role')).toBe(false);
    expect(link.getAttributeNames().filter((name) => name.startsWith('aria-'))).toEqual([]);
  });

  it('adds the block class while block is true and removes it when set back', async () => {
    const { fixture, host, link } = await setup();

    host.block.set(true);
    await fixture.whenStable();

    expect(link().classList.contains('asys-link')).toBe(true);
    expect(link().classList.contains('asys-link--block')).toBe(true);

    host.block.set(false);
    await fixture.whenStable();

    expect(link().classList.contains('asys-link')).toBe(true);
    expect(link().classList.contains('asys-link--block')).toBe(false);
  });

  it('gives a block Link flex display and a tap-target minimum height, and an inline Link neither height', async () => {
    const { fixture, host, link } = await setup();

    expect(getComputedStyle(link()).minHeight).not.toBe('var(--tap-target)');

    host.block.set(true);
    await fixture.whenStable();

    expect(getComputedStyle(link()).display).toBe('flex');
    expect(getComputedStyle(link()).minHeight).toBe('var(--tap-target)');
  });

  it('gives a block Link the Voice only tap target when the theme is drive', async () => {
    document.documentElement.setAttribute('data-theme', 'drive');
    onTestFinished(() => document.documentElement.removeAttribute('data-theme'));

    const { fixture, host, link } = await setup();

    host.block.set(true);
    await fixture.whenStable();

    expect(getComputedStyle(link()).minHeight).toBe('var(--tap-target-drive)');
  });

  it('keeps projected content in order with its elements', async () => {
    const fixture = TestBed.createComponent(ProjectingHost);
    await fixture.whenStable();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a');

    expect(link.querySelector('b')?.textContent).toBe('the');
    expect(link.textContent).toBe('Bleed the radiators');
  });
});
