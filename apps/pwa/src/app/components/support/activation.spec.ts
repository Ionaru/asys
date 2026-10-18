// SPDX-License-Identifier: EUPL-1.2
import { activationOf } from './activation';

const clickWith = (detail: number): MouseEvent => new MouseEvent('click', { detail });

describe('activationOf', () => {
  it('is a keyboard activation for a click with detail 0, as Enter and Space give', () => {
    expect(activationOf(clickWith(0))).toEqual({ keyboard: true });
  });

  it.each([1, 2])('is a pointer activation for a click with detail %i', (detail) => {
    expect(activationOf(clickWith(detail))).toEqual({ keyboard: false });
  });

  it('is a keyboard activation for the click that HTMLElement.click() dispatches', () => {
    const activations: unknown[] = [];
    const button = document.createElement('button');

    button.addEventListener('click', (event) => activations.push(activationOf(event)));
    button.click();

    expect(activations).toEqual([{ keyboard: true }]);
  });
});
