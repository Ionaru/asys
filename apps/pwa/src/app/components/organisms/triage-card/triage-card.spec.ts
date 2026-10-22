// SPDX-License-Identifier: EUPL-1.2
import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AreaChoice, TriageCard, TriageDraft } from './triage-card';

const AREAS: readonly AreaChoice[] = [
  { id: 'a-home', name: 'Home' },
  { id: 'a-work', name: 'Work' },
];

const COMPLETE: TriageDraft = { important: true, estimateMinutes: 25, areaId: 'a-work' };

@Component({
  imports: [TriageCard],
  template: `
    <asys-triage-card
      [position]="position()"
      [total]="total()"
      [title]="title()"
      [rawText]="rawText()"
      [areas]="areas()"
      [(draft)]="draft"
      [busy]="busy()"
      [canLater]="canLater()"
      (triage)="triaged.push($event)"
      (dropTask)="dropped = dropped + 1"
      (later)="laters = laters + 1"
      (edit)="edits = edits + 1"
    />
  `,
})
class Host {
  readonly card = viewChild.required(TriageCard);

  readonly position = signal(1);

  readonly total = signal(5);

  readonly title = signal('Call Marit');

  readonly rawText = signal('');

  readonly areas = signal<readonly AreaChoice[]>(AREAS);

  readonly draft = signal<TriageDraft>({ important: null, estimateMinutes: null, areaId: null });

  readonly busy = signal(false);

  readonly canLater = signal(true);

  readonly triaged: TriageDraft[] = [];

  dropped = 0;

  laters = 0;

  edits = 0;
}

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async (draft?: TriageDraft) => {
  const fixture = TestBed.createComponent(Host);
  if (draft) {
    fixture.componentInstance.draft.set(draft);
  }
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const root: HTMLElement = fixture.nativeElement;
  const q = <T extends HTMLElement>(selector: string): T | null => root.querySelector<T>(selector);
  const textIn = (parent: ParentNode, selector: string) =>
    parent.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const find = (selector: string, label: string): HTMLButtonElement | undefined =>
    Array.from(root.querySelectorAll<HTMLButtonElement>(selector)).find(
      (b) => b.textContent?.trim() === label,
    );
  const footerButton = (label: string) => find('.asys-triage__footer button', label);
  const segment = (label: string) => find('.asys-segmented__option', label);
  const chip = (label: string) => find('.asys-estimate__chip', label);
  const changeButton = () => find('.asys-triage__area button', 'Change');
  const select = () => q<HTMLSelectElement>('asys-select-field select');
  const settle = () => fixture.whenStable();

  return {
    fixture,
    host: fixture.componentInstance,
    root,
    q,
    textIn,
    find,
    footerButton,
    segment,
    chip,
    changeButton,
    select,
    settle,
  };
};

