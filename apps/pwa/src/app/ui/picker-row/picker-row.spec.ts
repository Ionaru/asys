// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { Quadrant } from '@asys/domain';

import { PickerRow, PickerRowVariant } from './picker-row';

@Component({
  imports: [PickerRow, RouterLink],
  template: `
    <a
      asys-picker-row
      routerLink="/tasks/42"
      [reason]="reason()"
      [estimate]="estimate()"
      [quadrant]="quadrant()"
      [overdue]="overdue()"
      [variant]="variant()"
      >Call Marit</a
    >
  `,
})
class Host {
  readonly reason = signal('Due today');

  readonly estimate = signal('25 min');

  readonly quadrant = signal<Quadrant | undefined>(Quadrant.Do);

  readonly overdue = signal(false);

  readonly variant = signal(PickerRowVariant.Ranked);
}

const setup = async () => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });

  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const row = (): HTMLAnchorElement => fixture.nativeElement.querySelector('a');
  const q = (selector: string): HTMLElement | null => row().querySelector(selector);

  return { fixture, host: fixture.componentInstance, row, q };
};

describe('PickerRow', () => {
  it('is an anchor with an href from routerLink', async () => {
    const { row } = await setup();

    expect(row().tagName).toBe('A');
    expect(row().getAttribute('href')).toBe('/tasks/42');
  });

  it('projects the title and renders reason and estimate', async () => {
    const { q } = await setup();

    expect(q('.asys-picker-row__title')?.textContent?.trim()).toBe('Call Marit');
    expect(q('.asys-picker-row__reason-text')?.textContent?.trim()).toBe('Due today');
    expect(q('.asys-picker-row__estimate')?.textContent?.trim()).toBe('25 min');
  });

  it('shows the Overdue badge only when overdue', async () => {
    const { fixture, host, q } = await setup();

    expect(q('asys-status-badge')).toBeNull();

    host.overdue.set(true);
    await fixture.whenStable();

    expect(q('asys-status-badge')?.textContent?.trim()).toBe('Overdue');
    expect(q('.asys-picker-row__reason asys-status-badge')).not.toBeNull();

    host.overdue.set(false);
    await fixture.whenStable();

    expect(q('asys-status-badge')).toBeNull();
  });

  it('shows the quadrant chip only when a quadrant is set', async () => {
    const { fixture, host, q } = await setup();

    expect(
      q('.asys-picker-row__side asys-quadrant-chip')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toBe('Quadrant: Do');

    host.quadrant.set(undefined);
    await fixture.whenStable();

    expect(q('asys-quadrant-chip')).toBeNull();
  });

  it('has only the base class for the ranked variant', async () => {
    const { row } = await setup();

    expect(row().classList.contains('asys-picker-row')).toBe(true);
    expect(row().classList.contains('asys-picker-row--waiting')).toBe(false);
    expect(row().classList.contains('asys-picker-row--urgent-elsewhere')).toBe(false);
  });

  it('adds the waiting class for the waiting variant', async () => {
    const { fixture, host, row } = await setup();

    host.variant.set(PickerRowVariant.Waiting);
    await fixture.whenStable();

    expect(row().classList.contains('asys-picker-row')).toBe(true);
    expect(row().classList.contains('asys-picker-row--waiting')).toBe(true);
    expect(row().classList.contains('asys-picker-row--urgent-elsewhere')).toBe(false);
  });

  it('adds the urgent-elsewhere class for the urgent-elsewhere variant', async () => {
    const { fixture, host, row } = await setup();

    host.variant.set(PickerRowVariant.UrgentElsewhere);
    await fixture.whenStable();

    expect(row().classList.contains('asys-picker-row')).toBe(true);
    expect(row().classList.contains('asys-picker-row--urgent-elsewhere')).toBe(true);
    expect(row().classList.contains('asys-picker-row--waiting')).toBe(false);
  });
});

@Component({
  imports: [PickerRow, RouterLink],
  template: `
    <a
      asys-picker-row
      routerLink="/tasks/42"
      reason="Due today"
      estimate="25 min"
      [taskId]="taskId()"
      [morph]="morph()"
      >Call Marit</a
    >
  `,
})
class HookHost {
  readonly taskId = signal<string | null>(null);

  readonly morph = signal(false);
}

const setupHooks = async () => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });

  const fixture = TestBed.createComponent(HookHost);
  await fixture.whenStable();

  const row = (): HTMLAnchorElement => fixture.nativeElement.querySelector('a');
  const title = (): HTMLElement => row().querySelector('.asys-picker-row__title') as HTMLElement;
  const withAttribute = (name: string): Element[] =>
    Array.from(fixture.nativeElement.querySelectorAll(`[${name}]`));

  return { fixture, host: fixture.componentInstance, row, title, withAttribute };
};

describe('PickerRow task hooks', () => {
  it('puts data-task-id and data-morph on the title only, and leaves the host anchor alone', async () => {
    const { fixture, host, row, title, withAttribute } = await setupHooks();
    const classesBefore = Array.from(row().classList);

    host.taskId.set('42');
    host.morph.set(true);
    await fixture.whenStable();

    expect(title().getAttribute('data-task-id')).toBe('42');
    expect(title().hasAttribute('data-morph')).toBe(true);
    expect(title().getAttribute('data-morph')).toBe('');
    expect(withAttribute('data-task-id')).toHaveLength(1);
    expect(withAttribute('data-task-id')[0]).toBe(title());
    expect(withAttribute('data-morph')).toHaveLength(1);
    expect(withAttribute('data-morph')[0]).toBe(title());

    expect(row().tagName).toBe('A');
    expect(row().getAttribute('href')).toBe('/tasks/42');
    expect(row().hasAttribute('data-task-id')).toBe(false);
    expect(row().hasAttribute('data-morph')).toBe(false);
    expect(classesBefore).toContain('asys-picker-row');
    expect(Array.from(row().classList)).toEqual(classesBefore);
  });

  it('drops data-morph when morph is false and data-task-id when taskId is null', async () => {
    const { fixture, host, title } = await setupHooks();

    expect(title().hasAttribute('data-task-id')).toBe(false);
    expect(title().hasAttribute('data-morph')).toBe(false);

    host.taskId.set('42');
    host.morph.set(true);
    await fixture.whenStable();

    host.morph.set(false);
    host.taskId.set(null);
    await fixture.whenStable();

    expect(title().hasAttribute('data-task-id')).toBe(false);
    expect(title().hasAttribute('data-morph')).toBe(false);
  });

  it('has neither attribute while neither input is bound', async () => {
    const { q } = await setup();

    expect(q('.asys-picker-row__title')?.hasAttribute('data-task-id')).toBe(false);
    expect(q('.asys-picker-row__title')?.hasAttribute('data-morph')).toBe(false);
    expect(q('[data-task-id]')).toBeNull();
    expect(q('[data-morph]')).toBeNull();
  });
});
