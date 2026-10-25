// SPDX-License-Identifier: EUPL-1.2
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { provideRouter } from '@angular/router';

import { AccountTemplate, PasskeyRow } from './account-template';

const defaultRow: PasskeyRow = {
  credentialId: 'c1',
  name: 'Phone',
  created: 'Mon 5 Oct',
  lastUsed: null,
};

const setup = async (overrides: Record<string, unknown> = {}) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(AccountTemplate);
  const action = vi.fn(async () => undefined);
  const addForm = TestBed.runInInjectionContext(() =>
    form(signal({ name: '' }), { submission: { action } }),
  );
  const inputs: Record<string, unknown> = {
    name: 'Ada',
    passkeysLoaded: true,
    passkeysLoading: false,
    rows: [defaultRow],
    removing: false,
    removeMessage: null,
    addForm,
    canAdd: true,
    addMessage: null,
    addLoadFailed: false,
    added: false,
    recoveryCodesLeft: 8,
    codes: [],
    regenerating: false,
    copyStatus: null,
    codesMessage: null,
    signingOut: false,
    signOutMessage: null,
    confirmingRemoval: null,
    confirmingCodes: false,
    ...overrides,
  };
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  const buttons = (name: string): HTMLButtonElement[] =>
    [...host.querySelectorAll('button')].filter(
      (candidate) =>
        candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name,
    );
  const button = (name: string): HTMLButtonElement => {
    const found = buttons(name)[0];
    if (found === undefined) throw new Error(`Missing button ${name}`);
    return found;
  };
  const withRole = (role: string): string[] =>
    [...host.querySelectorAll(`[role="${role}"]`)].map((node) => node.textContent?.trim() ?? '');
  const text = (): string => host.textContent?.replaceAll(/\s+/g, ' ') ?? '';
  const update = async (name: string, value: unknown): Promise<void> => {
    fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  };
  return { fixture, host, button, buttons, withRole, text, update, action };
};

