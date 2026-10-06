// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Quadrant } from '@asys/domain';

import { TopPick } from './top-pick';

@Component({
  imports: [TopPick],
  template: `
    <asys-top-pick
      [title]="title()"
      [reason]="reason()"
      [quadrant]="quadrant()"
      [estimate]="estimate()"
      [overdue]="overdue()"
      [canLogProgress]="canLogProgress()"
      [actionsDisabled]="actionsDisabled()"
      [completed]="completed()"
      (done)="done = done + 1; doneEvents.push($event)"
      (logProgress)="logProgress = logProgress + 1"
      (open)="open = open + 1"
    >
      <form id="projected">Progress form</form>
    </asys-top-pick>
  `,
})
class Host {
  readonly pick = viewChild.required(TopPick);

  readonly title = signal('Call Marit');

  readonly reason = signal('Due today');

  readonly quadrant = signal(Quadrant.Plan);

  readonly estimate = signal('25 min');

  readonly overdue = signal(false);

  readonly canLogProgress = signal(true);

  readonly actionsDisabled = signal(false);

  readonly completed = signal(false);

  readonly doneEvents: { readonly keyboard: boolean }[] = [];

  done = 0;

  logProgress = 0;

  open = 0;
}

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const q = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.asys-top-pick__actions button'));
  const button = (label: string): HTMLButtonElement | undefined =>
    buttons().find((b) => b.textContent?.trim() === label);

  return { fixture, host: fixture.componentInstance, q, buttons, button };
};

