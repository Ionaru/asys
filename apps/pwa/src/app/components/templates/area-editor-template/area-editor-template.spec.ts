// SPDX-License-Identifier: EUPL-1.2
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Palette } from '@asys/domain';

import {
  AreaEditorDay,
  AreaEditorRow,
  AreaEditorRowRef,
  AreaEditorTemplate,
  AreaEditorTimeChange,
  RowEdge,
} from './area-editor-template';

const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const row = (start: string, end: string, error: string | null = null): AreaEditorRow => ({
  start,
  end,
  error,
});

const day = (
  index: number,
  rows: readonly AreaEditorRow[] = [],
  overlap = false,
): AreaEditorDay => ({
  index,
  name: NAMES[index]!,
  rows,
  overlap,
});

const week = (overrides: Record<number, AreaEditorDay> = {}): AreaEditorDay[] =>
  NAMES.map((_, index) => overrides[index] ?? day(index));

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const setup = async (overrides: Record<string, unknown> = {}) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(AreaEditorTemplate);
  const inputs: Record<string, unknown> = {
    heading: 'Work',
    statusLine: '',
    loaded: true,
    loadFailed: false,
    found: true,
    isNew: false,
    name: 'Work',
    palette: null,
    days: week(),
    noHours: false,
    needsName: false,
    canSubmit: true,
    awaiting: false,
    ...overrides,
  };
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  document.body.append(fixture.nativeElement as HTMLElement);
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  const update = async (name: string, value: unknown): Promise<void> => {
    fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
  };
  const text = (el: Element | null = host): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const buttonIn = (scope: ParentNode, name: string): HTMLButtonElement | undefined =>
    [...scope.querySelectorAll('button')].find((b) => text(b) === name);
  const buttonsIn = (scope: ParentNode, name: string): HTMLButtonElement[] =>
    [...scope.querySelectorAll('button')].filter((b) => text(b) === name);
  const fieldset = (legend: string): HTMLFieldSetElement =>
    must(
      [...host.querySelectorAll('fieldset')].find(
        (f) => text(f.querySelector('legend')) === legend,
      ),
      `fieldset ${legend}`,
    );
  const timeInputs = (legend: string): HTMLInputElement[] => [
    ...fieldset(legend).querySelectorAll<HTMLInputElement>('input[type="time"]'),
  ];
  const nameInput = (): HTMLTextAreaElement =>
    must(
      [...host.querySelectorAll<HTMLElement>('asys-text-field')]
        .find((f) => text(f.querySelector('label')) === 'Name')
        ?.querySelector('textarea'),
      'name textarea',
    );
  const paletteSelect = (): HTMLSelectElement =>
    must(
      [...host.querySelectorAll<HTMLElement>('asys-select-field')]
        .find((f) => text(f.querySelector('label')) === 'Palette')
        ?.querySelector('select'),
      'palette select',
    );
  const submit = (): HTMLButtonElement =>
    must(buttonIn(host, 'Save') ?? buttonIn(host, 'Create'), 'submit button');
  return {
    fixture,
    host,
    update,
    text,
    buttonIn,
    buttonsIn,
    fieldset,
    timeInputs,
    nameInput,
    paletteSelect,
    submit,
  };
};

const NO_HOURS = 'Tasks in this Area never show in Now unless you pick it there.';

