// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ActionBar } from './action-bar';

@Component({
  imports: [ActionBar],
  template: `
    <footer asys-action-bar class="screen__actions">
      <button type="button">First</button>
      <button type="button">Second</button>
    </footer>
    <footer class="plain"></footer>
  `,
})
class Host {}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);

  await fixture.whenStable();

  return fixture.nativeElement as HTMLElement;
};

describe('ActionBar', () => {
  it('adds the host class and keeps the screen class', async () => {
    const root = await setup();
    const bar = root.querySelector('footer[asys-action-bar]');

    expect(bar?.classList.contains('asys-action-bar')).toBe(true);
    expect(bar?.classList.contains('screen__actions')).toBe(true);
  });

  it('projects its content in order', async () => {
    const root = await setup();
    const buttons = [...root.querySelectorAll('footer[asys-action-bar] > button')];

    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['First', 'Second']);
  });

  it('leaves a footer without the attribute alone', async () => {
    const root = await setup();

    expect(root.querySelector('footer.plain')?.classList.contains('asys-action-bar')).toBe(false);
  });

  it('sticks above the nav, the Undo bar and open quick add', async () => {
    const root = await setup();
    const bar = root.querySelector('footer[asys-action-bar]');
    const bottom = getComputedStyle(bar as Element).bottom;

    expect(bottom).toContain('var(--shell-nav-height, 0px)');
    expect(bottom).toContain('var(--shell-undo-height, 0px)');
    expect(bottom).toContain('var(--shell-quickadd-height, 0px)');
  });
});
