// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { Quadrant } from '@asys/domain';

import { TaskRow, TaskRowVariant } from './task-row';

@Component({
  imports: [TaskRow, RouterLink],
  template: `
    <a
      asys-task-row
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

  readonly variant = signal(TaskRowVariant.Ranked);
}

const setup = async () => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });

  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const row = (): HTMLAnchorElement => fixture.nativeElement.querySelector('a');
  const q = (selector: string): HTMLElement | null => row().querySelector(selector);
  // The children of the reason line, named by what they are, in document order.
  const reasonKinds = (): string[] =>
    Array.from(q('.asys-task-row__reason')?.children ?? [], (child) => {
      if (child.tagName === 'ASYS-QUADRANT-LABEL') {
        return 'chip';
      }

      if (child.tagName === 'ASYS-STATUS-BADGE') {
        return 'badge';
      }

      return child.classList.contains('asys-task-row__reason-text') ? 'text' : child.tagName;
    });

  return { fixture, host: fixture.componentInstance, row, q, reasonKinds };
};

describe('TaskRow', () => {
  it('is an anchor with an href from routerLink', async () => {
    const { row } = await setup();

    expect(row().tagName).toBe('A');
    expect(row().getAttribute('href')).toBe('/tasks/42');
  });

  it('projects the title and renders reason and estimate', async () => {
    const { q } = await setup();

    expect(q('.asys-task-row__title')?.textContent?.trim()).toBe('Call Marit');
    expect(q('.asys-task-row__reason-text')?.textContent?.trim()).toBe('Due today');
    expect(q('.asys-task-row__estimate')?.textContent?.trim()).toBe('25 min');
  });

  it('shows the Overdue badge only when overdue', async () => {
    const { fixture, host, q } = await setup();

    expect(q('asys-status-badge')).toBeNull();

    host.overdue.set(true);
    await fixture.whenStable();

    expect(q('asys-status-badge')?.textContent?.trim()).toBe('Overdue');
    expect(q('.asys-task-row__reason asys-status-badge')).not.toBeNull();

    host.overdue.set(false);
    await fixture.whenStable();

    expect(q('asys-status-badge')).toBeNull();
  });

  it('puts a compact quadrant chip in the reason, and none in the side', async () => {
    const { q } = await setup();
    const chip = q('.asys-task-row__reason asys-quadrant-label');

    expect(chip).not.toBeNull();
    expect(chip?.classList.contains('asys-quadrant--compact')).toBe(true);
    expect(chip?.classList.contains('asys-quadrant--do')).toBe(true);
    expect(chip?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Quadrant: Do.');
    expect(q('.asys-task-row__side asys-quadrant-label')).toBeNull();
    expect(q('.asys-task-row__side .asys-quadrant')).toBeNull();
    expect(q('asys-quadrant-label')).toBe(chip);
  });

  it('follows the quadrant input', async () => {
    const { fixture, host, q } = await setup();

    host.quadrant.set(Quadrant.Plan);
    await fixture.whenStable();

    const chip = q('.asys-task-row__reason asys-quadrant-label');

    expect(chip?.classList.contains('asys-quadrant--plan')).toBe(true);
    expect(chip?.classList.contains('asys-quadrant--do')).toBe(false);
    expect(chip?.classList.contains('asys-quadrant--compact')).toBe(true);
    expect(chip?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Quadrant: Plan.');
  });

  it('shows the quadrant chip only when a quadrant is set', async () => {
    const { fixture, host, q } = await setup();

    expect(q('asys-quadrant-label')).not.toBeNull();

    host.quadrant.set(undefined);
    await fixture.whenStable();

    expect(q('asys-quadrant-label')).toBeNull();
    expect(q('.asys-quadrant')).toBeNull();

    host.quadrant.set(Quadrant.Delegate);
    await fixture.whenStable();

    expect(
      q('.asys-task-row__reason asys-quadrant-label')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toBe('Quadrant: Delegate.');
  });

  it.each([
    { quadrant: Quadrant.Do, overdue: true, kinds: ['chip', 'badge', 'text'] },
    { quadrant: Quadrant.Do, overdue: false, kinds: ['chip', 'text'] },
    { quadrant: undefined, overdue: true, kinds: ['badge', 'text'] },
    { quadrant: undefined, overdue: false, kinds: ['text'] },
  ])(
    'orders the reason as $kinds for quadrant $quadrant and overdue $overdue',
    async ({ quadrant, overdue, kinds }) => {
      const { fixture, host, reasonKinds } = await setup();

      host.quadrant.set(quadrant);
      host.overdue.set(overdue);
      await fixture.whenStable();

      expect(reasonKinds()).toEqual(kinds);
    },
  );

  it('puts the title and then the reason in the main part', async () => {
    const { q } = await setup();

    expect(Array.from(q('.asys-task-row__main')?.children ?? [], (c) => c.className)).toEqual([
      'asys-task-row__title',
      'asys-task-row__reason',
    ]);
  });

  it('holds only the Estimate in the side, whatever the quadrant and the badge', async () => {
    const { fixture, host, q } = await setup();
    const sideClasses = (): string[] =>
      Array.from(q('.asys-task-row__side')?.children ?? [], (c) => c.className);

    expect(sideClasses()).toEqual(['asys-num asys-task-row__estimate']);

    host.overdue.set(true);
    await fixture.whenStable();

    expect(sideClasses()).toEqual(['asys-num asys-task-row__estimate']);

    host.quadrant.set(undefined);
    await fixture.whenStable();

    expect(sideClasses()).toEqual(['asys-num asys-task-row__estimate']);
    expect(q('.asys-task-row__side')?.textContent?.trim()).toBe('25 min');
  });

  it('shows no quadrant chip for a Waiting row without a quadrant', async () => {
    const { fixture, host, q, reasonKinds } = await setup();

    host.variant.set(TaskRowVariant.Waiting);
    host.quadrant.set(undefined);
    await fixture.whenStable();

    expect(q('asys-quadrant-label')).toBeNull();
    expect(reasonKinds()).toEqual(['text']);

    host.overdue.set(true);
    await fixture.whenStable();

    expect(q('asys-quadrant-label')).toBeNull();
    expect(reasonKinds()).toEqual(['badge', 'text']);
  });

  it('has only the base class for the ranked variant', async () => {
    const { row } = await setup();

    expect(row().classList.contains('asys-task-row')).toBe(true);
    expect(row().classList.contains('asys-task-row--waiting')).toBe(false);
    expect(row().classList.contains('asys-task-row--urgent-elsewhere')).toBe(false);
  });

  it('adds the waiting class for the waiting variant', async () => {
    const { fixture, host, row } = await setup();

    host.variant.set(TaskRowVariant.Waiting);
    await fixture.whenStable();

    expect(row().classList.contains('asys-task-row')).toBe(true);
    expect(row().classList.contains('asys-task-row--waiting')).toBe(true);
    expect(row().classList.contains('asys-task-row--urgent-elsewhere')).toBe(false);
  });

  it('adds the urgent-elsewhere class for the urgent-elsewhere variant', async () => {
    const { fixture, host, row } = await setup();

    host.variant.set(TaskRowVariant.UrgentElsewhere);
    await fixture.whenStable();

    expect(row().classList.contains('asys-task-row')).toBe(true);
    expect(row().classList.contains('asys-task-row--urgent-elsewhere')).toBe(true);
    expect(row().classList.contains('asys-task-row--waiting')).toBe(false);
  });
});

@Component({
  imports: [TaskRow, RouterLink],
  template: `
    <a
      asys-task-row
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
  const title = (): HTMLElement => row().querySelector('.asys-task-row__title') as HTMLElement;
  const withAttribute = (name: string): Element[] =>
    Array.from(fixture.nativeElement.querySelectorAll(`[${name}]`));

  return { fixture, host: fixture.componentInstance, row, title, withAttribute };
};

describe('TaskRow task hooks', () => {
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
    expect(title().hasAttribute('data-focus-title')).toBe(true);
    expect(title().getAttribute('data-focus-title')).toBe('');
    expect(withAttribute('data-focus-title')).toHaveLength(1);
    expect(withAttribute('data-focus-title')[0]).toBe(title());

    expect(row().tagName).toBe('A');
    expect(row().getAttribute('href')).toBe('/tasks/42');
    expect(row().hasAttribute('data-task-id')).toBe(false);
    expect(row().hasAttribute('data-morph')).toBe(false);
    expect(row().hasAttribute('data-focus-title')).toBe(false);
    expect(classesBefore).toContain('asys-task-row');
    expect(Array.from(row().classList)).toEqual(classesBefore);
  });

  it('drops data-morph when morph is false and data-task-id when taskId is null', async () => {
    const { fixture, host, title } = await setupHooks();

    expect(title().hasAttribute('data-task-id')).toBe(false);
    expect(title().hasAttribute('data-morph')).toBe(false);
    expect(title().hasAttribute('data-focus-title')).toBe(false);

    host.taskId.set('42');
    host.morph.set(true);
    await fixture.whenStable();

    host.morph.set(false);
    host.taskId.set(null);
    await fixture.whenStable();

    expect(title().hasAttribute('data-task-id')).toBe(false);
    expect(title().hasAttribute('data-morph')).toBe(false);
    expect(title().hasAttribute('data-focus-title')).toBe(false);
  });

  it('has neither attribute while neither input is bound', async () => {
    const { q } = await setup();

    expect(q('.asys-task-row__title')?.hasAttribute('data-task-id')).toBe(false);
    expect(q('.asys-task-row__title')?.hasAttribute('data-morph')).toBe(false);
    expect(q('[data-task-id]')).toBeNull();
    expect(q('[data-morph]')).toBeNull();
    expect(q('.asys-task-row__title')?.hasAttribute('data-focus-title')).toBe(false);
    expect(q('[data-focus-title]')).toBeNull();
  });
});