describe('TopPick', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders title, reason, quadrant chip and estimate', async () => {
    const { q } = await setup();

    expect(q('.asys-top-pick__title')?.textContent?.trim()).toBe('Call Marit');
    expect(q('.asys-top-pick__reason')?.textContent?.trim()).toBe('Due today');
    expect(q('.asys-top-pick__meta asys-quadrant-chip')?.textContent?.trim()).toBe('Plan');
    expect(q('.asys-top-pick__estimate')?.textContent?.trim()).toBe('25 min');
  });

  it('shows the Overdue badge only when overdue', async () => {
    const { fixture, host, q } = await setup();

    expect(q('.asys-top-pick__meta asys-status-badge')).toBeNull();

    host.overdue.set(true);
    await fixture.whenStable();

    expect(q('.asys-top-pick__meta asys-status-badge')?.textContent?.trim()).toBe('Overdue');
  });

  it('offers Done, Log progress and Open in that order', async () => {
    const { buttons } = await setup();

    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Done', 'Log progress', 'Open']);
  });

  it('emits done, logProgress and open from their buttons', async () => {
    const { fixture, host, button } = await setup();

    button('Done')?.click();
    await fixture.whenStable();

    expect([host.done, host.logProgress, host.open]).toEqual([1, 0, 0]);

    button('Log progress')?.click();
    await fixture.whenStable();

    expect([host.done, host.logProgress, host.open]).toEqual([1, 1, 0]);

    button('Open')?.click();
    await fixture.whenStable();

    expect([host.done, host.logProgress, host.open]).toEqual([1, 1, 1]);
  });

  it('emits done with keyboard true for a click without a pointer (detail 0)', async () => {
    const { fixture, host, button } = await setup();

    button('Done')?.click();
    await fixture.whenStable();

    expect(host.doneEvents).toEqual([{ keyboard: true }]);
  });

  it('emits done with keyboard false for a pointer click (detail 1)', async () => {
    const { fixture, host, button } = await setup();

    button('Done')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await fixture.whenStable();

    expect(host.doneEvents).toEqual([{ keyboard: false }]);
  });

  it('hides Log progress when canLogProgress is false', async () => {
    const { fixture, host, buttons } = await setup();

    host.canLogProgress.set(false);
    await fixture.whenStable();

    expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Done', 'Open']);
  });

  it('disables Done and Log progress, but never Open, while actionsDisabled', async () => {
    const { fixture, host, button } = await setup();

    host.actionsDisabled.set(true);
    await fixture.whenStable();

    expect(button('Done')?.disabled).toBe(true);
    expect(button('Log progress')?.disabled).toBe(true);
    expect(button('Open')?.disabled).toBe(false);
  });

  it('emits nothing from the disabled buttons and still emits open', async () => {
    const { fixture, host, button } = await setup();

    host.actionsDisabled.set(true);
    await fixture.whenStable();

    button('Done')?.click();
    button('Log progress')?.click();
    button('Open')?.click();
    await fixture.whenStable();

    expect([host.done, host.logProgress, host.open]).toEqual([0, 0, 1]);
  });

  it('enables the actions again when actionsDisabled clears', async () => {
    const { fixture, host, button } = await setup();

    host.actionsDisabled.set(true);
    await fixture.whenStable();
    host.actionsDisabled.set(false);
    await fixture.whenStable();

    expect(button('Done')?.disabled).toBe(false);
    expect(button('Log progress')?.disabled).toBe(false);
  });

  it('projects content at the end of the card', async () => {
    const { q } = await setup();

    const card = q('article.asys-top-pick');
    const projected = q('#projected');

    expect(projected).not.toBeNull();
    expect(card?.contains(projected)).toBe(true);
    expect(card?.lastElementChild).toBe(projected);
  });

  describe('completed', () => {
    const topPickCss = (): string =>
      Array.from(document.querySelectorAll('style'))
        .map((el) => el.textContent ?? '')
        .join('\n');

    it('shows no Done line and keeps the buttons while completed is false', async () => {
      const { q, buttons } = await setup();

      expect(q('.asys-top-pick__done')).toBeNull();
      expect(buttons()).toHaveLength(3);
    });

    it('shows a check and the text Done in place of the buttons when completed is true', async () => {
      const { fixture, host, q, buttons } = await setup();

      host.completed.set(true);
      await fixture.whenStable();

      const line = q('.asys-top-pick__actions > p.asys-top-pick__done');

      expect(line).not.toBeNull();
      expect(line?.textContent?.trim()).toBe('Done');
      expect(buttons()).toEqual([]);
      expect(q('.asys-top-pick__actions .asys-button-group')).toBeNull();
    });

    it('draws the check as a hidden inline SVG whose path has pathLength 1', async () => {
      const { fixture, host, q } = await setup();

      host.completed.set(true);
      await fixture.whenStable();

      const check = q('.asys-top-pick__done svg.asys-top-pick__check');

      expect(check).not.toBeNull();
      expect(check?.getAttribute('aria-hidden')).toBe('true');
      expect(check?.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(check?.querySelector('path')?.getAttribute('pathLength')).toBe('1');
    });

    it('styles the check to draw with asys-check-draw and the Done line in ink-muted', async () => {
      const { fixture, host } = await setup();

      host.completed.set(true);
      await fixture.whenStable();

      const css = topPickCss();

      expect(css).toMatch(/@keyframes\s+asys-check-draw/);
      expect(css).toMatch(/stroke-dasharray:\s*1\b/);
      expect(css).toMatch(
        /animation:\s*asys-check-draw\s+var\(--duration-quick\)\s+var\(--ease-out\)/,
      );
      expect(css).toMatch(/\.asys-top-pick__done\s*\{[^}]*var\(--ink-muted\)/);
    });

    it('keeps the title, reason and projected content, with the content still last', async () => {
      const { fixture, host, q } = await setup();

      host.completed.set(true);
      await fixture.whenStable();

      const card = q('article.asys-top-pick');

      expect(q('.asys-top-pick__title')?.textContent?.trim()).toBe('Call Marit');
      expect(q('.asys-top-pick__reason')?.textContent?.trim()).toBe('Due today');
      expect(card?.lastElementChild).toBe(q('#projected'));
    });

    it('brings the buttons back when completed returns to false', async () => {
      const { fixture, host, q, buttons } = await setup();

      host.completed.set(true);
      await fixture.whenStable();
      host.completed.set(false);
      await fixture.whenStable();

      expect(q('.asys-top-pick__done')).toBeNull();
      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Done', 'Log progress', 'Open']);
    });
  });

  it('focusTitle moves focus to the title', async () => {
    const { fixture, host, q } = await setup();

    host.pick().focusTitle();
    await fixture.whenStable();

    expect(document.activeElement).toBe(q('.asys-top-pick__title'));
  });

  it('focusLogProgress moves focus to the Log progress button', async () => {
    const { fixture, host, button } = await setup();

    host.pick().focusLogProgress();
    await fixture.whenStable();

    expect(document.activeElement).toBe(button('Log progress'));
  });

  it('focusLogProgress does nothing when Log progress is hidden', async () => {
    const { fixture, host, q } = await setup();

    host.canLogProgress.set(false);
    await fixture.whenStable();
    q('.asys-top-pick__title')?.focus();

    expect(() => host.pick().focusLogProgress()).not.toThrow();
    expect(document.activeElement).toBe(q('.asys-top-pick__title'));
  });
});

