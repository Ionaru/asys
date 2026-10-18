// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Input, InputVariant } from './input';

@Component({
  imports: [Input],
  template: `
    <input asys-input id="text" [variant]="variant()" />
    <textarea asys-input id="area" [variant]="variant()"></textarea>
    <select asys-input id="pick" [variant]="variant()"></select>
    <input id="plain" />
  `,
})
class Host {
  readonly variant = signal(InputVariant.Default);
}

describe('Input', () => {
  const setup = async () => {
    const fixture = TestBed.createComponent(Host);

    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const get = (id: string): HTMLElement => root.querySelector(`#${id}`) as HTMLElement;

    return { fixture, host: fixture.componentInstance, get };
  };

  it('has the string values the contract names', () => {
    expect([InputVariant.Default, InputVariant.Title, InputVariant.Grow]).toEqual([
      'default',
      'title',
      'grow',
    ]);
  });

  it.each(['text', 'area', 'pick'])('adds asys-input to the %s control only', async (id) => {
    const { get } = await setup();

    expect(get(id).classList.contains('asys-input')).toBe(true);
    expect(get('plain').classList.contains('asys-input')).toBe(false);
  });

  it('adds no variant class by default', async () => {
    const { get } = await setup();

    expect(get('area').classList.contains('asys-input--title')).toBe(false);
    expect(get('area').classList.contains('asys-input--grow')).toBe(false);
  });

  it('adds only asys-input--title for the Title variant', async () => {
    const { fixture, host, get } = await setup();

    host.variant.set(InputVariant.Title);
    await fixture.whenStable();

    expect(get('area').classList.contains('asys-input--title')).toBe(true);
    expect(get('area').classList.contains('asys-input--grow')).toBe(false);
  });

  it('adds only asys-input--grow for the Grow variant', async () => {
    const { fixture, host, get } = await setup();

    host.variant.set(InputVariant.Grow);
    await fixture.whenStable();

    expect(get('area').classList.contains('asys-input--grow')).toBe(true);
    expect(get('area').classList.contains('asys-input--title')).toBe(false);
  });

  it('drops the variant class when the variant goes back to Default', async () => {
    const { fixture, host, get } = await setup();

    host.variant.set(InputVariant.Title);
    await fixture.whenStable();
    host.variant.set(InputVariant.Default);
    await fixture.whenStable();

    expect(get('area').classList.contains('asys-input--title')).toBe(false);
    expect(get('area').classList.contains('asys-input')).toBe(true);
  });
});
