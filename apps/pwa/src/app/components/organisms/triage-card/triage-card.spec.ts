// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Quadrant } from '@asys/domain';

import { type AreaChoice, TriageCard, type TriageDraft, type TriageReason } from './triage-card';

const AREAS: readonly AreaChoice[] = [
  { id: 'a-home', name: 'Home' },
  { id: 'a-work', name: 'Work' },
];

const EMPTY: TriageDraft = {
  title: 'Call Marit',
  notes: '',
  important: null,
  estimateMinutes: null,
  areaId: '',
  availableFrom: null,
  due: null,
};

const PLAN: TriageReason = { quadrant: Quadrant.Plan, text: 'Important, no deadline: plan it.' };

@Component({
  imports: [TriageCard],
  template: `
    <asys-triage-card
      [taskId]="taskId()"
      [position]="position()"
      [total]="total()"
      [capturedText]="capturedText()"
      [areas]="areas()"
      [today]="today"
      [attempts]="attempts()"
      [reason]="reason()"
      [busy]="busy()"
      [(draft)]="draft"
      (more)="mores = mores + 1"
    />
  `,
})
class Host {
  readonly card = viewChild.required(TriageCard);

  readonly taskId = signal('t1');

  readonly position = signal(1);

  readonly total = signal(5);

  readonly capturedText = signal<string | null>(null);

  readonly areas = signal<readonly AreaChoice[]>(AREAS);

  readonly today = '2026-10-04';

  readonly attempts = signal(0);

  readonly reason = signal<TriageReason | null>(null);

  readonly busy = signal(false);

  readonly draft = signal<TriageDraft>(EMPTY);

  mores = 0;
}

