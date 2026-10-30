// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Label, LabelNeed } from './label';

@Component({
  imports: [Label],
  template: `
    <label asys-label for="a">Name</label>
    <legend asys-label>Group</legend>
    <span asys-label id="c">Estimate</span>
    <label for="b">Plain</label>
    <label asys-label id="n" [need]="need()">Importance</label>
  `,
})
class Host {
  readonly need = signal<LabelNeed>(LabelNeed.None);
}

describe('Label', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(Host);

    await fixture.whenStable();

    return { root: fixture.nativeElement as HTMLElement, host: fixture.componentInstance, fixture };
  };

  it('adds asys-label to a label', async () => {
    const { root } = await setup();

    expect(root.querySelector('label[for="a"]')?.classList.contains('asys-label')).toBe(true);
  });

  it('adds asys-label to a legend', async () => {
    const { root } = await setup();

    expect(root.querySelector('legend')?.classList.contains('asys-label')).toBe(true);
  });

  it('adds asys-label to the span that names a group', async () => {
    const { root } = await setup();

    expect(root.querySelector('#c')?.classList.contains('asys-label')).toBe(true);
  });

  it('leaves a label without the attribute alone', async () => {
    const { root } = await setup();

    expect(root.querySelector('label[for="b"]')?.classList.contains('asys-label')).toBe(false);
  });

  it('shows no marker by default', async () => {
    const { root } = await setup();

    expect(root.querySelector('#n .asys-label__need')).toBeNull();
    expect(root.querySelector('#n')?.textContent?.trim()).toBe('Importance');
  });

  it('shows Needed after the text', async () => {
    const { root, host, fixture } = await setup();

    host.need.set(LabelNeed.Needed);
    await fixture.whenStable();

    const need = root.querySelector('#n .asys-label__need');

    expect(need?.textContent?.trim()).toBe('Needed');
    expect(need?.classList.contains('asys-label__need--missing')).toBe(false);
    expect(need?.querySelector('asys-icon')).toBeNull();
    expect(root.querySelector('#n')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Importance Needed',
    );
  });

  it('shows Needed with an icon and the missing modifier when Missing', async () => {
    const { root, host, fixture } = await setup();

    host.need.set(LabelNeed.Missing);
    await fixture.whenStable();

    const need = root.querySelector('#n .asys-label__need');

    expect(need?.classList.contains('asys-label__need--missing')).toBe(true);
    expect(need?.querySelector('asys-icon')).not.toBeNull();
    expect(need?.textContent?.trim()).toBe('Needed');
  });

  it('removes the marker again when the need goes away', async () => {
    const { root, host, fixture } = await setup();

    host.need.set(LabelNeed.Missing);
    await fixture.whenStable();
    host.need.set(LabelNeed.None);
    await fixture.whenStable();

    expect(root.querySelector('#n .asys-label__need')).toBeNull();
  });
});