describe('AccountTemplate', () => {
  it('B1 shows the heading and the name', async () => {
    const { host } = await setup();
    const h1 = host.querySelector('h1');

    expect(h1?.textContent?.trim()).toBe('Account');
    expect(h1?.nextElementSibling?.textContent?.trim()).toBe('Ada');
  });

  it('B2 lists the passkey with Never used, or its last use', async () => {
    const { host, text, update } = await setup();

    expect(text()).toContain('Phone');
    expect(text()).toContain('Created Mon 5 Oct');
    expect(text()).toContain('Never used');

    await update('rows', [{ ...defaultRow, lastUsed: 'Tue 6 Oct' }]);

    expect(text()).toContain('Last used Tue 6 Oct');
    expect(text()).not.toContain('Never used');
    expect(host.querySelectorAll('li').length).toBeGreaterThan(0);
  });

  it('B3 shows loading, then a retry when the passkeys fail to load', async () => {
    const { fixture, host, text, update, button } = await setup({
      passkeysLoaded: false,
      passkeysLoading: true,
    });

    expect(text()).toContain('Loading your passkeys…');
    expect(text()).not.toContain('Phone');
    expect(host.querySelector('ul')).toBeNull();

    await update('passkeysLoading', false);
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retryPasskeys.subscribe(retry);

    expect(text()).toContain('Could not load your passkeys.');
    button('Try again').click();

    expect(retry).toHaveBeenCalledOnce();
  });

  it('B4 asks for confirmation before removing a passkey', async () => {
    const { fixture, button, text, update } = await setup();

    button('Remove Phone').click();

    expect(fixture.componentInstance.confirmingRemoval()).toBe('c1');

    await update('confirmingRemoval', 'c1');
    const removePasskey = vi.fn<(id: string) => void>();
    fixture.componentInstance.removePasskey.subscribe(removePasskey);

    expect(text()).toContain('Remove Phone? You cannot sign in with it afterwards.');

    button('Remove passkey').click();

    expect(removePasskey).toHaveBeenCalledExactlyOnceWith('c1');

    button('Cancel').click();

    expect(fixture.componentInstance.confirmingRemoval()).toBeNull();

    fixture.componentInstance.confirmingRemoval.set('c1');
    await update('removing', true);

    expect(button('Remove passkey').disabled).toBe(true);
  });

  it('B5 shows the remove message as an alert', async () => {
    const { withRole, update, host } = await setup();

    expect(host.querySelector('[role="alert"]')).toBeNull();

    await update('removeMessage', 'You cannot remove your only passkey.');

    expect(withRole('alert')).toEqual(['You cannot remove your only passkey.']);
  });

  it('B6 focusPasskeys moves focus to the Passkeys heading', async () => {
    const { fixture, host } = await setup();
    const heading = [...host.querySelectorAll('h2')].find(
      (candidate) => candidate.textContent?.trim() === 'Passkeys',
    );

    fixture.componentInstance.focusPasskeys();

    expect(heading).toBeDefined();
    expect(document.activeElement).toBe(heading);
  });

  it('B7 enables adding only when canAdd, labels the field and submits the form', async () => {
    const { host, button, update, action } = await setup();

    expect(button('Add a passkey').disabled).toBe(false);

    await update('canAdd', false);

    expect(button('Add a passkey').disabled).toBe(true);

    const input = [
      ...host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    ].find((candidate) => {
      const labelled = [...(candidate.labels ?? [])].map((label) => label.textContent?.trim());
      return (
        candidate.getAttribute('aria-label') === 'Name for the new passkey' ||
        labelled.includes('Name for the new passkey')
      );
    });
    expect(input).toBeDefined();

    const event = new Event('submit', { cancelable: true });
    input?.closest('form')?.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(action).toHaveBeenCalled();
  });

  it('B8 shows the add message, a retry and the success status', async () => {
    const { fixture, withRole, buttons, update } = await setup({ addMessage: 'x' });

    expect(withRole('alert')).toEqual(['x']);

    await update('addLoadFailed', true);
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retryAddOptions.subscribe(retry);

    expect(buttons('Try again')).toHaveLength(1);
    buttons('Try again')[0]?.click();

    expect(retry).toHaveBeenCalledOnce();

    await update('added', true);

    expect(withRole('status')).toEqual(['Passkey added.']);
  });

  it('B8 shows a second Try again beside the passkey list retry', async () => {
    const { buttons } = await setup({ passkeysLoaded: false, addLoadFailed: true });

    expect(buttons('Try again')).toHaveLength(2);
  });

  it('B9 confirms before making new recovery codes', async () => {
    const { fixture, text, button, update } = await setup();

    expect(text()).toContain('Recovery codes left: 8');

    button('Make new recovery codes').click();

    expect(fixture.componentInstance.confirmingCodes()).toBe(true);

    await update('confirmingCodes', true);
    const makeCodes = vi.fn<() => void>();
    fixture.componentInstance.makeCodes.subscribe(makeCodes);

    expect(text()).toContain(
      'New codes replace all your current codes and sign you out on your other devices.',
    );

    button('Make new codes').click();

    expect(makeCodes).toHaveBeenCalledOnce();

    button('Cancel').click();

    expect(fixture.componentInstance.confirmingCodes()).toBe(false);

    fixture.componentInstance.confirmingCodes.set(true);
    await update('regenerating', true);

    expect(button('Make new codes').disabled).toBe(true);
  });

  it('B10 shows the codes in order and wins over the confirmation', async () => {
    const { fixture, host, text, button, withRole, update } = await setup({
      codes: ['aaaa', 'bbbb'],
      confirmingCodes: true,
    });
    const copyCodes = vi.fn<() => void>();
    const hideCodes = vi.fn<() => void>();
    fixture.componentInstance.copyCodes.subscribe(copyCodes);
    fixture.componentInstance.hideCodes.subscribe(hideCodes);

    expect([...host.querySelectorAll('ol li')].map((item) => item.textContent?.trim())).toEqual([
      'aaaa',
      'bbbb',
    ]);
    expect(text()).toContain('These codes are shown only now. Keep them somewhere safe.');
    expect(text()).not.toContain('New codes replace all your current codes');

    button('Copy').click();
    button('Done').click();

    expect(copyCodes).toHaveBeenCalledOnce();
    expect(hideCodes).toHaveBeenCalledOnce();

    await update('copyStatus', 'Copied.');

    expect(withRole('status')).toEqual(['Copied.']);
  });

  it('B11 shows the codes message as an alert', async () => {
    const { withRole } = await setup({ codesMessage: 'y' });

    expect(withRole('alert')).toEqual(['y']);
  });

  it('B12 reports Sign out, disables it while signing out and shows the message', async () => {
    const { fixture, button, withRole, update } = await setup();
    const signOut = vi.fn<() => void>();
    fixture.componentInstance.signOut.subscribe(signOut);

    button('Sign out').click();

    expect(signOut).toHaveBeenCalledOnce();
    expect(button('Sign out').disabled).toBe(false);

    await update('signingOut', true);

    expect(button('Sign out').disabled).toBe(true);

    await update('signOutMessage', 'Could not sign out. Try again.');

    expect(withRole('alert')).toEqual(['Could not sign out. Try again.']);
  });
});
