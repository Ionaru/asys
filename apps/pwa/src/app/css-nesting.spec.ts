// SPDX-License-Identifier: EUPL-1.2
import { Component, ViewEncapsulation } from '@angular/core';
import { TestBed } from '@angular/core/testing';

@Component({
  selector: 'asys-nesting-guard-emulated',
  host: { class: 'nesting-guard-emulated--on' },
  template: '<span class="nesting-guard-emulated__part">part</span>',
  styles: `
    :host {
      display: block;

      &.nesting-guard-emulated--on {
        display: flex;
      }

      & .nesting-guard-emulated__part {
        display: grid;
      }
    }
  `,
})
class NestingGuardEmulated {}

@Component({
  selector: 'asys-nesting-guard-none',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'nesting-guard-none nesting-guard-none--on' },
  template: '<span class="nesting-guard-none__part">part</span>',
  styles: `
    .nesting-guard-none {
      display: block;

      &.nesting-guard-none--on {
        display: flex;
      }

      & .nesting-guard-none__part {
        display: grid;
      }
    }
  `,
})
class NestingGuardNone {}

const styleTextContaining = (needle: string): string | undefined =>
  Array.from(document.querySelectorAll('style'))
    .map((el) => el.textContent ?? '')
    .find((text) => text.includes(needle));

// Angular flattens nested component styles at build time today. If a later
// Angular stops doing that, nesting reaches the browser unflattened and these
// tests go red. The convention for that day is in building-pwa-ui, CSS nesting.
describe('CSS nesting guard (if a test fails, nesting reaches the browser unflattened: see CSS nesting in building-pwa-ui)', () => {
  it('ships emulated nesting flattened', async () => {
    const fixture = TestBed.createComponent(NestingGuardEmulated);
    await fixture.whenStable();

    const css = styleTextContaining('nesting-guard-emulated__part');

    expect(css).toBeDefined();
    expect(css).not.toContain('&');
  });

  it('applies emulated nested rules', async () => {
    const fixture = TestBed.createComponent(NestingGuardEmulated);
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;
    const part = host.querySelector('.nesting-guard-emulated__part') as HTMLElement;

    expect(getComputedStyle(host).display).toBe('flex');
    expect(getComputedStyle(part).display).toBe('grid');
  });

  it('ships unencapsulated nesting flattened', async () => {
    const fixture = TestBed.createComponent(NestingGuardNone);
    await fixture.whenStable();

    const css = styleTextContaining('nesting-guard-none__part');

    expect(css).toBeDefined();
    expect(css).not.toContain('&');
  });

  it('applies unencapsulated nested rules', async () => {
    const fixture = TestBed.createComponent(NestingGuardNone);
    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;
    const part = host.querySelector('.nesting-guard-none__part') as HTMLElement;

    expect(getComputedStyle(host).display).toBe('flex');
    expect(getComputedStyle(part).display).toBe('grid');
  });
});