@Component({
  imports: [TopPick],
  template: `
    <asys-top-pick
      [title]="'Call Marit'"
      [reason]="'Due today'"
      [quadrant]="quadrant"
      [estimate]="'25 min'"
      [taskId]="taskId()"
      [morph]="morph()"
    />
  `,
})
class HookHost {
  readonly quadrant = Quadrant.Plan;

  readonly taskId = signal<string | null>(null);

  readonly morph = signal(false);
}

const setupHooks = async () => {
  const fixture = TestBed.createComponent(HookHost);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const title = (): HTMLElement => {
    const el = fixture.nativeElement.querySelector('.asys-top-pick__title');

    if (el === null) {
      throw new Error('Missing the top pick title');
    }

    return el;
  };
  const withAttribute = (name: string): Element[] =>
    Array.from(fixture.nativeElement.querySelectorAll(`[${name}]`));

  return { fixture, host: fixture.componentInstance, title, withAttribute };
};

describe('TopPick task hooks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('puts data-task-id on the title for a taskId', async () => {
    const { fixture, host, title, withAttribute } = await setupHooks();

    host.taskId.set('abc');
    await fixture.whenStable();

    expect(title().getAttribute('data-task-id')).toBe('abc');
    expect(withAttribute('data-task-id')).toHaveLength(1);
    expect(withAttribute('data-task-id')[0]).toBe(title());
  });

  it('has no data-task-id on the title when taskId is null, also after it was cleared', async () => {
    const { fixture, host, title } = await setupHooks();

    expect(title().hasAttribute('data-task-id')).toBe(false);

    host.taskId.set('abc');
    await fixture.whenStable();

    expect(title().getAttribute('data-task-id')).toBe('abc');

    host.taskId.set(null);
    await fixture.whenStable();

    expect(title().hasAttribute('data-task-id')).toBe(false);
  });

  it('has data-morph on the title while morph is true and drops it when morph is false', async () => {
    const { fixture, host, title, withAttribute } = await setupHooks();

    expect(title().hasAttribute('data-morph')).toBe(false);

    host.morph.set(true);
    await fixture.whenStable();

    expect(title().hasAttribute('data-morph')).toBe(true);
    expect(title().getAttribute('data-morph')).toBe('');
    expect(withAttribute('data-morph')).toHaveLength(1);
    expect(withAttribute('data-morph')[0]).toBe(title());

    host.morph.set(false);
    await fixture.whenStable();

    expect(title().hasAttribute('data-morph')).toBe(false);
    expect(withAttribute('data-morph')).toEqual([]);
  });

  it('has neither attribute while neither input is bound', async () => {
    const { q } = await setup();

    expect(q('.asys-top-pick__title')?.hasAttribute('data-task-id')).toBe(false);
    expect(q('.asys-top-pick__title')?.hasAttribute('data-morph')).toBe(false);
    expect(q('[data-task-id]')).toBeNull();
    expect(q('[data-morph]')).toBeNull();
  });
});
