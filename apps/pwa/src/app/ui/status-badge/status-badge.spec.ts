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

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const badge = (): HTMLElement => fixture.nativeElement.querySelector('asys-status-badge');

  return { fixture, host: fixture.componentInstance, badge };
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
});
