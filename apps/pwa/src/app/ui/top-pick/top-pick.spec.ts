// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Quadrant } from '@asys/domain';

import type { Activation } from '../activation/activation';
import { TopPick } from './top-pick';

@Component({
  imports: [TopPick],
  template: `
    <asys-top-pick
      [title]="title()"
      [reason]="reason()"
      [quadrant]="quadrant()"
      [estimate]="estimate()"
      [area]="area()"
      [dueFact]="dueFact()"
      [taskId]="taskId()"
      [morph]="morph()"
      [overdue]="overdue()"
      [canLogProgress]="canLogProgress()"
      [actionsDisabled]="actionsDisabled()"
      [completed]="completed()"
      (done)="done = done + 1; doneEvents.push($event)"
      (logProgress)="logProgress = logProgress + 1"
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

  readonly area = signal<string | null>(null);

  readonly dueFact = signal<string | null>(null);

  readonly taskId = signal<string | null>(null);

  readonly morph = signal(false);

  readonly overdue = signal(false);

  readonly canLogProgress = signal(true);

  readonly actionsDisabled = signal(false);

  readonly completed = signal(false);

  readonly doneEvents: Activation[] = [];

  done = 0;

  logProgress = 0;
}

const collapsed = (el: Element | null | undefined): string | undefined =>
  el?.textContent?.replace(/\s+/g, ' ').trim();

/** What a sighted person reads: the text without the icons and the visually hidden parts. */
const visibleText = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;

  for (const part of Array.from(copy.querySelectorAll('svg, .asys-visually-hidden'))) {
    part.remove();
  }

  return collapsed(copy) ?? '';
};

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async () => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });

  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const q = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
  const all = (selector: string): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(selector));
  const buttons = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.asys-top-pick__actions button'));
  const button = (label: string): HTMLButtonElement | undefined =>
    buttons().find((b) => b.textContent?.trim() === label);
  const link = (): HTMLAnchorElement =>
    must(q('a.asys-top-pick__link') as HTMLAnchorElement | null, 'the title link');
  const titleText = (): HTMLElement => must(q('.asys-top-pick__title-text'), 'the title text');
  const reason = (): HTMLElement => must(q('p.asys-top-pick__reason'), 'the reason');
  const facts = (): HTMLElement[] => all('.asys-top-pick ul.asys-facts > li');
  const glyph = (el: Element): string | null =>
    el.querySelector('svg[data-icon]')?.getAttribute('data-icon') ?? null;
  // The kind of each fact, in order: the icon's name, or `quadrant` for the chip.
  const factKinds = (): (string | null)[] =>
    facts().map((li) => (li.matches('.asys-quadrant') ? 'quadrant' : glyph(li)));

  return {
    fixture,
    host: fixture.componentInstance,
    q,
    all,
    buttons,
    button,
    link,
    titleText,
    reason,
    facts,
    glyph,
    factKinds,
  };
};

describe('TopPick', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the title, the reason, the Estimate and the quadrant', async () => {
    const { q, titleText, reason, facts } = await setup();

    expect(titleText().textContent?.trim()).toBe('Call Marit');
    expect(reason().textContent?.trim()).toBe('Due today');
    expect(visibleText(must(facts()[0]))).toBe('25 min');
    expect(collapsed(q('.asys-top-pick li.asys-quadrant'))).toBe('Quadrant: Plan');
  });

  describe('the title', () => {
    it('is a link inside the heading, around the title text', async () => {
      const { q, link, titleText } = await setup();

      expect(q('article.asys-top-pick > h2.asys-top-pick__title')).not.toBeNull();
      expect(link().parentElement).toBe(q('h2.asys-top-pick__title'));
      expect(titleText().parentElement).toBe(link());
    });

    it('has the title as the text of the link, the icon adding none', async () => {
      const { link, host, fixture } = await setup();

      expect(link().textContent?.trim()).toBe('Call Marit');

      host.title.set('Pay the invoice');
      await fixture.whenStable();

      expect(link().textContent?.trim()).toBe('Pay the invoice');
    });

    it('ends the link with a chevron icon after the title text', async () => {
      const { link, titleText, glyph } = await setup();
      const icon = must(link().querySelector('asys-icon'));

      expect(link().lastElementChild).toBe(icon);
      expect(titleText().nextElementSibling).toBe(icon);
      expect(glyph(icon)).toBe('chevron-right');
    });

    it('gives the heading no tabindex and no task hooks of its own', async () => {
      const { fixture, host, q } = await setup();

      host.taskId.set('abc');
      host.morph.set(true);
      await fixture.whenStable();

      const heading = must(q('h2.asys-top-pick__title'));

      expect(heading.hasAttribute('tabindex')).toBe(false);
      expect(heading.hasAttribute('data-task-id')).toBe(false);
      expect(heading.hasAttribute('data-morph')).toBe(false);
    });

    it('links to the Task by its id', async () => {
      const { fixture, host, link } = await setup();

      host.taskId.set('abc');
      await fixture.whenStable();

      expect(link().getAttribute('href')).toBe('/tasks/abc');

      host.taskId.set('def');
      await fixture.whenStable();

      expect(link().getAttribute('href')).toBe('/tasks/def');
    });

    it('has no href while there is no taskId, also after it was cleared', async () => {
      const { fixture, host, link } = await setup();

      expect(link().hasAttribute('href')).toBe(false);

      host.taskId.set('abc');
      await fixture.whenStable();

      expect(link().getAttribute('href')).toBe('/tasks/abc');

      host.taskId.set(null);
      await fixture.whenStable();

      expect(link().hasAttribute('href')).toBe(false);
    });

    it('is the only link in the card', async () => {
      const { all, link } = await setup();
      const links = all('.asys-top-pick a');

      expect(links).toHaveLength(1);
      expect(links[0]).toBe(link());
    });
  });

  describe('the flags', () => {
    it('are absent while the Task is not overdue', async () => {
      const { q } = await setup();

      expect(q('.asys-top-pick__flags')).toBeNull();
      expect(q('asys-status-badge')).toBeNull();
    });

    it('hold the Overdue badge, above the title, only while overdue', async () => {
      const { fixture, host, q } = await setup();

      host.overdue.set(true);
      await fixture.whenStable();

      const flags = must(q('.asys-top-pick__flags'));

      expect(flags.querySelector('asys-status-badge')?.textContent?.trim()).toBe('Overdue');
      expect(q('article.asys-top-pick')?.firstElementChild).toBe(flags);
      expect(flags.nextElementSibling).toBe(q('h2.asys-top-pick__title'));

      host.overdue.set(false);
      await fixture.whenStable();

      expect(q('.asys-top-pick__flags')).toBeNull();
      expect(q('asys-status-badge')).toBeNull();
    });

    it('leave no meta row and no estimate span behind', async () => {
      const { fixture, host, q } = await setup();

      host.overdue.set(true);
      await fixture.whenStable();

      expect(q('.asys-top-pick__meta')).toBeNull();
      expect(q('.asys-top-pick__estimate')).toBeNull();
    });
  });

  describe('the reason', () => {
    const DUE = 'Due yesterday 17:00';

    const REASON = `${DUE} · important`;

    it('is plain text while the Task is not overdue, even with a Due fact', async () => {
      const { fixture, host, q, reason } = await setup();

      host.reason.set(REASON);
      host.dueFact.set(DUE);
      await fixture.whenStable();

      expect(q('.asys-danger-text')).toBeNull();
      expect(collapsed(reason())).toBe(REASON);
    });

    it('is plain text while overdue without a Due fact', async () => {
      const { fixture, host, q, reason } = await setup();

      host.reason.set(REASON);
      host.overdue.set(true);
      await fixture.whenStable();

      expect(q('.asys-danger-text')).toBeNull();
      expect(collapsed(reason())).toBe(REASON);
    });

    it('draws the Due fact in danger when overdue, the rest following as text', async () => {
      const { fixture, host, all, reason } = await setup();

      host.reason.set(REASON);
      host.dueFact.set(DUE);
      host.overdue.set(true);
      await fixture.whenStable();

      const danger = all('.asys-danger-text');

      expect(danger).toHaveLength(1);
      expect(danger[0]?.tagName).toBe('SPAN');
      expect(danger[0]?.parentElement).toBe(reason());
      expect(danger[0]?.textContent).toBe(DUE);
      expect(collapsed(reason())).toBe(REASON);
      expect(reason().firstElementChild).toBe(danger[0]);
    });

    it('draws the whole reason in danger when it is the Due fact alone', async () => {
      const { fixture, host, all, reason } = await setup();

      host.reason.set(DUE);
      host.dueFact.set(DUE);
      host.overdue.set(true);
      await fixture.whenStable();

      expect(all('.asys-danger-text')).toHaveLength(1);
      expect(all('.asys-danger-text')[0]?.textContent).toBe(DUE);
      expect(collapsed(reason())).toBe(DUE);
    });

    it('is plain text when the reason does not start with the Due fact', async () => {
      const { fixture, host, q, reason } = await setup();

      host.reason.set('Latest start 14:30 · important');
      host.dueFact.set(DUE);
      host.overdue.set(true);
      await fixture.whenStable();

      expect(q('.asys-danger-text')).toBeNull();
      expect(collapsed(reason())).toBe('Latest start 14:30 · important');
    });

    it('follows overdue and the Due fact as they change, the text staying the reason', async () => {
      const { fixture, host, q, reason } = await setup();

      host.reason.set(REASON);
      host.dueFact.set(DUE);
      host.overdue.set(true);
      await fixture.whenStable();

      expect(q('.asys-danger-text')?.textContent).toBe(DUE);

      host.overdue.set(false);
      await fixture.whenStable();

      expect(q('.asys-danger-text')).toBeNull();
      expect(collapsed(reason())).toBe(REASON);

      host.overdue.set(true);
      host.dueFact.set(null);
      await fixture.whenStable();

      expect(q('.asys-danger-text')).toBeNull();
      expect(collapsed(reason())).toBe(REASON);
    });
  });

  describe('the facts', () => {
    it('are one list after the reason and before the actions', async () => {
      const { q, reason } = await setup();
      const list = must(q('.asys-top-pick ul.asys-facts'));

      expect(reason().nextElementSibling).toBe(list);
      expect(list.nextElementSibling).toBe(q('.asys-top-pick__actions'));
    });

    it('list the Estimate, then the quadrant, while there is no Area', async () => {
      const { factKinds } = await setup();

      expect(factKinds()).toEqual(['stopwatch', 'quadrant']);
    });

    it('draw the Estimate strong, its value in asys-num, labelled Estimate:', async () => {
      const { facts } = await setup();
      const estimate = must(facts()[0]);

      expect(estimate.classList.contains('asys-fact--strong')).toBe(true);
      expect(collapsed(estimate.querySelector('.asys-visually-hidden'))).toBe('Estimate:');
      expect(estimate.querySelector('.asys-num')?.textContent?.trim()).toBe('25 min');
      expect(visibleText(estimate)).toBe('25 min');
    });

    it('follow a change of the Estimate', async () => {
      const { fixture, host, facts } = await setup();

      host.estimate.set('1 h 05');
      await fixture.whenStable();

      expect(facts()[0]?.querySelector('.asys-num')?.textContent?.trim()).toBe('1 h 05');
    });

    it('add the Area between the Estimate and the quadrant when it is given', async () => {
      const { fixture, host, facts, factKinds } = await setup();

      host.area.set('Home');
      await fixture.whenStable();

      const area = must(facts()[1]);

      expect(factKinds()).toEqual(['stopwatch', 'folder', 'quadrant']);
      expect(area.classList.contains('asys-fact--strong')).toBe(false);
      expect(collapsed(area.querySelector('.asys-visually-hidden'))).toBe('Area:');
      expect(visibleText(area)).toBe('Home');
    });

    it('drop the Area again when it goes back to null', async () => {
      const { fixture, host, factKinds } = await setup();

      host.area.set('Home');
      await fixture.whenStable();
      host.area.set(null);
      await fixture.whenStable();

      expect(factKinds()).toEqual(['stopwatch', 'quadrant']);
    });

    it('end with the quadrant chip, which follows the quadrant', async () => {
      const { fixture, host, facts } = await setup();
      const chip = (): HTMLElement => must(facts().at(-1));

      expect(chip().hasAttribute('asys-quadrant-chip')).toBe(true);
      expect(chip().classList.contains('asys-quadrant--plan')).toBe(true);
      expect(collapsed(chip())).toBe('Quadrant: Plan');

      host.quadrant.set(Quadrant.Do);
      await fixture.whenStable();

      expect(chip().classList.contains('asys-quadrant--do')).toBe(true);
      expect(collapsed(chip())).toBe('Quadrant: Do');
    });
  });

  describe('the actions', () => {
    it('are Done and Log progress in that order, with no Open', async () => {
      const { buttons, button } = await setup();

      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Done', 'Log progress']);
      expect(button('Open')).toBeUndefined();
    });

    it('make both buttons large, Done primary and Log progress secondary', async () => {
      const { button } = await setup();
      const done = must(button('Done'));
      const logProgress = must(button('Log progress'));

      expect(done.classList.contains('asys-button--large')).toBe(true);
      expect(done.classList.contains('asys-button--primary')).toBe(true);
      expect(done.classList.contains('asys-button--secondary')).toBe(false);
      expect(logProgress.classList.contains('asys-button--large')).toBe(true);
      expect(logProgress.classList.contains('asys-button--secondary')).toBe(true);
      expect(logProgress.classList.contains('asys-button--primary')).toBe(false);
    });

    it('share the row as a fill group', async () => {
      const { q, buttons } = await setup();
      const group = must(q('.asys-top-pick__actions > div.asys-button-group'));

      expect(group.classList.contains('asys-button-group--fill')).toBe(true);
      expect(buttons().every((b) => b.parentElement === group)).toBe(true);
    });

    it('draw a check on Done and a half bar on Log progress, before the label', async () => {
      const { button, glyph } = await setup();

      expect(glyph(must(button('Done')))).toBe('check');
      expect(glyph(must(button('Log progress')))).toBe('bar-progress-half');
      expect(button('Done')?.firstElementChild?.tagName.toLowerCase()).toBe('asys-icon');
      expect(button('Log progress')?.firstElementChild?.tagName.toLowerCase()).toBe('asys-icon');
    });

    it('give Done the main action class and Log progress the secondary classes', async () => {
      const { button } = await setup();

      expect(button('Done')?.classList.contains('asys-top-pick__main-action')).toBe(true);
      expect(button('Done')?.classList.contains('asys-top-pick__secondary')).toBe(false);
      expect(button('Log progress')?.classList.contains('asys-top-pick__secondary')).toBe(true);
      expect(button('Log progress')?.classList.contains('asys-top-pick__log-progress')).toBe(true);
    });

    it('have no open output', async () => {
      const { host } = await setup();

      expect(Reflect.has(host.pick(), 'open')).toBe(false);
      expect(Reflect.has(host.pick(), 'done')).toBe(true);
      expect(Reflect.has(host.pick(), 'logProgress')).toBe(true);
    });

    it('emit done and logProgress from their buttons', async () => {
      const { fixture, host, button } = await setup();

      button('Done')?.click();
      await fixture.whenStable();

      expect([host.done, host.logProgress]).toEqual([1, 0]);

      button('Log progress')?.click();
      await fixture.whenStable();

      expect([host.done, host.logProgress]).toEqual([1, 1]);
    });

    it('emit done with keyboard true for a click without a pointer (detail 0)', async () => {
      const { fixture, host, button } = await setup();

      button('Done')?.click();
      await fixture.whenStable();

      expect(host.doneEvents).toEqual([{ keyboard: true }]);
    });

    it('emit done with keyboard false for a pointer click (detail 1)', async () => {
      const { fixture, host, button } = await setup();

      button('Done')?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      await fixture.whenStable();

      expect(host.doneEvents).toEqual([{ keyboard: false }]);
    });

    it('hide Log progress when canLogProgress is false', async () => {
      const { fixture, host, buttons } = await setup();

      host.canLogProgress.set(false);
      await fixture.whenStable();

      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Done']);
      expect(Array.from(must(buttons()[0]).classList)).toContain('asys-button--large');
    });

    it('disable Done and Log progress while actionsDisabled, leaving the title link', async () => {
      const { fixture, host, button, link } = await setup();

      host.taskId.set('abc');
      host.actionsDisabled.set(true);
      await fixture.whenStable();

      expect(button('Done')?.disabled).toBe(true);
      expect(button('Log progress')?.disabled).toBe(true);
      expect(link().getAttribute('href')).toBe('/tasks/abc');
    });

    it('emit nothing from the disabled buttons', async () => {
      const { fixture, host, button } = await setup();

      host.actionsDisabled.set(true);
      await fixture.whenStable();

      button('Done')?.click();
      button('Log progress')?.click();
      await fixture.whenStable();

      expect([host.done, host.logProgress]).toEqual([0, 0]);
    });

    it('enable again when actionsDisabled clears', async () => {
      const { fixture, host, button } = await setup();

      host.actionsDisabled.set(true);
      await fixture.whenStable();
      host.actionsDisabled.set(false);
      await fixture.whenStable();

      expect(button('Done')?.disabled).toBe(false);
      expect(button('Log progress')?.disabled).toBe(false);
    });
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
      expect(buttons()).toHaveLength(2);
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

    it('keeps the title, reason, facts and projected content, with the content still last', async () => {
      const { fixture, host, q, titleText, reason, facts } = await setup();

      host.completed.set(true);
      await fixture.whenStable();

      const card = q('article.asys-top-pick');

      expect(titleText().textContent?.trim()).toBe('Call Marit');
      expect(reason().textContent?.trim()).toBe('Due today');
      expect(facts()).toHaveLength(2);
      expect(card?.lastElementChild).toBe(q('#projected'));
    });

    it('brings the buttons back when completed returns to false', async () => {
      const { fixture, host, q, buttons } = await setup();

      host.completed.set(true);
      await fixture.whenStable();
      host.completed.set(false);
      await fixture.whenStable();

      expect(q('.asys-top-pick__done')).toBeNull();
      expect(buttons().map((b) => b.textContent?.trim())).toEqual(['Done', 'Log progress']);
    });
  });

  describe('focus', () => {
    it('focusTitle moves focus to the title link', async () => {
      const { fixture, host, link } = await setup();

      host.taskId.set('abc');
      await fixture.whenStable();
      host.pick().focusTitle();
      await fixture.whenStable();

      expect(document.activeElement).toBe(link());
    });

    it('focusLogProgress moves focus to the Log progress button', async () => {
      const { fixture, host, button } = await setup();

      host.pick().focusLogProgress();
      await fixture.whenStable();

      expect(document.activeElement).toBe(button('Log progress'));
    });

    it('focusLogProgress does nothing when Log progress is hidden', async () => {
      const { fixture, host, link } = await setup();

      host.taskId.set('abc');
      host.canLogProgress.set(false);
      await fixture.whenStable();
      link().focus();

      expect(() => host.pick().focusLogProgress()).not.toThrow();
      expect(document.activeElement).toBe(link());
    });
  });
});

describe('TopPick task hooks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('puts data-task-id on the title text for a taskId', async () => {
    const { fixture, host, all, titleText } = await setup();

    host.taskId.set('abc');
    await fixture.whenStable();

    expect(titleText().getAttribute('data-task-id')).toBe('abc');
    expect(all('[data-task-id]')).toHaveLength(1);
    expect(all('[data-task-id]')[0]).toBe(titleText());
  });

  it('has no data-task-id on the title text when taskId is null, also after it was cleared', async () => {
    const { fixture, host, titleText } = await setup();

    expect(titleText().hasAttribute('data-task-id')).toBe(false);

    host.taskId.set('abc');
    await fixture.whenStable();

    expect(titleText().getAttribute('data-task-id')).toBe('abc');

    host.taskId.set(null);
    await fixture.whenStable();

    expect(titleText().hasAttribute('data-task-id')).toBe(false);
  });

  it('has data-morph on the title text while morph is true and drops it when morph is false', async () => {
    const { fixture, host, all, titleText } = await setup();

    expect(titleText().hasAttribute('data-morph')).toBe(false);

    host.morph.set(true);
    await fixture.whenStable();

    expect(titleText().hasAttribute('data-morph')).toBe(true);
    expect(titleText().getAttribute('data-morph')).toBe('');
    expect(all('[data-morph]')).toHaveLength(1);
    expect(all('[data-morph]')[0]).toBe(titleText());

    host.morph.set(false);
    await fixture.whenStable();

    expect(titleText().hasAttribute('data-morph')).toBe(false);
    expect(all('[data-morph]')).toEqual([]);
  });

  it('keeps both hooks off the link, which only wraps the title text', async () => {
    const { fixture, host, link } = await setup();

    host.taskId.set('abc');
    host.morph.set(true);
    await fixture.whenStable();

    expect(link().hasAttribute('data-task-id')).toBe(false);
    expect(link().hasAttribute('data-morph')).toBe(false);
  });

  it('has neither attribute while neither input is bound', async () => {
    const { q } = await setup();

    expect(q('.asys-top-pick__title-text')?.hasAttribute('data-task-id')).toBe(false);
    expect(q('.asys-top-pick__title-text')?.hasAttribute('data-morph')).toBe(false);
    expect(q('[data-task-id]')).toBeNull();
    expect(q('[data-morph]')).toBeNull();
  });
});