const squash = (text: string | null | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim();

const setup = async (draft: TriageDraft = EMPTY) => {
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.draft.set(draft);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const host = fixture.componentInstance;
  const root: HTMLElement = fixture.nativeElement;
  const q = <T extends HTMLElement>(selector: string): T | null => root.querySelector<T>(selector);
  const all = <T extends HTMLElement>(selector: string): T[] =>
    Array.from(root.querySelectorAll<T>(selector));
  const settle = () => fixture.whenStable();
  // A pointer press: `click()` has detail 0, which counts as a keyboard activation.
  const press = async (el: HTMLElement | null | undefined): Promise<void> => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await settle();
  };
  const type = async (el: HTMLTextAreaElement | null, text: string): Promise<void> => {
    if (el === null) {
      throw new Error('Missing field');
    }

    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const section = () => q<HTMLElement>('section.asys-triage');
  const title = () => q<HTMLTextAreaElement>('textarea.asys-triage__title');
  const notes = () => q<HTMLTextAreaElement>('textarea[aria-label="Notes"]');
  const more = () => q<HTMLButtonElement>('button[aria-label="More for this Task"]');
  const addNotes = () =>
    all<HTMLButtonElement>('button').find((b) => squash(b.textContent) === 'Add notes');
  const segment = (label: string) =>
    all<HTMLButtonElement>('asys-segmented-control .asys-segment').find(
      (b) => squash(b.textContent) === label,
    );
  const chip = (aria: string) =>
    q<HTMLButtonElement>(`asys-estimate-picker .asys-segment[aria-label="${aria}"]`);
  const importanceNeed = () => q('asys-segmented-control .asys-label__need');
  const estimateNeed = () => q('asys-estimate-picker .asys-label__need');
  const hint = () => q('p.asys-triage__hint');
  const dialog = (heading: string) =>
    all<HTMLDialogElement>('dialog.asys-sheet').find(
      (d) => squash(d.querySelector('h2.asys-sheet__heading')?.textContent) === heading,
    );
  const rowOpen = (selector: string, label: string) =>
    all<HTMLButtonElement>(selector).find((b) => squash(b.textContent).startsWith(label));

  return {
    fixture,
    host,
    root,
    q,
    all,
    settle,
    press,
    type,
    section,
    title,
    notes,
    more,
    addNotes,
    segment,
    chip,
    importanceNeed,
    estimateNeed,
    hint,
    dialog,
    rowOpen,
  };
};

describe('TriageCard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('the section', () => {
    it('is a focusable section labelled "Task to triage" that carries the focus marker, not the task id', async () => {
      const { section } = await setup();

      expect(section()?.getAttribute('aria-label')).toBe('Task to triage');
      expect(section()?.getAttribute('tabindex')).toBe('-1');
      expect(section()?.getAttribute('data-focus-title')).toBe('t1');
      expect(section()?.hasAttribute('data-task-id')).toBe(false);
    });

    it('puts the task id on the Title only', async () => {
      const { all, title } = await setup();

      expect(title()?.getAttribute('data-task-id')).toBe('t1');
      expect(all('[data-task-id]')).toHaveLength(1);
    });
  });

  describe('progress and More', () => {
    it('shows the position out of the total and follows the inputs', async () => {
      const { host, q, settle } = await setup();

      expect(squash(q('.asys-triage__progress')?.textContent)).toBe('1 of 5');

      host.position.set(3);
      host.total.set(4);
      await settle();

      expect(squash(q('.asys-triage__progress')?.textContent)).toBe('3 of 4');
    });

    it('offers a More button that announces a dialog and emits more', async () => {
      const { host, more, press } = await setup();

      expect(more()?.getAttribute('aria-haspopup')).toBe('dialog');
      expect(more()?.classList.contains('asys-button--quiet')).toBe(true);
      expect(more()?.classList.contains('asys-button--icon')).toBe(true);

      await press(more());

      expect(host.mores).toBe(1);
    });
  });

  describe('the Title', () => {
    it('shows the draft title in a textarea named Title', async () => {
      const { title } = await setup();

      expect(title()?.getAttribute('aria-label')).toBe('Title');
      expect(title()?.getAttribute('placeholder')).toBe('Title');
      expect(title()?.getAttribute('enterkeyhint')).toBe('done');
      expect(title()?.value).toBe('Call Marit');
      expect(title()?.classList.contains('asys-input--title')).toBe(true);
    });

    it('writes an edit into the draft and keeps the rest', async () => {
      const { host, title, type } = await setup({ ...EMPTY, important: true });

      await type(title(), 'Call Marit back');

      expect(host.draft()).toEqual({ ...EMPTY, important: true, title: 'Call Marit back' });
    });

    it('shows no error while the title has text', async () => {
      const { q, title } = await setup();

      expect(q('p[asys-field-error]')).toBeNull();
      expect(title()?.hasAttribute('aria-invalid')).toBe(false);
    });

    it('shows "Needs a title" when the title is blank after trimming, and links it to the field', async () => {
      const { q, title, type } = await setup();

      await type(title(), '   ');

      const error = q('p[asys-field-error]');

      expect(squash(error?.textContent)).toContain('Needs a title');
      expect(title()?.getAttribute('aria-invalid')).toBe('true');
      expect(error?.id).not.toBe('');
      expect(title()?.getAttribute('aria-describedby')).toBe(error?.id);
    });
  });

  describe('Notes', () => {
    it('offers Add notes while the notes are empty, and Add notes shows and focuses the field', async () => {
      const { addNotes, notes, press } = await setup();

      expect(notes()).toBeNull();
      expect(addNotes()).toBeDefined();

      await press(addNotes());

      expect(notes()).not.toBeNull();
      expect(document.activeElement).toBe(notes());
      expect(addNotes()).toBeUndefined();
    });

    it('shows the field at once when the draft has notes', async () => {
      const { addNotes, notes } = await setup({ ...EMPTY, notes: 'Ask about the form' });

      expect(notes()?.value).toBe('Ask about the form');
      expect(notes()?.getAttribute('placeholder')).toBe('Add notes');
      expect(notes()?.getAttribute('rows')).toBe('1');
      expect(notes()?.classList.contains('asys-input--grow')).toBe(true);
      expect(addNotes()).toBeUndefined();
    });

    it('writes typing into the draft', async () => {
      const { host, notes, type, press, addNotes } = await setup();

      await press(addNotes());
      await type(notes(), 'Mind the deadline');

      expect(host.draft().notes).toBe('Mind the deadline');
    });

    it('keeps the field when typing clears the notes', async () => {
      const { notes, press, addNotes, type } = await setup();

      await press(addNotes());
      await type(notes(), 'x');
      await type(notes(), '');

      expect(notes()).not.toBeNull();
    });
  });

  describe('captured text', () => {
    it('is hidden without capturedText', async () => {
      const { q } = await setup();

      expect(q('.asys-triage__captured')).toBeNull();
    });

    it('shows the label and the text when given', async () => {
      const { host, q, settle } = await setup();

      host.capturedText.set('call marit\nabout the form');
      await settle();

      const block = q('.asys-triage__captured');

      expect(squash(block?.querySelector('.asys-triage__captured-label')?.textContent)).toBe(
        'Captured text',
      );
      expect(block?.querySelector('.asys-triage__captured-text')?.textContent).toBe(
        'call marit\nabout the form',
      );
    });
  });

  describe('the choices', () => {
    it('writes Importance into the draft', async () => {
      const { host, segment, press } = await setup();

      await press(segment('Important'));

      expect(host.draft()).toEqual({ ...EMPTY, important: true });

      await press(segment('Not important'));

      expect(host.draft().important).toBe(false);
    });

    it('shows Importance and Estimate legends, and the Estimate as a ruler', async () => {
      const { q } = await setup();

      expect(squash(q('asys-segmented-control legend')?.textContent)).toContain('Importance');
      expect(squash(q('asys-estimate-picker .asys-estimate__legend')?.textContent)).toContain(
        'Estimate',
      );
      expect(q('asys-estimate-picker .asys-estimate--ruler')).not.toBeNull();
      expect(q('asys-segmented-control .asys-segmented-control--fill')).not.toBeNull();
    });

    it('writes an Estimate into the draft', async () => {
      const { host, chip, press } = await setup();

      await press(chip('25 min'));

      expect(host.draft().estimateMinutes).toBe(25);
      expect(chip('25 min')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('writes an Area into the draft, and No Area as an empty id', async () => {
      const { host, dialog, press, rowOpen, all, settle } = await setup();

      await press(rowOpen('button.asys-choice-row__open', 'Area'));

      const options = () => all<HTMLButtonElement>('ul.asys-option-list button.asys-field-row');

      expect(options().map((b) => squash(b.textContent))).toEqual(['No Area', 'Home', 'Work']);

      await press(options()[2]);

      expect(host.draft().areaId).toBe('a-work');
      expect(dialog('Area')).toBeDefined();

      await settle();
      await press(rowOpen('button.asys-choice-row__open', 'Area'));
      await press(options()[0]);

      expect(host.draft().areaId).toBe('');
    });

    it('shows the drafted Area on its row', async () => {
      const { rowOpen } = await setup({ ...EMPTY, areaId: 'a-home' });

      expect(squash(rowOpen('button.asys-choice-row__open', 'Area')?.textContent)).toContain(
        'Home',
      );
    });

    it('writes Available from and Due into the draft, and removes them', async () => {
      const { host, all, press, rowOpen, dialog } = await setup();
      const firstChip = (heading: string) =>
        dialog(heading)?.querySelectorAll<HTMLButtonElement>(
          '.asys-date-picker__chips > .asys-segment',
        )[0];

      await press(rowOpen('button.asys-date-row__open', 'Available from'));
      await press(firstChip('Available from'));

      expect(host.draft().availableFrom).toEqual({ date: '2026-10-04' });
      expect(host.draft().due).toBeNull();

      await press(rowOpen('button.asys-date-row__open', 'Due'));
      await press(firstChip('Due'));

      expect(host.draft().due).toEqual({ date: '2026-10-04' });

      await press(rowOpen('button.asys-date-row__open', 'Due'));
      await press(
        dialog('Due')?.querySelector<HTMLButtonElement>('button.asys-date-picker__remove'),
      );

      expect(host.draft().due).toBeNull();
      expect(host.draft().availableFrom).toEqual({ date: '2026-10-04' });
      expect(all('asys-date-field')).toHaveLength(2);
    });

    it('labels the rows as the Task editor does', async () => {
      const { all } = await setup();

      expect(
        all('.asys-triage__rows > *').map((row) =>
          squash(row.querySelector('.asys-field-row__label, .asys-date-row__label')?.textContent),
        ),
      ).toEqual(['Area', 'Available from', 'Due']);
    });
  });

  describe('Needed markers', () => {
    it('marks Importance and Estimate Needed until chosen', async () => {
      const { importanceNeed, estimateNeed } = await setup();

      expect(squash(importanceNeed()?.textContent)).toBe('Needed');
      expect(squash(estimateNeed()?.textContent)).toBe('Needed');
      expect(importanceNeed()?.classList.contains('asys-label__need--missing')).toBe(false);
      expect(estimateNeed()?.classList.contains('asys-label__need--missing')).toBe(false);
    });

    it('drops the marker of the field that is chosen', async () => {
      const { importanceNeed, estimateNeed } = await setup({ ...EMPTY, important: false });

      expect(importanceNeed()).toBeNull();
      expect(estimateNeed()).not.toBeNull();
    });

    it('turns the markers Missing once Triage was refused, for the unchosen fields only', async () => {
      const { host, importanceNeed, estimateNeed, settle } = await setup({
        ...EMPTY,
        estimateMinutes: 25,
      });

      host.attempts.set(1);
      await settle();

      expect(importanceNeed()?.classList.contains('asys-label__need--missing')).toBe(true);
      expect(estimateNeed()).toBeNull();
    });

    it('shows no markers when both are chosen', async () => {
      const { importanceNeed, estimateNeed } = await setup({
        ...EMPTY,
        important: true,
        estimateMinutes: 25,
      });

      expect(importanceNeed()).toBeNull();
      expect(estimateNeed()).toBeNull();
    });
  });

  describe('the footer', () => {
    it('asks for both while neither is chosen, as a status', async () => {
      const { hint } = await setup();

      expect(hint()?.getAttribute('role')).toBe('status');
      expect(squash(hint()?.textContent)).toBe('Pick an Importance and an Estimate to triage.');
      expect(hint()?.classList.contains('asys-triage__hint--missing')).toBe(false);
    });

    it('asks for the Estimate alone, and for the Importance alone', async () => {
      const first = await setup({ ...EMPTY, important: true });

      expect(squash(first.hint()?.textContent)).toBe('Pick an Estimate to triage.');

      document.body.innerHTML = '';

      const second = await setup({ ...EMPTY, estimateMinutes: 25 });

      expect(squash(second.hint()?.textContent)).toBe('Pick an Importance to triage.');
    });

    it('turns the hint to the missing form after a refused Triage', async () => {
      const { host, hint, settle } = await setup();

      host.attempts.set(2);
      await settle();

      expect(hint()?.classList.contains('asys-triage__hint--missing')).toBe(true);
    });

    it('renders the hint text anew on every attempt, so a screen reader announces it again', async () => {
      const { host, hint, settle } = await setup();

      host.attempts.set(1);
      await settle();

      const before = hint()?.firstChild;
      const element = hint();

      host.attempts.set(2);
      await settle();

      expect(hint()).toBe(element);
      expect(hint()?.textContent?.trim()).toBe('Pick an Importance and an Estimate to triage.');
      expect(hint()?.firstChild).not.toBe(before);
    });

    it('replaces the hint with the strong quadrant label and the reason', async () => {
      const { host, q, hint, settle } = await setup({
        ...EMPTY,
        important: true,
        estimateMinutes: 25,
      });

      host.reason.set(PLAN);
      await settle();

      const line = q('p.asys-triage__reason');
      const label = line?.querySelector('asys-quadrant-label');

      expect(hint()).toBeNull();
      expect(label?.classList.contains('asys-quadrant--strong')).toBe(true);
      expect(label?.classList.contains('asys-quadrant--plan')).toBe(true);
      expect(squash(line?.textContent)).toContain('Important, no deadline: plan it.');
    });

    it('goes back to the hint when the reason goes', async () => {
      const { host, q, hint, settle } = await setup();

      host.reason.set(PLAN);
      await settle();
      host.reason.set(null);
      await settle();

      expect(q('p.asys-triage__reason')).toBeNull();
      expect(hint()).not.toBeNull();
    });
  });

  describe('busy', () => {
    it('disables every control, and enables them again', async () => {
      const { host, root, more, title, settle } = await setup({ ...EMPTY, notes: 'x' });

      host.busy.set(true);
      await settle();

      // The sheets' own Close buttons are not the card's controls.
      const controls = Array.from(
        root.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>(
          'button:not(dialog button), textarea',
        ),
      );

      expect(controls.length).toBeGreaterThan(10);
      expect(controls.filter((control) => !control.disabled)).toEqual([]);
      expect(more()?.disabled).toBe(true);
      expect(title()?.disabled).toBe(true);

      host.busy.set(false);
      await settle();

      expect(controls.filter((control) => control.disabled)).toEqual([]);
    });
  });

  describe('focus', () => {
    it('focusCard focuses the section', async () => {
      const { host, section } = await setup();

      host.card().focusCard();

      expect(document.activeElement).toBe(section());
    });

    it('focusMore focuses the More button', async () => {
      const { host, more } = await setup();

      host.card().focusMore();

      expect(document.activeElement).toBe(more());
    });
  });
});
