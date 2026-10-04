// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Quadrant } from '@asys/domain';

import { QuadrantChip } from './quadrant-chip';

@Component({
  imports: [QuadrantChip],
  template: `<asys-quadrant-chip [quadrant]="quadrant()" />`,
})
class Host {
  readonly quadrant = signal(Quadrant.Do);
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const chip = (): HTMLElement => fixture.nativeElement.querySelector('asys-quadrant-chip');

  return { fixture, host: fixture.componentInstance, chip };
};

describe('QuadrantChip', () => {
  it.each([
    [Quadrant.Do, 'asys-quadrant--do', 'Do'],
    [Quadrant.Plan, 'asys-quadrant--plan', 'Plan'],
    [Quadrant.Delegate, 'asys-quadrant--delegate', 'Delegate'],
    [Quadrant.Drop, 'asys-quadrant--drop', 'Drop'],
  ])('renders %s with exactly the class %s and the word %s', async (quadrant, modifier, word) => {
    const { fixture, host, chip } = await setup();

    host.quadrant.set(quadrant);
    await fixture.whenStable();

    expect(Array.from(chip().classList).sort()).toEqual(['asys-quadrant', modifier].sort());
    expect(chip().textContent?.trim()).toBe(word);
  });

  it('updates the class and the word when the input changes', async () => {
    const { fixture, host, chip } = await setup();

    host.quadrant.set(Quadrant.Plan);
    await fixture.whenStable();
    host.quadrant.set(Quadrant.Drop);
    await fixture.whenStable();

    expect(chip().classList.contains('asys-quadrant--plan')).toBe(false);
    expect(chip().classList.contains('asys-quadrant--drop')).toBe(true);
    expect(chip().textContent?.trim()).toBe('Drop');
  });
});
