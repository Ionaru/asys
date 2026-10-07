// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { LoadState } from './load-state';

@Component({
  imports: [LoadState],
  template: `<asys-load-state [failed]="failed()" (retry)="retries.set(retries() + 1)" />`,
})
class Host {
  readonly failed = signal(false);
  readonly retries = signal(0);
}

const setup = async (failed = false) => {
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.failed.set(failed);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement.querySelector('asys-load-state');
  const paragraphs = (): HTMLParagraphElement[] => Array.from(root().querySelectorAll('p'));
  const buttons = (): HTMLButtonElement[] => Array.from(root().querySelectorAll('button'));
  const set = async (value: boolean) => {
    fixture.componentInstance.failed.set(value);
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, root, paragraphs, buttons, set };
};

describe('LoadState', () => {
  it('has the class asys-load-state on its host element', async () => {
    const { root } = await setup();

    expect(root().classList.contains('asys-load-state')).toBe(true);
  });

  it('shows only a plain Loading paragraph while failed is false', async () => {
    const { paragraphs, buttons } = await setup(false);

    expect(paragraphs()).toHaveLength(1);
    expect(paragraphs()[0].textContent?.trim()).toBe('Loading…');
    expect(paragraphs()[0].hasAttribute('role')).toBe(false);
    expect(buttons()).toHaveLength(0);
  });

  it('shows the alert and a quiet Try again button while failed is true', async () => {
    const { paragraphs, buttons } = await setup(true);

    expect(paragraphs()).toHaveLength(1);
    expect(paragraphs()[0].getAttribute('role')).toBe('alert');
    expect(paragraphs()[0].textContent?.trim()).toBe('ASYS could not load your Tasks.');
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].getAttribute('type')).toBe('button');
    expect(buttons()[0].textContent?.trim()).toBe('Try again');
    expect(buttons()[0].classList.contains('asys-button--quiet')).toBe(true);
  });

  it('emits nothing on retry before a click', async () => {
    const { host } = await setup(true);

    expect(host.retries()).toBe(0);
  });

  it('emits retry exactly once per click', async () => {
    const { fixture, host, buttons } = await setup(true);

    buttons()[0].click();
    await fixture.whenStable();

    expect(host.retries()).toBe(1);
  });

  it('replaces the alert and button with Loading when failed goes from true to false', async () => {
    const { paragraphs, buttons, set } = await setup(true);

    await set(false);

    expect(paragraphs()).toHaveLength(1);
    expect(paragraphs()[0].textContent?.trim()).toBe('Loading…');
    expect(paragraphs()[0].hasAttribute('role')).toBe(false);
    expect(buttons()).toHaveLength(0);
  });

  it('replaces Loading with the alert and button when failed goes from false to true', async () => {
    const { paragraphs, buttons, set } = await setup(false);

    await set(true);

    expect(paragraphs()).toHaveLength(1);
    expect(paragraphs()[0].getAttribute('role')).toBe('alert');
    expect(paragraphs()[0].textContent?.trim()).toBe('ASYS could not load your Tasks.');
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0].textContent?.trim()).toBe('Try again');
  });
});