describe('TriageCard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('progress and title', () => {
    it('shows the position out of the total', async () => {
      const { q } = await setup();

      expect(q('.asys-triage__progress')?.textContent?.trim()).toBe('1 of 5');
    });

    it('updates the progress text when the inputs change', async () => {
      const { host, q, settle } = await setup();

      host.position.set(3);
      host.total.set(4);
      await settle();

      expect(q('.asys-triage__progress')?.textContent?.trim()).toBe('3 of 4');
    });

    it('renders the title as an h2 that can take programmatic focus', async () => {
      const { q } = await setup();

      const title = q('.asys-triage__title');

      expect(title?.tagName).toBe('H2');
      expect(title?.textContent?.trim()).toBe('Call Marit');
      expect(title?.getAttribute('tabindex')).toBe('-1');
    });

    it('moves focus to the title from focusTitle()', async () => {
      const { host, q } = await setup();

      host.card().focusTitle();

      expect(document.activeElement).toBe(q('.asys-triage__title'));
    });
  });

  describe('raw text', () => {
    it('is shown when it differs from the title', async () => {
      const { host, q, settle } = await setup();

      host.rawText.set('call marit about the roof tomorrow');
      await settle();

      expect(q('.asys-triage__raw')?.textContent?.trim()).toBe(
        'call marit about the roof tomorrow',
      );
    });

    it('is hidden when it equals the title', async () => {
      const { host, q, settle } = await setup();

      host.rawText.set('Call Marit');
      await settle();

      expect(q('.asys-triage__raw')).toBeNull();
    });

    it('is hidden when it is empty', async () => {
      const { q } = await setup();

      expect(q('.asys-triage__raw')).toBeNull();
    });

    it('is hidden when it is only whitespace', async () => {
      const { host, q, settle } = await setup();

      host.rawText.set('   \n ');
      await settle();

      expect(q('.asys-triage__raw')).toBeNull();
    });

    it('is rendered as plain text, never as markup', async () => {
      const { host, q, settle } = await setup();

      host.rawText.set('<b>bold</b> <img src=x>');
      await settle();

      expect(q('.asys-triage__raw')?.textContent?.trim()).toBe('<b>bold</b> <img src=x>');
      expect(q('.asys-triage__raw b')).toBeNull();
      expect(q('.asys-triage__raw img')).toBeNull();
    });
  });

  describe('draft controls', () => {
    it('labels the importance and estimate controls', async () => {
      const { q, segment } = await setup();

      expect(q('.asys-segmented__legend')?.textContent?.trim()).toBe('Importance');
      expect(segment('Important')).toBeDefined();
      expect(segment('Not important')).toBeDefined();
      expect(q('.asys-estimate__legend')?.textContent?.trim()).toBe('Estimate');
    });

    it('sets important to true from the Important segment, keeping the rest', async () => {
      const { host, segment, settle } = await setup(COMPLETE);
      host.draft.set({ important: null, estimateMinutes: 25, areaId: 'a-work' });
      await settle();

      segment('Important')?.click();
      await settle();

      expect(host.draft()).toEqual({ important: true, estimateMinutes: 25, areaId: 'a-work' });
    });

    it('sets important to false from the Not important segment', async () => {
      const { host, segment, settle } = await setup(COMPLETE);

      segment('Not important')?.click();
      await settle();

      expect(host.draft()).toEqual({ important: false, estimateMinutes: 25, areaId: 'a-work' });
    });

    it('reflects the draft importance in the pressed segment', async () => {
      const { segment } = await setup({ important: false, estimateMinutes: null, areaId: null });

      expect(segment('Not important')?.getAttribute('aria-pressed')).toBe('true');
      expect(segment('Important')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('sets the estimate from a chip, keeping the rest', async () => {
      const { host, chip, settle } = await setup({
        important: true,
        estimateMinutes: null,
        areaId: 'a-home',
      });

      chip('25 min')?.click();
      await settle();

      expect(host.draft()).toEqual({ important: true, estimateMinutes: 25, areaId: 'a-home' });
    });

    it('reflects the draft estimate in the pressed chip', async () => {
      const { chip } = await setup(COMPLETE);

      expect(chip('25 min')?.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('Area', () => {
    it('shows the name of the draft Area', async () => {
      const { q } = await setup(COMPLETE);

      expect(q('.asys-triage__area')?.textContent?.replace(/\s+/g, ' ').trim()).toContain(
        'Area: Work',
      );
      expect(q('.asys-triage__area strong')?.textContent?.trim()).toBe('Work');
    });

    it('shows No Area when the draft has no Area', async () => {
      const { q } = await setup();

      expect(q('.asys-triage__area strong')?.textContent?.trim()).toBe('No Area');
    });

    it('shows No Area when the draft Area is not among the areas', async () => {
      const { q } = await setup({ important: true, estimateMinutes: 5, areaId: 'a-gone' });

      expect(q('.asys-triage__area strong')?.textContent?.trim()).toBe('No Area');
    });

    it('hides the select until Change is pressed', async () => {
      const { select, changeButton } = await setup();

      expect(select()).toBeNull();
      expect(changeButton()).toBeDefined();
    });

    it('shows a focused Area select and hides Change when Change is pressed', async () => {
      const { changeButton, select, q, settle } = await setup(COMPLETE);

      changeButton()?.click();
      await settle();

      expect(select()).not.toBeNull();
      expect(document.activeElement).toBe(select());
      expect(q('asys-select-field label')?.textContent?.trim()).toBe('Area');
      expect(changeButton()).toBeUndefined();
    });

    it('offers No Area first, then the areas in order', async () => {
      const { changeButton, select, settle } = await setup(COMPLETE);

      changeButton()?.click();
      await settle();

      const options = Array.from(must(select()).options).map((o) => [
        o.value,
        o.textContent?.trim(),
      ]);

      expect(options).toEqual([
        ['', 'No Area'],
        ['a-home', 'Home'],
        ['a-work', 'Work'],
      ]);
    });

    it('selects the draft Area, or No Area when there is none', async () => {
      const first = await setup(COMPLETE);
      first.changeButton()?.click();
      await first.settle();

      expect(first.select()?.value).toBe('a-work');

      const second = await setup();
      second.changeButton()?.click();
      await second.settle();

      expect(second.select()?.value).toBe('');
    });

    it('sets the draft Area from the select, keeping the rest', async () => {
      const { host, changeButton, select, settle } = await setup(COMPLETE);
      changeButton()?.click();
      await settle();

      must(select()).value = 'a-home';
      must(select()).dispatchEvent(new Event('change', { bubbles: true }));
      await settle();

      expect(host.draft()).toEqual({ important: true, estimateMinutes: 25, areaId: 'a-home' });
    });

    it('turns the empty option into a null Area', async () => {
      const { host, q, changeButton, select, settle } = await setup(COMPLETE);
      changeButton()?.click();
      await settle();

      must(select()).value = '';
      must(select()).dispatchEvent(new Event('change', { bubbles: true }));
      await settle();

      expect(host.draft().areaId).toBeNull();
      expect(q('.asys-triage__area strong')?.textContent?.trim()).toBe('No Area');
    });
  });

  describe('Triage button and reason line', () => {
    it('renders the footer buttons in order: Triage, Later, Edit, Drop', async () => {
      const { root } = await setup();

      const labels = Array.from(root.querySelectorAll('.asys-triage__footer button')).map((b) =>
        b.textContent?.trim(),
      );

      expect(labels).toEqual(['Triage', 'Later', 'Edit', 'Drop']);
    });

    it('uses a Primary Triage button and Quiet others', async () => {
      const { footerButton } = await setup();

      expect(footerButton('Triage')?.classList.contains('asys-button--primary')).toBe(true);
      for (const label of ['Later', 'Edit', 'Drop']) {
        expect(footerButton(label)?.classList.contains('asys-button--quiet')).toBe(true);
      }
    });

    it('asks for an Importance and an Estimate when both are missing', async () => {
      const { q, footerButton } = await setup();

      const reason = q('.asys-triage__reason');

      expect(reason?.textContent?.trim()).toBe('Needs an Importance and an Estimate');
      expect(footerButton('Triage')?.disabled).toBe(true);
      expect(footerButton('Triage')?.getAttribute('aria-describedby')).toBe(reason?.id);
      expect(reason?.id).toBeTruthy();
    });

    it('asks for an Importance when only that is missing', async () => {
      const { q, footerButton } = await setup({
        important: null,
        estimateMinutes: 25,
        areaId: null,
      });

      expect(q('.asys-triage__reason')?.textContent?.trim()).toBe('Needs an Importance');
      expect(footerButton('Triage')?.disabled).toBe(true);
    });

    it('asks for an Estimate when only that is missing', async () => {
      const { q, footerButton } = await setup({
        important: false,
        estimateMinutes: null,
        areaId: null,
      });

      expect(q('.asys-triage__reason')?.textContent?.trim()).toBe('Needs an Estimate');
      expect(footerButton('Triage')?.disabled).toBe(true);
    });

    it('enables Triage and drops the reason line once the draft is complete', async () => {
      const { q, footerButton } = await setup({
        important: false,
        estimateMinutes: 5,
        areaId: null,
      });

      expect(q('.asys-triage__reason')).toBeNull();
      expect(footerButton('Triage')?.disabled).toBe(false);
    });

    it('updates the reason line as the controls are used', async () => {
      const { q, segment, chip, settle } = await setup();

      segment('Important')?.click();
      await settle();

      expect(q('.asys-triage__reason')?.textContent?.trim()).toBe('Needs an Estimate');

      chip('15 min')?.click();
      await settle();

      expect(q('.asys-triage__reason')).toBeNull();
    });

    it('emits triage with the current draft', async () => {
      const { host, footerButton, settle } = await setup(COMPLETE);

      footerButton('Triage')?.click();
      await settle();

      expect(host.triaged).toEqual([COMPLETE]);
    });

    it('emits nothing from Triage while the draft is incomplete', async () => {
      const { host, footerButton, settle } = await setup();

      footerButton('Triage')?.click();
      await settle();

      expect(host.triaged).toEqual([]);
    });
  });

  describe('Later and Edit', () => {
    it('emits later and edit from their buttons', async () => {
      const { host, footerButton, settle } = await setup();

      footerButton('Later')?.click();
      await settle();

      expect(host.laters).toBe(1);
      expect(host.edits).toBe(0);

      footerButton('Edit')?.click();
      await settle();

      expect(host.edits).toBe(1);
      expect(host.laters).toBe(1);
    });

    it('hides Later when canLater is false', async () => {
      const { host, footerButton, settle } = await setup();

      host.canLater.set(false);
      await settle();

      expect(footerButton('Later')).toBeUndefined();
      expect(footerButton('Edit')).toBeDefined();
    });
  });

  describe('Drop', () => {
    it('shows no confirmation until Drop is pressed', async () => {
      const { q } = await setup();

      expect(q('asys-inline-confirm')).toBeNull();
    });

    it('asks for confirmation with the title in curly quotes', async () => {
      const { q, footerButton, settle } = await setup();

      footerButton('Drop')?.click();
      await settle();

      expect(q('.asys-confirm__message')?.textContent?.trim()).toBe(
        'Drop “Call Marit”? This cannot be undone.',
      );
      expect(q('.asys-confirm .asys-button--danger')?.textContent?.trim()).toBe('Drop');
    });

    it('places the confirmation after the footer', async () => {
      const { q, footerButton, settle } = await setup();

      footerButton('Drop')?.click();
      await settle();

      const footer = must(q('.asys-triage__footer'));
      const confirm = must(q('asys-inline-confirm'));

      expect(footer.contains(confirm)).toBe(false);
      expect(
        footer.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('does not emit dropTask before it is confirmed', async () => {
      const { host, footerButton, settle } = await setup();

      footerButton('Drop')?.click();
      await settle();

      expect(host.dropped).toBe(0);
    });

    it('emits dropTask when confirmed', async () => {
      const { host, q, footerButton, settle } = await setup();
      footerButton('Drop')?.click();
      await settle();

      q<HTMLButtonElement>('.asys-confirm .asys-button--danger')?.click();
      await settle();

      expect(host.dropped).toBe(1);
    });

    it('ignores a native DOM drop event bubbling to the card host', async () => {
      const { host, root, footerButton, settle } = await setup();

      root.querySelector('asys-triage-card')?.dispatchEvent(new Event('drop', { bubbles: true }));
      await settle();

      expect(host.dropped).toBe(0);

      footerButton('Drop')?.click();
      await settle();
      root.querySelector('asys-triage-card')?.dispatchEvent(new Event('drop', { bubbles: true }));
      await settle();

      expect(host.dropped).toBe(0);
    });

    it('hides the confirmation and refocuses Drop on cancel', async () => {
      const { host, q, footerButton, settle } = await setup();
      footerButton('Drop')?.click();
      await settle();

      q<HTMLButtonElement>('.asys-confirm__cancel')?.click();
      await settle();

      expect(q('asys-inline-confirm')).toBeNull();
      expect(document.activeElement).toBe(footerButton('Drop'));
      expect(host.dropped).toBe(0);
    });

    it('cancels the confirmation on Escape and refocuses Drop', async () => {
      const { q, footerButton, settle } = await setup();
      footerButton('Drop')?.click();
      await settle();

      q('.asys-confirm')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await settle();

      expect(q('asys-inline-confirm')).toBeNull();
      expect(document.activeElement).toBe(footerButton('Drop'));
    });
  });

  describe('busy', () => {
    it('disables Triage, Drop and the three controls but not Later or Edit', async () => {
      const { host, root, footerButton, settle } = await setup(COMPLETE);

      host.busy.set(true);
      await settle();

      expect(footerButton('Triage')?.disabled).toBe(true);
      expect(footerButton('Drop')?.disabled).toBe(true);
      expect(footerButton('Later')?.disabled).toBe(false);
      expect(footerButton('Edit')?.disabled).toBe(false);
      for (const control of root.querySelectorAll<HTMLButtonElement>(
        '.asys-segmented__option, .asys-estimate__chip',
      )) {
        expect(control.disabled).toBe(true);
      }
    });

    it('disables the Area select while busy', async () => {
      const { host, changeButton, select, settle } = await setup(COMPLETE);
      changeButton()?.click();
      await settle();

      host.busy.set(true);
      await settle();

      expect(select()?.disabled).toBe(true);
    });

    it('disables the confirm button of an open Drop confirmation while busy', async () => {
      const { host, q, footerButton, settle } = await setup(COMPLETE);
      footerButton('Drop')?.click();
      await settle();

      host.busy.set(true);
      await settle();

      expect(q<HTMLButtonElement>('.asys-confirm .asys-button--danger')?.disabled).toBe(true);
    });
  });
});
