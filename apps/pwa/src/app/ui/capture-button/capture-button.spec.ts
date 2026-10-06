// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CaptureButton } from './capture-button';

@Component({
  imports: [CaptureButton],
  template: `<button asys-capture-button [count]="count()"></button>`,
})
class Host {
  readonly count = signal(0);
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  return fixture.nativeElement.querySelector('button') as HTMLButtonElement;
};

const setupWith = async (count: number) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.count.set(count);
  await fixture.whenStable();

  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  return { fixture, button, badge: button.querySelector('.asys-capture__badge') };
};

describe('CaptureButton', () => {
  it('has the asys-capture class', async () => {
    const button = await setup();

    expect(button.classList.contains('asys-capture')).toBe(true);
  });

  it('is a plain button, not a submit button', async () => {
    const button = await setup();

    expect(button.getAttribute('type')).toBe('button');
  });

  it('reads Capture', async () => {
    const button = await setup();

    expect(button.textContent?.trim()).toBe('Capture');
  });

  it('has no badge and reads exactly Capture at a count of 0', async () => {
    const { button, badge } = await setupWith(0);

    expect(badge).toBeNull();
    expect(button.textContent).toBe('Capture');
  });

  it('shows the count in a badge with a visually hidden "not captured"', async () => {
    const { button, badge } = await setupWith(3);

    expect(badge?.firstChild?.textContent).toBe('3');
    expect(badge?.querySelector('.asys-visually-hidden')?.textContent).toBe(' not captured');
    expect(button.textContent?.trim().startsWith('Capture')).toBe(true);
    expect(button.textContent).toContain('3 not captured');
  });

  it('reads "Capture 1 not captured" as one phrase at a count of 1', async () => {
    const { button } = await setupWith(1);

    expect(button.textContent).toBe('Capture 1 not captured');
  });

  it('updates the badge when the count changes and removes it again at 0', async () => {
    const { fixture, button } = await setupWith(1);

    expect(button.querySelector('.asys-capture__badge')?.firstChild?.textContent).toBe('1');

    fixture.componentInstance.count.set(2);
    await fixture.whenStable();

    expect(button.querySelector('.asys-capture__badge')?.firstChild?.textContent).toBe('2');

    fixture.componentInstance.count.set(0);
    await fixture.whenStable();

    expect(button.querySelector('.asys-capture__badge')).toBeNull();
    expect(button.textContent).toBe('Capture');
  });
});
