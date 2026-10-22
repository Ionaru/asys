// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { provideRouter } from '@angular/router';

import { SignUpStep, SignUpTemplate } from './sign-up-template';

const setup = async (step: SignUpStep) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(SignUpTemplate);
  const nameForm = TestBed.runInInjectionContext(() => form(signal({ name: '' })));
  const inputs = {
    step,
    nameForm,
    name: 'Ann',
    ready: true,
    busy: false,
    message: null,
    loadFailed: false,
    codes: ['one', 'two'],
    copyStatus: null,
  };
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  const button = (text: string): HTMLButtonElement => {
    const found = [...host.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === text,
    );
    if (found === undefined) throw new Error(`Missing button ${text}`);
    return found;
  };
  return { fixture, host, button };
};

describe('SignUpTemplate', () => {
  it.each([
    [SignUpStep.Name, 'Sign up'],
    [SignUpStep.Passkey, 'Sign up'],
    [SignUpStep.Codes, 'Your recovery codes'],
    [SignUpStep.LinkInvalid, 'This Sign-up link does not work'],
    [SignUpStep.AlreadySignedIn, 'Sign up'],
  ])('on the %s step the heading reads %s', async (step, heading) => {
    const { host } = await setup(step);

    expect(host.querySelector('h1')?.textContent?.trim()).toBe(heading);
  });

  it('leaves focus alone at first and moves it to the heading when the step changes', async () => {
    const { fixture, host } = await setup(SignUpStep.Name);

    expect(document.activeElement).not.toBe(host.querySelector('h1'));

    fixture.componentRef.setInput('step', SignUpStep.Passkey);
    await fixture.whenStable();

    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('reports the Passkey step buttons as outputs', async () => {
    const { fixture, button } = await setup(SignUpStep.Passkey);
    const createPasskey = vi.fn<() => void>();
    const changeName = vi.fn<() => void>();
    fixture.componentInstance.createPasskey.subscribe(createPasskey);
    fixture.componentInstance.changeName.subscribe(changeName);

    button('Create passkey').click();
    button('Change name').click();

    expect(createPasskey).toHaveBeenCalledOnce();
    expect(changeName).toHaveBeenCalledOnce();
  });

  it('reports Copy and Continue on the Codes step as outputs', async () => {
    const { fixture, host, button } = await setup(SignUpStep.Codes);
    const copyCodes = vi.fn<() => void>();
    const finish = vi.fn<() => void>();
    fixture.componentInstance.copyCodes.subscribe(copyCodes);
    fixture.componentInstance.finish.subscribe(finish);

    button('Copy').click();
    button('Continue').click();

    expect([...host.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'one',
      'two',
    ]);
    expect(copyCodes).toHaveBeenCalledOnce();
    expect(finish).toHaveBeenCalledOnce();
  });
});
