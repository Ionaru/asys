// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Label } from './label';

@Component({
  imports: [Label],
  template: `
    <label asys-label for="a">Name</label>
    <legend asys-label>Group</legend>
    <span asys-label id="c">Estimate</span>
    <label for="b">Plain</label>
  `,
})
class Host {}

describe('Label', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(Host);

    await fixture.whenStable();

    return fixture.nativeElement as HTMLElement;
  };

  it('adds asys-label to a label', async () => {
    const root = await setup();

    expect(root.querySelector('label[for="a"]')?.classList.contains('asys-label')).toBe(true);
  });

  it('adds asys-label to a legend', async () => {
    const root = await setup();

    expect(root.querySelector('legend')?.classList.contains('asys-label')).toBe(true);
  });

  it('adds asys-label to the span that names a group', async () => {
    const root = await setup();

    expect(root.querySelector('#c')?.classList.contains('asys-label')).toBe(true);
  });

  it('leaves a label without the attribute alone', async () => {
    const root = await setup();

    expect(root.querySelector('label[for="b"]')?.classList.contains('asys-label')).toBe(false);
  });
});
