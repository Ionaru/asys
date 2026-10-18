// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SyncNote } from './sync-note';

@Component({
  imports: [SyncNote],
  template: `<p asys-sync-note></p>
    <p asys-sync-note class="inbox__sync"></p>`,
})
class Host {}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const notes = (): HTMLParagraphElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('p[asys-sync-note]'));

  return { fixture, notes };
};

describe('SyncNote', () => {
  it('has the class asys-sync-note and the waiting text', async () => {
    const { notes } = await setup();

    expect(notes()[0].classList.contains('asys-sync-note')).toBe(true);
    expect(notes()[0].textContent?.trim()).toBe('Saved. Waiting for the server.');
  });

  it('keeps a class the page puts on the same paragraph', async () => {
    const { notes } = await setup();

    expect(notes()[1].classList.contains('inbox__sync')).toBe(true);
    expect(notes()[1].classList.contains('asys-sync-note')).toBe(true);
    expect(notes()[1].textContent?.trim()).toBe('Saved. Waiting for the server.');
  });
});
