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

/** The text a screen reader reads: whitespace collapsed and trimmed. */
const textOf = (button: HTMLElement): string =>
  (button.textContent ?? '').replace(/\s+/g, ' ').trim();

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

  return { fixture, button, countBadge: button.querySelector('.asys-capture__count') };
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

    expect(textOf(button)).toBe('Capture');
  });

  it('draws the plus icon first, in Regular, before the label', async () => {
    const button = await setup();
    const icon = button.firstElementChild;

    expect(icon?.matches('asys-icon')).toBe(true);
    expect(icon?.querySelector('svg')?.getAttribute('data-icon')).toBe('plus');
    expect(icon?.querySelector('svg')?.getAttribute('data-prefix')).toBe('far');
    expect(icon?.nextElementSibling?.classList.contains('asys-capture__label')).toBe(true);
  });

  it('puts the word in the label', async () => {
    const button = await setup();

    expect(button.querySelector('.asys-capture__label')?.textContent?.trim()).toBe('Capture');
  });

  it('has no count and reads exactly Capture at a count of 0', async () => {
    const { button, countBadge } = await setupWith(0);

    expect(countBadge).toBeNull();
    expect(textOf(button)).toBe('Capture');
  });

  it('shows the count in __count with a visually hidden "not captured"', async () => {
    const { button, countBadge } = await setupWith(3);

    expect(countBadge?.firstChild?.textContent).toBe('3');
    expect(countBadge?.querySelector('.asys-visually-hidden')?.textContent).toBe(' not captured');
    expect(textOf(button)).toBe('Capture 3 not captured');
  });

  it('puts the icon, the label and the count in that order', async () => {
    const { button } = await setupWith(2);
    const children = Array.from(button.children);

    expect(children).toHaveLength(3);
    expect(children[0].matches('asys-icon')).toBe(true);
    expect(children[1].classList.contains('asys-capture__label')).toBe(true);
    expect(children[2].classList.contains('asys-capture__count')).toBe(true);
  });

  it('reads "Capture 1 not captured" as one phrase at a count of 1', async () => {
    const { button } = await setupWith(1);

    expect(textOf(button)).toBe('Capture 1 not captured');
  });

  it.each([0, 1, 3])('has no __badge at a count of %d', async (count) => {
    const { button } = await setupWith(count);

    expect(button.querySelector('.asys-capture__badge')).toBeNull();
  });

  it('updates the count when it changes and removes it again at 0', async () => {
    const { fixture, button } = await setupWith(1);

    expect(button.querySelector('.asys-capture__count')?.firstChild?.textContent).toBe('1');

    fixture.componentInstance.count.set(2);
    await fixture.whenStable();

    expect(button.querySelector('.asys-capture__count')?.firstChild?.textContent).toBe('2');
    expect(textOf(button)).toBe('Capture 2 not captured');

    fixture.componentInstance.count.set(0);
    await fixture.whenStable();

    expect(button.querySelector('.asys-capture__count')).toBeNull();
    expect(textOf(button)).toBe('Capture');
  });
});
