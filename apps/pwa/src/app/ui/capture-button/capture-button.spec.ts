// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CaptureButton } from './capture-button';

@Component({
  imports: [CaptureButton],
  template: `<button asys-capture-button></button>`,
})
class Host {}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  return fixture.nativeElement.querySelector('button') as HTMLButtonElement;
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
});
