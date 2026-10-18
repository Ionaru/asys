// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { StatusBadge, StatusBadgeStatus } from './status-badge';

@Component({
  imports: [StatusBadge],
  template: `<asys-status-badge [status]="status()" />`,
})
class Host {
  readonly status = signal(StatusBadgeStatus.Overdue);
}

const ICONS = [
  [StatusBadgeStatus.Overdue, 'circle-exclamation', 'Overdue'],
  [StatusBadgeStatus.Blocked, 'ban', 'Blocked'],
  [StatusBadgeStatus.Delegated, 'user', 'Delegated'],
  [StatusBadgeStatus.Done, 'check', 'Done'],
  [StatusBadgeStatus.Dropped, 'xmark', 'Dropped'],
  [StatusBadgeStatus.Skipped, 'forward', 'Skipped'],
  [StatusBadgeStatus.Queued, 'cloud-arrow-up', 'Queued'],
] as const;

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const badge = (): HTMLElement => fixture.nativeElement.querySelector('asys-status-badge');
  const glyph = (): string | null | undefined =>
    badge().querySelector('svg[data-icon]')?.getAttribute('data-icon');

  return { fixture, host: fixture.componentInstance, badge, glyph };
};

describe('StatusBadge', () => {
  it.each([
    [StatusBadgeStatus.Overdue, 'asys-badge--overdue', 'Overdue'],
    [StatusBadgeStatus.Blocked, 'asys-badge--blocked', 'Blocked'],
    [StatusBadgeStatus.Delegated, 'asys-badge--delegated', 'Delegated'],
    [StatusBadgeStatus.Done, 'asys-badge--done', 'Done'],
    [StatusBadgeStatus.Dropped, 'asys-badge--dropped', 'Dropped'],
    [StatusBadgeStatus.Skipped, 'asys-badge--skipped', 'Skipped'],
    [StatusBadgeStatus.Queued, 'asys-badge--queued', 'Queued'],
  ])('renders %s with exactly the class %s and the word %s', async (status, modifier, word) => {
    const { fixture, host, badge } = await setup();

    host.status.set(status);
    await fixture.whenStable();

    expect(Array.from(badge().classList).sort()).toEqual(['asys-badge', modifier].sort());
    expect(badge().textContent?.trim()).toBe(word);
  });

  it('updates the class and the word when the input changes', async () => {
    const { fixture, host, badge } = await setup();

    host.status.set(StatusBadgeStatus.Blocked);
    await fixture.whenStable();
    host.status.set(StatusBadgeStatus.Done);
    await fixture.whenStable();

    expect(badge().classList.contains('asys-badge--blocked')).toBe(false);
    expect(badge().classList.contains('asys-badge--done')).toBe(true);
    expect(badge().textContent?.trim()).toBe('Done');
  });

  it.each(ICONS)(
    'draws the %s badge with the %s icon and the bare word %s',
    async (status, glyphName, word) => {
      const { fixture, host, badge, glyph } = await setup();

      host.status.set(status);
      await fixture.whenStable();

      expect(glyph()).toBe(glyphName);
      expect(badge().querySelectorAll('svg[data-icon]').length).toBe(1);
      expect(badge().firstElementChild?.tagName.toLowerCase()).toBe('asys-icon');
      expect(badge().textContent?.trim()).toBe(word);
    },
  );

  it('swaps the icon when the status changes', async () => {
    const { fixture, host, badge, glyph } = await setup();

    expect(glyph()).toBe('circle-exclamation');

    host.status.set(StatusBadgeStatus.Skipped);
    await fixture.whenStable();

    expect(glyph()).toBe('forward');
    expect(badge().querySelectorAll('asys-icon').length).toBe(1);
  });
});
