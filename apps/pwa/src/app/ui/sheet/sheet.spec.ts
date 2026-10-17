// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Sheet } from './sheet';

let probes = 0;

@Component({
  selector: 'asys-probe',
  template: `<p class="probe">Probe</p>`,
})
class Probe {
  readonly serial = ++probes;
}

@Component({
  imports: [Sheet, Probe],
  template: `
    <asys-sheet heading="Due" [(open)]="open">
      <ng-template><asys-probe /></ng-template>
    </asys-sheet>
  `,
})
class Host {
  readonly open = signal(false);
}

@Component({
  imports: [Sheet],
  template: `
    <asys-sheet heading="Due" [(open)]="first"><ng-template>One</ng-template></asys-sheet>
    <asys-sheet heading="Estimate" [(open)]="second"><ng-template>Two</ng-template></asys-sheet>
  `,
})
class TwoHost {
  readonly first = signal(false);

  readonly second = signal(false);
}

const setup = async (open = false) => {
  probes = 0;

  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.open.set(open);
  await fixture.whenStable();

  const dialog = (): HTMLDialogElement => fixture.nativeElement.querySelector('dialog.asys-sheet');
  const probe = (): HTMLElement | null => fixture.nativeElement.querySelector('.probe');
  const closeButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button[aria-label="Close"]');
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement): Promise<void> => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();
  };
  // What Escape or a tap on the backdrop does: the browser closes the dialog and fires `close`.
  const dismiss = async (): Promise<void> => {
    dialog().open = false;
    dialog().dispatchEvent(new Event('close'));
    await fixture.whenStable();
  };

  return { fixture, host: fixture.componentInstance, dialog, probe, closeButton, press, dismiss };
};

describe('Sheet', () => {
  it('renders a closed dialog with its heading and none of the body', async () => {
    const { fixture, dialog, probe } = await setup();
    const heading = dialog().querySelector('h2.asys-sheet__heading');

    expect(fixture.nativeElement.querySelectorAll('dialog.asys-sheet')).toHaveLength(1);
    expect(dialog().getAttribute('closedby')).toBe('any');
    expect(dialog().hasAttribute('autofocus')).toBe(true);
    expect(dialog().open).toBe(false);
    expect(heading?.textContent?.trim()).toBe('Due');
    expect(heading?.id).not.toBe('');
    expect(dialog().getAttribute('aria-labelledby')).toBe(heading?.id);
    expect(probe()).toBeNull();
    expect(probes).toBe(0);
    expect(fixture.nativeElement.querySelector('asys-sheet')?.hasAttribute('title')).toBe(false);
  });

  it('shows the dialog modally and renders the body when open becomes true', async () => {
    const { fixture, host, dialog, probe } = await setup();
    const showModal = vi.spyOn(dialog(), 'showModal');

    host.open.set(true);
    await fixture.whenStable();

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog().open).toBe(true);
    expect(dialog().querySelector('.asys-sheet__body')?.contains(probe())).toBe(true);
    expect(probes).toBe(1);
  });

  it('does not call showModal again while the dialog is already open', async () => {
    const { fixture, host, dialog } = await setup();
    const showModal = vi.spyOn(dialog(), 'showModal');

    host.open.set(true);
    await fixture.whenStable();
    host.open.set(true);
    await fixture.whenStable();

    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it('opens on its first render when created open', async () => {
    const { dialog, probe } = await setup(true);

    expect(dialog().open).toBe(true);
    expect(probe()).not.toBeNull();
    expect(probes).toBe(1);
  });

  it('closes the dialog and removes the body when the host sets open to false', async () => {
    const { fixture, host, dialog, probe } = await setup(true);

    host.open.set(false);
    await fixture.whenStable();

    expect(dialog().open).toBe(false);
    expect(probe()).toBeNull();
  });

  it('sets open to false, closes the dialog and removes the body on the close button', async () => {
    const { host, dialog, probe, closeButton, press } = await setup(true);

    expect(closeButton().getAttribute('type')).toBe('button');

    await press(closeButton());

    expect(host.open()).toBe(false);
    expect(dialog().open).toBe(false);
    expect(probe()).toBeNull();
  });

  it('sets open to false and removes the body when the dialog fires close (Escape, backdrop)', async () => {
    const { host, dialog, probe, dismiss } = await setup(true);

    await dismiss();

    expect(host.open()).toBe(false);
    expect(dialog().open).toBe(false);
    expect(probe()).toBeNull();
  });

  it('sets open to false when the dialog is closed through its own close()', async () => {
    const { fixture, host, dialog, probe } = await setup(true);

    dialog().close();
    await fixture.whenStable();

    expect(host.open()).toBe(false);
    expect(probe()).toBeNull();
  });

  it('renders a fresh body each time it opens', async () => {
    const { fixture, host, probe, dismiss } = await setup(true);

    expect(probes).toBe(1);

    await dismiss();

    expect(probe()).toBeNull();

    host.open.set(true);
    await fixture.whenStable();

    expect(probe()).not.toBeNull();
    expect(probes).toBe(2);
  });

  it('opens again after the close button closed it', async () => {
    const { fixture, host, dialog, closeButton, press } = await setup(true);

    await press(closeButton());
    host.open.set(true);
    await fixture.whenStable();

    expect(dialog().open).toBe(true);
    expect(host.open()).toBe(true);
  });

  it('gives each sheet its own heading id, and labels each dialog by its own heading', async () => {
    const fixture = TestBed.createComponent(TwoHost);
    await fixture.whenStable();

    const dialogs = Array.from<HTMLDialogElement>(
      fixture.nativeElement.querySelectorAll('dialog.asys-sheet'),
    );
    const headings = dialogs.map((d) => d.querySelector('h2.asys-sheet__heading'));

    expect(dialogs).toHaveLength(2);
    expect(headings.map((h) => h?.textContent?.trim())).toEqual(['Due', 'Estimate']);
    expect(headings[0]?.id).not.toBe('');
    expect(headings[0]?.id).not.toBe(headings[1]?.id);
    expect(dialogs[0].getAttribute('aria-labelledby')).toBe(headings[0]?.id);
    expect(dialogs[1].getAttribute('aria-labelledby')).toBe(headings[1]?.id);
  });

  it('opens only the sheet whose model is true', async () => {
    const fixture = TestBed.createComponent(TwoHost);
    await fixture.whenStable();

    fixture.componentInstance.second.set(true);
    await fixture.whenStable();

    const dialogs = Array.from<HTMLDialogElement>(
      fixture.nativeElement.querySelectorAll('dialog.asys-sheet'),
    );

    expect(dialogs.map((d) => d.open)).toEqual([false, true]);
    expect(dialogs[0].textContent).not.toContain('One');
    expect(dialogs[1].textContent).toContain('Two');
  });

  it('throws nothing when destroyed while open', async () => {
    const { fixture, dialog } = await setup(true);

    expect(dialog().open).toBe(true);
    expect(() => fixture.destroy()).not.toThrow();
  });
});