describe('AreaEditorTemplate', () => {
  it('shows the heading, then the status line, in every state', async () => {
    const { host, update } = await setup({ heading: 'Work', statusLine: 'Area saved.' });
    const status = host.querySelector('p[role="status"]');

    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Work');
    expect(host.querySelector('h1')?.nextElementSibling).toBe(status);
    expect(status?.textContent?.trim()).toBe('Area saved.');

    await update('loaded', false);

    expect(host.querySelector('h1')?.nextElementSibling).toBe(
      host.querySelector('p[role="status"]'),
    );
    expect(host.querySelector('p[role="status"]')?.textContent?.trim()).toBe('Area saved.');
  });

  it('B1 shows only the load state while not loaded, and its retry emits', async () => {
    const { fixture, host, update, buttonIn } = await setup({ loaded: false });
    const retry = vi.fn<() => void>();
    fixture.componentInstance.retry.subscribe(retry);

    expect(host.querySelector('asys-load-state')).not.toBeNull();
    expect(host.textContent).toContain('Loading…');
    expect(host.querySelector('fieldset')).toBeNull();

    await update('loadFailed', true);

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'ASYS could not load your Tasks.',
    );

    must(buttonIn(host, 'Try again')).click();

    expect(retry).toHaveBeenCalledOnce();
  });

  it('B2 shows the form with Name, Palette, the hint, a fieldset per day in order and the submit button', async () => {
    const { host, text, nameInput, paletteSelect, submit } = await setup({ name: 'Work' });

    expect(host.querySelector('asys-load-state')).toBeNull();
    expect(nameInput().value).toBe('Work');
    expect(paletteSelect()).toBeDefined();
    expect(text()).toContain('An end of 00:00 means the end of the day.');
    expect([...host.querySelectorAll('fieldset legend')].map((l) => text(l))).toEqual(NAMES);
    expect(submit()).toBeDefined();
  });

  it('B3 shows only the sync note when the Area is missing but awaits sync', async () => {
    const { host, text } = await setup({ found: false, awaiting: true });
    const note = host.querySelector('p[asys-sync-note]');

    expect(note).not.toBeNull();
    expect(host.querySelector('p[role="status"]')?.nextElementSibling).toBe(note);
    expect(host.querySelector('fieldset')).toBeNull();
    expect(text()).not.toContain('This Area no longer exists.');
  });

  it('B4 says the Area no longer exists and links to the list when not awaiting', async () => {
    const { host, text } = await setup({ found: false, awaiting: false });
    const link = must(
      [...host.querySelectorAll('a')].find((a) => text(a) === 'Go to Areas'),
      'link',
    );

    expect(text()).toContain('This Area no longer exists.');
    expect(link.getAttribute('href')).toBe('/settings/areas');
    expect(host.querySelector('fieldset')).toBeNull();
  });

  it('B5 emits nameChange with the typed text', async () => {
    const { fixture, nameInput } = await setup();
    const nameChange = vi.fn<(name: string) => void>();
    fixture.componentInstance.nameChange.subscribe(nameChange);
    const el = nameInput();

    el.value = 'Job';
    el.dispatchEvent(new Event('input', { bubbles: true }));

    expect(nameChange).toHaveBeenCalledExactlyOnceWith('Job');
  });

  it('B6 offers Default look then the four palettes with the enum values', async () => {
    const { paletteSelect } = await setup();

    expect(
      [...paletteSelect().options].map((o) => ({
        value: o.value,
        label: (o.textContent ?? '').trim(),
      })),
    ).toEqual([
      { value: '', label: 'Default look (Evergreen)' },
      { value: Palette.Evergreen, label: 'Evergreen' },
      { value: Palette.Harbour, label: 'Harbour' },
      { value: Palette.Moss, label: 'Moss' },
      { value: Palette.Graphite, label: 'Graphite' },
    ]);
  });

  it('B6 selects Default look for a null palette and the matching option otherwise', async () => {
    const { paletteSelect, update } = await setup({ palette: null });

    expect(paletteSelect().value).toBe('');

    await update('palette', Palette.Moss);

    expect(paletteSelect().value).toBe(Palette.Moss);
  });

  it('B6 emits paletteChange with the Palette, and null for Default look', async () => {
    const { fixture, paletteSelect } = await setup({ palette: Palette.Harbour });
    const paletteChange = vi.fn<(palette: Palette | null) => void>();
    fixture.componentInstance.paletteChange.subscribe(paletteChange);
    const select = paletteSelect();

    select.value = Palette.Graphite;
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(paletteChange).toHaveBeenLastCalledWith(Palette.Graphite);

    select.value = '';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(paletteChange).toHaveBeenLastCalledWith(null);
    expect(paletteChange).toHaveBeenCalledTimes(2);
  });

  it('B7 renders From and To time inputs with their values, labelled by matching ids', async () => {
    const { timeInputs, text } = await setup({
      days: week({ 0: day(0, [row('09:00', '17:00'), row('', '10:00', 'Enter a time')]) }),
    });
    const inputs = timeInputs('Monday');

    expect(inputs.map((i) => i.value)).toEqual(['09:00', '17:00', '', '10:00']);
    expect(inputs.map((i) => text(i.labels?.[0] ?? null))).toEqual(['From', 'To', 'From', 'To']);
    for (const input of inputs) {
      const label = must(input.labels?.[0], 'label');

      expect(label.getAttribute('for')).toBe(input.id);
    }
  });

  it('B7 keeps every id in the rendered form unique', async () => {
    const { host } = await setup({
      days: week({
        0: day(0, [row('09:00', '17:00'), row('', '10:00', 'Enter a time')], true),
        1: day(1, [row('08:00', '09:00')]),
      }),
    });
    const ids = [...host.querySelectorAll('[id]')].map((e) => e.id).filter((id) => id !== '');

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('B7 marks only the row with an error invalid and wires its inputs to the error line', async () => {
    const { timeInputs, fieldset } = await setup({
      days: week({ 0: day(0, [row('09:00', '17:00'), row('', '10:00', 'Enter a time')]) }),
    });
    const inputs = timeInputs('Monday');
    const error = must(
      [...fieldset('Monday').querySelectorAll<HTMLElement>('p[asys-field-error]')].find((p) =>
        (p.textContent ?? '').includes('Enter a time'),
      ),
      'error line',
    );

    expect(error.id).not.toBe('');
    for (const input of inputs.slice(0, 2)) {
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    }
    for (const input of inputs.slice(2)) {
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(error.id);
    }
  });

  it('B7 shows Hours overlap for an overlapping day and wires every input of that day to it', async () => {
    const { timeInputs, fieldset, text } = await setup({
      days: week({
        1: day(1, [row('09:00', '12:00'), row('11:00', '13:00')], true),
        2: day(2, [row('09:00', '12:00')]),
      }),
    });
    const overlap = must(
      [...fieldset('Tuesday').querySelectorAll<HTMLElement>('p[asys-field-error]')].find((p) =>
        text(p).includes('Hours overlap'),
      ),
      'overlap line',
    );

    expect(overlap.id).not.toBe('');
    for (const input of timeInputs('Tuesday')) {
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(overlap.id);
    }
    for (const input of timeInputs('Wednesday')) {
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.hasAttribute('aria-describedby')).toBe(false);
    }
    expect(text(fieldset('Wednesday'))).not.toContain('Hours overlap');
  });

  it('B7 lists the row error id before the overlap id when a row has both', async () => {
    const { timeInputs, fieldset } = await setup({
      days: week({ 0: day(0, [row('10:00', '09:00', 'End after the start')], true) }),
    });
    const lines = [...fieldset('Monday').querySelectorAll<HTMLElement>('p[asys-field-error]')];
    const rowError = must(lines.find((p) => (p.textContent ?? '').includes('End after the start')));
    const overlap = must(lines.find((p) => (p.textContent ?? '').includes('Hours overlap')));

    for (const input of timeInputs('Monday')) {
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(`${rowError.id} ${overlap.id}`);
    }
  });

  it('B8 emits timeChange synchronously with day, row, edge and the raw value', async () => {
    const { fixture, timeInputs } = await setup({
      days: week({ 1: day(1, [row('09:00', '17:00')]) }),
    });
    const timeChange = vi.fn<(change: AreaEditorTimeChange) => void>();
    fixture.componentInstance.timeChange.subscribe(timeChange);
    const [from, to] = timeInputs('Tuesday');

    must(to).value = '18:30';
    must(to).dispatchEvent(new Event('input', { bubbles: true }));

    expect(timeChange).toHaveBeenCalledExactlyOnceWith({
      day: 1,
      row: 0,
      edge: RowEdge.End,
      value: '18:30',
    });

    must(from).value = '08:15';
    must(from).dispatchEvent(new Event('input', { bubbles: true }));

    expect(timeChange).toHaveBeenLastCalledWith({
      day: 1,
      row: 0,
      edge: RowEdge.Start,
      value: '08:15',
    });
  });

  it('B8 reports the row index of a later row', async () => {
    const { fixture, timeInputs } = await setup({
      days: week({ 3: day(3, [row('09:00', '10:00'), row('11:00', '12:00')]) }),
    });
    const timeChange = vi.fn<(change: AreaEditorTimeChange) => void>();
    fixture.componentInstance.timeChange.subscribe(timeChange);
    const input = must(timeInputs('Thursday')[2]);

    input.value = '11:30';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(timeChange).toHaveBeenCalledExactlyOnceWith({
      day: 3,
      row: 1,
      edge: RowEdge.Start,
      value: '11:30',
    });
  });

  it('B9 emits removeRow with the day and row of the clicked Remove', async () => {
    const { fixture, fieldset, buttonsIn } = await setup({
      days: week({ 0: day(0, [row('09:00', '10:00'), row('11:00', '12:00')]) }),
    });
    const removeRow = vi.fn<(ref: AreaEditorRowRef) => void>();
    fixture.componentInstance.removeRow.subscribe(removeRow);

    must(buttonsIn(fieldset('Monday'), 'Remove')[1]).click();

    expect(removeRow).toHaveBeenCalledExactlyOnceWith({ day: 0, row: 1 });
  });

  it('B9 emits addRow with the day index of the clicked Add hours', async () => {
    const { fixture, fieldset, buttonIn } = await setup();
    const addRow = vi.fn<(day: number) => void>();
    fixture.componentInstance.addRow.subscribe(addRow);

    must(buttonIn(fieldset('Sunday'), 'Add hours')).click();

    expect(addRow).toHaveBeenCalledExactlyOnceWith(6);
  });

  it('B9 offers Add hours on every day and Remove only on days with rows', async () => {
    const { fieldset, buttonIn } = await setup({
      days: week({ 0: day(0, [row('09:00', '10:00')]) }),
    });

    for (const name of NAMES) {
      expect(buttonIn(fieldset(name), 'Add hours')).toBeDefined();
    }
    expect(buttonIn(fieldset('Monday'), 'Remove')).toBeDefined();
    expect(buttonIn(fieldset('Tuesday'), 'Remove')).toBeUndefined();
  });

  it('B10 shows the no-hours note only when noHours', async () => {
    const { text, update } = await setup({ noHours: true });

    expect(text()).toContain(NO_HOURS);

    await update('noHours', false);

    expect(text()).not.toContain(NO_HOURS);
  });

  it('B11 reads Save for an existing Area and Create for a new one', async () => {
    const { buttonIn, host, update } = await setup({ isNew: false });

    expect(buttonIn(host, 'Save')).toBeDefined();
    expect(buttonIn(host, 'Create')).toBeUndefined();

    await update('isNew', true);

    expect(buttonIn(host, 'Create')).toBeDefined();
    expect(buttonIn(host, 'Save')).toBeUndefined();
  });

  it('B11 disables the submit button when canSubmit is false and does not emit save', async () => {
    const { fixture, submit, update } = await setup({ canSubmit: false });
    const save = vi.fn<() => void>();
    fixture.componentInstance.save.subscribe(save);

    expect(submit().disabled).toBe(true);

    submit().click();

    expect(save).not.toHaveBeenCalled();

    await update('canSubmit', true);

    expect(submit().disabled).toBe(false);
  });

  it('B11 emits save once when the enabled submit button is clicked', async () => {
    const { fixture, submit } = await setup({ canSubmit: true });
    const save = vi.fn<() => void>();
    fixture.componentInstance.save.subscribe(save);

    submit().click();

    expect(save).toHaveBeenCalledOnce();
  });

  it('B11 shows Needs a name only when needsName', async () => {
    const { text, update } = await setup({ needsName: true });

    expect(text()).toContain('Needs a name');

    await update('needsName', false);

    expect(text()).not.toContain('Needs a name');
  });

  it('B12 shows the sync note after the button group only while awaiting', async () => {
    const { host, update, submit } = await setup({ awaiting: true });
    const note = must(host.querySelector('p[asys-sync-note]'), 'sync note');

    expect(submit().compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector('fieldset')).not.toBeNull();

    await update('awaiting', false);

    expect(host.querySelector('p[asys-sync-note]')).toBeNull();
  });

  it('B13 focusRemove focuses the Remove button of that row', async () => {
    const { fixture, fieldset, buttonsIn } = await setup({
      days: week({ 0: day(0, [row('09:00', '10:00'), row('11:00', '12:00')]) }),
    });

    fixture.componentInstance.focusRemove(0, 1);

    expect(document.activeElement).toBe(buttonsIn(fieldset('Monday'), 'Remove')[1]);
  });

  it('B13 focusAdd focuses the Add hours button of that day', async () => {
    const { fixture, fieldset, buttonIn } = await setup();

    fixture.componentInstance.focusAdd(2);

    expect(document.activeElement).toBe(buttonIn(fieldset('Wednesday'), 'Add hours'));
  });

  it('B13 does nothing for a row or day that is not rendered', async () => {
    const { fixture } = await setup({ days: week({ 0: day(0, [row('09:00', '10:00')]) }) });
    const before = document.activeElement;

    expect(() => {
      fixture.componentInstance.focusRemove(0, 5);
      fixture.componentInstance.focusRemove(4, 0);
      fixture.componentInstance.focusAdd(9);
    }).not.toThrow();
    expect(document.activeElement).toBe(before);
  });
});
