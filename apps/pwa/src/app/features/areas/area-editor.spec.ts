// SPDX-License-Identifier: EUPL-1.2
import { Component, ErrorHandler, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, type UrlTree } from '@angular/router';
import {
  CommandTag,
  IsoWeekday,
  PERSONAL_ACTIVE_HOURS,
  RejectedReason,
  WORK_ACTIVE_HOURS,
  type ActiveHours,
  type Area,
  type Command,
  type DomainState,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { Ids } from '../../core/platform/ids';
import { AreaEditor } from './area-editor';

const APPLIED: CommandOutcome = { _tag: CommandOutcomeTag.Applied, seq: 1 };

const FAILED: CommandOutcome = { _tag: CommandOutcomeTag.Failed, status: 0 };

const rejected = (reason: RejectedReason): CommandOutcome => ({
  _tag: CommandOutcomeTag.Rejected,
  reason,
});

const EMPTY: ActiveHours = {
  [IsoWeekday.Monday]: [],
  [IsoWeekday.Tuesday]: [],
  [IsoWeekday.Wednesday]: [],
  [IsoWeekday.Thursday]: [],
  [IsoWeekday.Friday]: [],
  [IsoWeekday.Saturday]: [],
  [IsoWeekday.Sunday]: [],
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const area = (id: string, name: string, activeHours: ActiveHours): Area => ({
  id,
  name,
  activeHours,
  defaultPrivacy: null,
  version: 1,
});

const PERSONAL = area('personal', 'Personal', PERSONAL_ACTIVE_HOURS);

const WORK = area('work', 'Work', WORK_ACTIVE_HOURS);

// Monday 13:00 to 17:00 only.
const AFTERNOON = area('pm', 'Afternoons', { ...EMPTY, [IsoWeekday.Monday]: [[780, 1020]] });

const NONE = area('none', 'Nothing', EMPTY);

const domainState = (areas: readonly Area[]): DomainState => ({
  tasks: [],
  links: [],
  areas,
  reviewItems: [],
  settings: { timeZone: 'Europe/Amsterdam', urgencyWindowDays: 2 },
});

const must = <T>(value: T | null | undefined, what = 'value'): T => {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${what}`);
  }

  return value;
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
};

const sent = (send: { mock: { calls: unknown[][] } }, n: number): Command =>
  must(send.mock.calls[n])[0] as Command;

const sentKey = (send: { mock: { calls: unknown[][] } }, n: number): unknown =>
  must(send.mock.calls[n])[1];

@Component({
  imports: [AreaEditor],
  template: '<asys-area-editor [areaId]="id()" />',
})
class Host {
  readonly id = signal<string | null>(null);
}

interface SetupOptions {
  readonly state?: DomainState | null;
  readonly status?: SyncStatus;
  readonly areaId?: string | null;
}

const setup = async (options: SetupOptions = {}) => {
  const state = signal<DomainState | null>(
    options.state === undefined ? domainState([PERSONAL, WORK, AFTERNOON, NONE]) : options.state,
  );
  const status = signal<SyncStatus>(options.status ?? SyncStatus.Ready);
  const awaitingSync = signal<ReadonlySet<string>>(new Set());
  const sends: ReturnType<typeof deferred<CommandOutcome>>[] = [];
  const send = vi.fn<(command: Command, key?: string) => Promise<CommandOutcome>>(() => {
    const d = deferred<CommandOutcome>();

    sends.push(d);

    return d.promise;
  });
  const refresh = vi.fn<() => void>();
  let counter = 0;
  const next = vi.fn<() => string>(() => `id-${++counter}`);
  const handleError = vi.fn<(error: unknown) => void>();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: DataStore, useValue: { state, status, awaitingSync, send, refresh } },
      { provide: Ids, useValue: { next } },
      { provide: ErrorHandler, useValue: { handleError } },
    ],
  });

  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Host);

  fixture.componentInstance.id.set(options.areaId === undefined ? 'personal' : options.areaId);
  document.body.appendChild(fixture.nativeElement);
  await fixture.whenStable();

  const root = (): HTMLElement => fixture.nativeElement;
  const text = (el: Element | null = root()): string =>
    (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const click = async (el: HTMLElement | null | undefined): Promise<void> => {
    must(el).click();
    await settle();
  };
  const statusLine = (): HTMLElement => must(root().querySelector('[role="status"]'));
  const buttonIn = (scope: ParentNode, name: string): HTMLButtonElement | undefined =>
    Array.from(scope.querySelectorAll('button')).find((b) => text(b) === name);
  const button = (name: string): HTMLButtonElement | undefined => buttonIn(root(), name);
  const saveButton = (): HTMLButtonElement | undefined => button('Save') ?? button('Create');
  const day = (legend: string): HTMLFieldSetElement =>
    must(
      Array.from(root().querySelectorAll('fieldset')).find(
        (f) => text(f.querySelector('legend')) === legend,
      ),
    );
  const timeInputs = (legend: string): HTMLInputElement[] =>
    Array.from(day(legend).querySelectorAll<HTMLInputElement>('input[type="time"]'));
  // The From and To values of each row of a day.
  const rows = (legend: string): [string, string][] => {
    const inputs = timeInputs(legend);
    const result: [string, string][] = [];

    for (let i = 0; i < inputs.length; i += 2) {
      result.push([must(inputs[i]).value, must(inputs[i + 1]).value]);
    }

    return result;
  };
  const setTime = async (legend: string, row: number, which: 0 | 1, value: string) => {
    const input = must(timeInputs(legend)[row * 2 + which]);

    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const setRow = async (legend: string, row: number, from: string, to: string) => {
    await setTime(legend, row, 0, from);
    await setTime(legend, row, 1, to);
  };
  const addHours = async (legend: string): Promise<void> => {
    await click(buttonIn(day(legend), 'Add hours'));
  };
  const nameInput = (): HTMLInputElement =>
    must(
      must(
        Array.from(root().querySelectorAll<HTMLElement>('asys-text-field')).find(
          (f) => text(f.querySelector('label')) === 'Name',
        ),
      ).querySelector('input'),
    );
  const typeName = async (value: string): Promise<void> => {
    const el = nameInput();

    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const finish = async (
    n: number,
    outcome: CommandOutcome,
    nextState?: DomainState,
  ): Promise<void> => {
    if (nextState !== undefined) {
      state.set(nextState);
    }

    must(sends[n]).resolve(outcome);
    await settle();
  };
  const update = async (nextState: DomainState | null): Promise<void> => {
    state.set(nextState);
    await settle();
  };
  const navigatedTo = (
    n: number,
  ): { url: string; extras: { replaceUrl?: boolean } | undefined } => {
    const [target, extras] = must(navigate.mock.calls[n]) as [string | UrlTree, never];

    return {
      url: typeof target === 'string' ? target : router.serializeUrl(target),
      extras,
    };
  };

  await settle();

  return {
    state,
    status,
    awaitingSync,
    sends,
    send,
    refresh,
    next,
    handleError,
    navigate,
    navigatedTo,
    fixture,
    host: fixture.componentInstance,
    root,
    text,
    settle,
    click,
    statusLine,
    button,
    saveButton,
    day,
    timeInputs,
    rows,
    setTime,
    setRow,
    addHours,
    nameInput,
    typeName,
    finish,
    update,
    buttonIn,
  };
};

// Every weekday with its sorted intervals, for the expected ActiveHours of a command.
const hoursWith = (base: ActiveHours, overrides: Partial<ActiveHours>): ActiveHours => ({
  ...base,
  ...overrides,
});

describe('AreaEditor', () => {
  describe('loading and missing', () => {
    it('shows Loading while there is no state', async () => {
      const { text } = await setup({ state: null });

      expect(text()).toContain('Loading…');
    });

    it('offers Try again after a failed load and shows the Area once it arrives', async () => {
      const { root, refresh, status, update, click, button, text } = await setup({
        state: null,
        status: SyncStatus.Failed,
      });

      expect(root().querySelector('[role="alert"]')?.textContent).toContain(
        'ASYS could not load your Tasks.',
      );

      await click(button('Try again'));

      expect(refresh).toHaveBeenCalledTimes(1);

      status.set(SyncStatus.Ready);
      await update(domainState([PERSONAL]));

      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Personal');
      expect(text()).not.toContain('Loading…');
    });

    it('says an unknown Area no longer exists and links back to the list', async () => {
      const { text, root } = await setup({ areaId: 'gone' });

      expect(text()).toContain('This Area no longer exists.');
      expect(root().querySelector('a[href="/settings/areas"]')).not.toBeNull();
      expect(root().querySelector('fieldset')).toBeNull();
    });

    it('shows Saved, waiting instead of no longer exists for an id that awaits sync', async () => {
      const { text, awaitingSync, settle } = await setup({ areaId: 'fresh' });

      awaitingSync.set(new Set(['fresh']));
      await settle();

      expect(text()).toContain('Saved. Waiting for the server.');
      expect(text()).not.toContain('This Area no longer exists.');
    });

    it('has an always-present status line', async () => {
      const { statusLine } = await setup();

      expect(statusLine()).not.toBeNull();
    });

    it('keeps the empty status line displayed, so later messages are announced', async () => {
      const { statusLine } = await setup();

      expect(statusLine().textContent?.trim()).toBe('');
      expect(getComputedStyle(statusLine()).display).not.toBe('none');
    });
  });

  describe('opening an Area', () => {
    it('shows the stored name as the heading and in the Name field', async () => {
      const { root, nameInput } = await setup({ areaId: 'work' });

      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Work');
      expect(nameInput().value).toBe('Work');
    });

    it('shows a fieldset per weekday, Monday to Sunday, with the hint about 00:00', async () => {
      const { root, text } = await setup({ areaId: 'work' });

      expect(Array.from(root().querySelectorAll('fieldset legend')).map((l) => text(l))).toEqual(
        DAYS,
      );
      expect(text()).toContain('An end of 00:00 means the end of the day.');
    });

    it('shows the hours as time-input rows, with an end of 1440 as 00:00', async () => {
      const { rows } = await setup({ areaId: 'personal' });

      for (const legend of DAYS) {
        expect(rows(legend)).toEqual([['00:00', '00:00']]);
      }
    });

    it('shows Work hours on weekdays only', async () => {
      const { rows } = await setup({ areaId: 'work' });

      expect(rows('Monday')).toEqual([['08:00', '18:00']]);
      expect(rows('Friday')).toEqual([['08:00', '18:00']]);
      expect(rows('Saturday')).toEqual([]);
      expect(rows('Sunday')).toEqual([]);
    });

    it('labels each row From and To and offers Remove per row and Add hours per day', async () => {
      const { day, text, buttonIn } = await setup({ areaId: 'work' });
      const labels = Array.from(day('Monday').querySelectorAll('label')).map((l) => text(l));

      expect(labels).toEqual(['From', 'To']);
      expect(buttonIn(day('Monday'), 'Remove')).toBeDefined();
      expect(buttonIn(day('Monday'), 'Add hours')).toBeDefined();
      expect(buttonIn(day('Saturday'), 'Remove')).toBeUndefined();
      expect(buttonIn(day('Saturday'), 'Add hours')).toBeDefined();
    });

    it('offers Save, not Create', async () => {
      const { button } = await setup({ areaId: 'work' });

      expect(button('Save')).toBeDefined();
      expect(button('Create')).toBeUndefined();
    });

    it('keeps Save disabled and sends nothing when nothing changed (seeded Personal)', async () => {
      const { saveButton, click, send } = await setup({ areaId: 'personal' });

      expect(must(saveButton()).disabled).toBe(true);

      await click(saveButton());

      expect(send).not.toHaveBeenCalled();
    });

    it('does not show the no-hours note when some day has hours', async () => {
      const { text } = await setup({ areaId: 'pm' });

      expect(text()).not.toContain('Tasks in this Area never show in Now.');
    });

    it('shows the no-hours note, not as an error, when no day has hours', async () => {
      const { text, saveButton, root } = await setup({ areaId: 'none' });

      expect(text()).toContain('Tasks in this Area never show in Now.');
      expect(must(saveButton()).disabled).toBe(true);
      expect(root().textContent).not.toContain('Hours overlap');
    });
  });

  describe('editing hours and checking', () => {
    it('Add hours appends 09:00 to 17:00 to the day', async () => {
      const { addHours, rows } = await setup({ areaId: 'none' });

      await addHours('Wednesday');

      expect(rows('Wednesday')).toEqual([['09:00', '17:00']]);
      expect(rows('Tuesday')).toEqual([]);
    });

    it('Add hours hides the no-hours note', async () => {
      const { addHours, text } = await setup({ areaId: 'none' });

      await addHours('Wednesday');

      expect(text()).not.toContain('Tasks in this Area never show in Now.');
    });

    it('Remove drops that row and the draft then differs from the stored hours', async () => {
      const { day, buttonIn, click, rows, saveButton } = await setup({ areaId: 'work' });

      await click(buttonIn(day('Monday'), 'Remove'));

      expect(rows('Monday')).toEqual([]);
      expect(rows('Tuesday')).toEqual([['08:00', '18:00']]);
      expect(must(saveButton()).disabled).toBe(false);
    });

    it('shows End after the start for 10:00 to 09:00 and blocks Save', async () => {
      const { addHours, setRow, day, text, saveButton } = await setup({ areaId: 'none' });

      await addHours('Monday');
      await setRow('Monday', 0, '10:00', '09:00');

      expect(text(day('Monday'))).toContain('End after the start');
      expect(must(saveButton()).disabled).toBe(true);

      await setRow('Monday', 0, '08:00', '09:00');

      expect(text(day('Monday'))).not.toContain('End after the start');
      expect(must(saveButton()).disabled).toBe(false);
    });

    it('shows Hours overlap on the day for 09:00 to 12:00 with 11:00 to 13:00', async () => {
      const { addHours, setRow, day, text, saveButton } = await setup({ areaId: 'none' });

      await addHours('Tuesday');
      await addHours('Tuesday');
      await setRow('Tuesday', 0, '09:00', '12:00');
      await setRow('Tuesday', 1, '11:00', '13:00');

      expect(text(day('Tuesday'))).toContain('Hours overlap');
      expect(text(day('Monday'))).not.toContain('Hours overlap');
      expect(must(saveButton()).disabled).toBe(true);
    });

    it('detects the overlap whatever the order of the rows', async () => {
      const { addHours, setRow, day, text } = await setup({ areaId: 'none' });

      await addHours('Tuesday');
      await addHours('Tuesday');
      await setRow('Tuesday', 0, '11:00', '13:00');
      await setRow('Tuesday', 1, '09:00', '12:00');

      expect(text(day('Tuesday'))).toContain('Hours overlap');
    });

    it('accepts hours that touch, 09:00 to 12:00 then 12:00 to 13:00', async () => {
      const { addHours, setRow, day, text, saveButton } = await setup({ areaId: 'none' });

      await addHours('Tuesday');
      await addHours('Tuesday');
      await setRow('Tuesday', 0, '09:00', '12:00');
      await setRow('Tuesday', 1, '12:00', '13:00');

      expect(text(day('Tuesday'))).not.toContain('Hours overlap');
      expect(must(saveButton()).disabled).toBe(false);
    });

    it('shows the row error as a field error with an Error: word, wired to the time inputs', async () => {
      const { addHours, setRow, day, timeInputs } = await setup({ areaId: 'none' });

      await addHours('Monday');
      await setRow('Monday', 0, '10:00', '09:00');

      const error = must(
        Array.from(day('Monday').querySelectorAll<HTMLElement>('p.asys-field__error')).find((p) =>
          (p.textContent ?? '').includes('End after the start'),
        ),
      );

      expect(error.id).not.toBe('');
      expect(error.querySelector('.asys-field__error-word')?.textContent?.trim()).toBe('Error:');
      expect(error.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: End after the start');
      expect(timeInputs('Monday')[1]?.getAttribute('aria-describedby')).toContain(error.id);
    });

    it('shows Enter a time as a field error with an Error: word', async () => {
      const { addHours, setTime, day } = await setup({ areaId: 'none' });

      await addHours('Monday');
      await setTime('Monday', 0, 0, '');

      const error = must(
        Array.from(day('Monday').querySelectorAll<HTMLElement>('p.asys-field__error')).find((p) =>
          (p.textContent ?? '').includes('Enter a time'),
        ),
      );

      expect(error.id).not.toBe('');
      expect(error.querySelector('.asys-field__error-word')?.textContent?.trim()).toBe('Error:');
      expect(error.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: Enter a time');
    });

    it('shows Hours overlap as a field error and marks that days time inputs invalid', async () => {
      const { addHours, setRow, day, timeInputs } = await setup({ areaId: 'none' });

      await addHours('Tuesday');
      await addHours('Tuesday');
      await addHours('Monday');
      await setRow('Tuesday', 0, '09:00', '12:00');
      await setRow('Tuesday', 1, '11:00', '13:00');

      const overlap = must(
        Array.from(day('Tuesday').querySelectorAll<HTMLElement>('p.asys-field__error')).find((p) =>
          (p.textContent ?? '').includes('Hours overlap'),
        ),
      );

      expect(overlap.id).not.toBe('');
      expect(overlap.querySelector('.asys-field__error-word')?.textContent?.trim()).toBe('Error:');
      expect(overlap.textContent?.replace(/\s+/g, ' ').trim()).toBe('Error: Hours overlap');
      expect(timeInputs('Tuesday')).toHaveLength(4);

      for (const input of timeInputs('Tuesday')) {
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toContain(overlap.id);
      }

      for (const input of timeInputs('Monday')) {
        expect(input.getAttribute('aria-invalid')).not.toBe('true');
        expect(input.getAttribute('aria-describedby') ?? '').not.toContain(overlap.id);
      }
    });

    it('Remove moves focus to the Remove button at the same index when one remains', async () => {
      const { addHours, day, click } = await setup({ areaId: 'none' });

      await addHours('Monday');
      await addHours('Monday');
      await addHours('Monday');

      const removes = (): HTMLButtonElement[] =>
        Array.from(day('Monday').querySelectorAll<HTMLButtonElement>('button')).filter(
          (b) => b.textContent?.trim() === 'Remove',
        );

      await click(removes()[1]);

      expect(removes()).toHaveLength(2);
      expect(document.activeElement).toBe(removes()[1]);
    });

    it('Remove of the last row moves focus to the previous row Remove button', async () => {
      const { addHours, day, click } = await setup({ areaId: 'none' });

      await addHours('Monday');
      await addHours('Monday');

      const removes = (): HTMLButtonElement[] =>
        Array.from(day('Monday').querySelectorAll<HTMLButtonElement>('button')).filter(
          (b) => b.textContent?.trim() === 'Remove',
        );

      await click(removes()[1]);

      expect(removes()).toHaveLength(1);
      expect(document.activeElement).toBe(removes()[0]);
    });

    it('Remove of the only row moves focus to the Add hours button of that day', async () => {
      const { day, buttonIn, click } = await setup({ areaId: 'work' });

      await click(buttonIn(day('Monday'), 'Remove'));

      expect(buttonIn(day('Monday'), 'Remove')).toBeUndefined();
      expect(document.activeElement).toBe(buttonIn(day('Monday'), 'Add hours'));
      expect(document.activeElement).not.toBe(buttonIn(day('Tuesday'), 'Add hours'));
    });

    it('Remove keeps focus on the same day when other days have rows', async () => {
      const { day, buttonIn, click } = await setup({ areaId: 'work' });

      await click(buttonIn(day('Wednesday'), 'Remove'));

      expect(document.activeElement).toBe(buttonIn(day('Wednesday'), 'Add hours'));
    });

    it('shows Enter a time for an empty time and blocks Save, without End after the start', async () => {
      const { addHours, setTime, day, text, saveButton } = await setup({ areaId: 'none' });

      await addHours('Monday');
      await setTime('Monday', 0, 0, '');

      expect(text(day('Monday'))).toContain('Enter a time');
      expect(text(day('Monday'))).not.toContain('End after the start');
      expect(must(saveButton()).disabled).toBe(true);
    });
  });

  describe('Save', () => {
    it('sends only the name when only the name changed', async () => {
      const { typeName, click, saveButton, send } = await setup({ areaId: 'work' });

      await typeName('  Job  ');
      await click(saveButton());

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toStrictEqual({
        _tag: CommandTag.UpdateArea,
        areaId: 'work',
        patch: { name: 'Job' },
      });
      expect(sentKey(send, 0)).toBe('id-1');
    });

    it('does not send the name when only whitespace around it changed', async () => {
      const { typeName, saveButton } = await setup({ areaId: 'work' });

      await typeName(' Work ');

      expect(must(saveButton()).disabled).toBe(true);
    });

    it('sends only the hours when only the hours changed, all seven days', async () => {
      const { addHours, setRow, click, saveButton, send } = await setup({ areaId: 'pm' });

      await addHours('Monday');
      await setRow('Monday', 1, '08:00', '09:00');
      await click(saveButton());

      expect(sent(send, 0)).toStrictEqual({
        _tag: CommandTag.UpdateArea,
        areaId: 'pm',
        patch: {
          activeHours: hoursWith(EMPTY, {
            [IsoWeekday.Monday]: [
              [480, 540],
              [780, 1020],
            ],
          }),
        },
      });
    });

    it('sends name and hours together when both changed', async () => {
      const { typeName, addHours, click, saveButton, send } = await setup({ areaId: 'none' });

      await typeName('Gym');
      await addHours('Saturday');
      await click(saveButton());

      expect(sent(send, 0)).toStrictEqual({
        _tag: CommandTag.UpdateArea,
        areaId: 'none',
        patch: {
          name: 'Gym',
          activeHours: hoursWith(EMPTY, { [IsoWeekday.Saturday]: [[540, 1020]] }),
        },
      });
    });

    it('saves an end of 00:00 as 1440', async () => {
      const { addHours, setRow, click, saveButton, send } = await setup({ areaId: 'none' });

      await addHours('Sunday');
      await setRow('Sunday', 0, '22:00', '00:00');
      await click(saveButton());

      expect(sent(send, 0)).toStrictEqual({
        _tag: CommandTag.UpdateArea,
        areaId: 'none',
        patch: { activeHours: hoursWith(EMPTY, { [IsoWeekday.Sunday]: [[1320, 1440]] }) },
      });
    });

    it('cuts a time value to HH:MM before reading it', async () => {
      const { addHours, setRow, click, saveButton, send } = await setup({ areaId: 'none' });

      await addHours('Sunday');
      await setRow('Sunday', 0, '09:30:00', '10:00');
      await click(saveButton());

      expect(sent(send, 0)).toStrictEqual({
        _tag: CommandTag.UpdateArea,
        areaId: 'none',
        patch: { activeHours: hoursWith(EMPTY, { [IsoWeekday.Sunday]: [[570, 600]] }) },
      });
    });

    it('disables Save while the send is pending', async () => {
      const { typeName, click, saveButton, send } = await setup({ areaId: 'work' });

      await typeName('Job');
      await click(saveButton());

      expect(must(saveButton()).disabled).toBe(true);

      await click(saveButton());

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('shows Area saved after Applied and rebases the draft on the stored Area', async () => {
      const { typeName, click, saveButton, finish, statusLine, nameInput, root } = await setup({
        areaId: 'work',
      });

      await typeName('Job');
      await click(saveButton());
      await finish(0, APPLIED, domainState([PERSONAL, { ...WORK, name: 'Job', version: 2 }]));

      expect(statusLine().textContent?.trim()).toBe('Area saved.');
      expect(nameInput().value).toBe('Job');
      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Job');
      expect(must(saveButton()).disabled).toBe(true);
    });

    it('shows the outcome message for a Rejected Save and keeps the draft', async () => {
      const { typeName, click, saveButton, finish, statusLine, nameInput } = await setup({
        areaId: 'work',
      });

      await typeName('Job');
      await click(saveButton());
      await finish(0, rejected(RejectedReason.InvalidName));

      expect(statusLine().textContent?.trim()).toBe('Enter a name.');
      expect(nameInput().value).toBe('Job');
      expect(must(saveButton()).disabled).toBe(false);
    });

    it('shows the outcome message for a Failed Save', async () => {
      const { typeName, click, saveButton, finish, statusLine } = await setup({ areaId: 'work' });

      await typeName('Job');
      await click(saveButton());
      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).toBe('ASYS cannot reach the server. Try again.');
    });

    it('disables Save and says so while the Area id awaits sync', async () => {
      const { typeName, awaitingSync, settle, saveButton, text } = await setup({
        areaId: 'work',
      });

      await typeName('Job');
      awaitingSync.set(new Set(['work']));
      await settle();

      expect(must(saveButton()).disabled).toBe(true);
      expect(text()).toContain('Saved. Waiting for the server.');
    });

    it('blocks Save while the name is blank and shows Needs a name', async () => {
      const { typeName, saveButton, text } = await setup({ areaId: 'work' });

      await typeName('   ');

      expect(must(saveButton()).disabled).toBe(true);
      expect(text()).toContain('Needs a name');
    });
  });

  describe('when the stored Area changes', () => {
    it('keeps Save disabled when activeHours change outside and the draft was untouched', async () => {
      const { update, saveButton, rows } = await setup({ areaId: 'work' });

      await update(
        domainState([
          PERSONAL,
          {
            ...WORK,
            activeHours: hoursWith(WORK_ACTIVE_HOURS, { [IsoWeekday.Saturday]: [[600, 720]] }),
            version: 2,
          },
        ]),
      );

      expect(rows('Saturday')).toEqual([['10:00', '12:00']]);
      expect(must(saveButton()).disabled).toBe(true);
    });

    it('follows an outside rename in an untouched name', async () => {
      const { update, nameInput, root, saveButton } = await setup({ areaId: 'work' });

      await update(domainState([PERSONAL, { ...WORK, name: 'Job', version: 2 }]));

      expect(nameInput().value).toBe('Job');
      expect(root().querySelector('h1')?.textContent?.trim()).toBe('Job');
      expect(must(saveButton()).disabled).toBe(true);
    });

    it('keeps a name the person edited when only the hours change outside', async () => {
      const { typeName, update, nameInput, saveButton } = await setup({ areaId: 'work' });

      await typeName('Mine');
      await update(
        domainState([
          PERSONAL,
          {
            ...WORK,
            activeHours: hoursWith(WORK_ACTIVE_HOURS, { [IsoWeekday.Sunday]: [[600, 720]] }),
            version: 2,
          },
        ]),
      );

      expect(nameInput().value).toBe('Mine');
      expect(must(saveButton()).disabled).toBe(false);
    });
  });

  describe('when the screen is destroyed while a send is pending', () => {
    it('Save shows no status and throws nothing', async () => {
      const { fixture, sends, handleError, statusLine, typeName, click, saveButton, navigate } =
        await setup({ areaId: 'work' });
      const line = statusLine();

      await typeName('Job');
      await click(saveButton());
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handleError).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(line.textContent?.trim()).toBe('');
    });

    it('Create does not navigate to the new Area', async () => {
      const { fixture, sends, handleError, typeName, click, saveButton, navigate } = await setup({
        areaId: null,
      });

      await typeName('Gym');
      await click(saveButton());
      fixture.destroy();
      must(sends[0]).resolve(APPLIED);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(navigate).not.toHaveBeenCalled();
      expect(handleError).not.toHaveBeenCalled();
    });
  });

  describe('a new Area', () => {
    it('shows New Area, an empty name, no hours on any day and the no-hours note', async () => {
      const { root, nameInput, rows, text, button } = await setup({ areaId: null });

      expect(root().querySelector('h1')?.textContent?.trim()).toBe('New Area');
      expect(nameInput().value).toBe('');
      for (const legend of DAYS) {
        expect(rows(legend)).toEqual([]);
      }
      expect(text()).toContain('Tasks in this Area never show in Now.');
      expect(button('Create')).toBeDefined();
      expect(button('Save')).toBeUndefined();
    });

    it('disables Create while the name is blank and shows Needs a name', async () => {
      const { saveButton, text, typeName } = await setup({ areaId: null });

      expect(must(saveButton()).disabled).toBe(true);
      expect(text()).toContain('Needs a name');

      await typeName('Gym');

      expect(must(saveButton()).disabled).toBe(false);
      expect(text()).not.toContain('Needs a name');
    });

    it('sends CreateArea with the generated id, the trimmed name, all seven days and no privacy', async () => {
      const { typeName, addHours, setRow, click, saveButton, send } = await setup({
        areaId: null,
      });

      await typeName('  Gym  ');
      await addHours('Monday');
      await addHours('Monday');
      await setRow('Monday', 0, '13:00', '14:00');
      await setRow('Monday', 1, '08:00', '09:00');
      await click(saveButton());

      expect(send).toHaveBeenCalledTimes(1);
      expect(sent(send, 0)).toStrictEqual({
        _tag: CommandTag.CreateArea,
        areaId: 'id-1',
        name: 'Gym',
        activeHours: hoursWith(EMPTY, {
          [IsoWeekday.Monday]: [
            [480, 540],
            [780, 840],
          ],
        }),
        defaultPrivacy: null,
      });
      expect(sentKey(send, 0)).toBe('id-2');
    });

    it('can create an Area without hours', async () => {
      const { typeName, click, saveButton, send } = await setup({ areaId: null });

      await typeName('Someday');
      await click(saveButton());

      expect(sent(send, 0)).toMatchObject({ _tag: CommandTag.CreateArea, activeHours: EMPTY });
    });

    it('navigates to the new Area with replaceUrl after Applied', async () => {
      const { typeName, click, saveButton, finish, navigatedTo, navigate } = await setup({
        areaId: null,
      });

      await typeName('Gym');
      await click(saveButton());

      expect(navigate).not.toHaveBeenCalled();

      await finish(0, APPLIED, domainState([PERSONAL, area('id-1', 'Gym', EMPTY)]));

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigatedTo(0).url).toBe('/settings/areas/id-1');
      expect(navigatedTo(0).extras?.replaceUrl).toBe(true);
    });

    it('retries after Failed with the same id and the same key', async () => {
      const { typeName, click, saveButton, finish, send, statusLine, navigate } = await setup({
        areaId: null,
      });

      await typeName('Gym');
      await click(saveButton());
      await finish(0, FAILED);

      expect(statusLine().textContent?.trim()).toBe('ASYS cannot reach the server. Try again.');
      expect(must(saveButton()).disabled).toBe(false);

      await click(saveButton());

      expect(send).toHaveBeenCalledTimes(2);
      expect(sent(send, 1)).toStrictEqual(sent(send, 0));
      expect(sentKey(send, 1)).toBe(sentKey(send, 0));
      expect(navigate).not.toHaveBeenCalled();
    });

    it('retries after Failed and an edited name with the same id but a new key', async () => {
      const { typeName, click, saveButton, finish, send } = await setup({ areaId: null });

      await typeName('Gym');
      await click(saveButton());
      await finish(0, FAILED);
      await typeName('Gym 2');
      await click(saveButton());

      expect(send).toHaveBeenCalledTimes(2);
      expect(sent(send, 1)).toMatchObject({
        _tag: CommandTag.CreateArea,
        areaId: 'id-1',
        name: 'Gym 2',
      });
      expect(sentKey(send, 1)).not.toBe(sentKey(send, 0));
    });

    it('retries after Failed and edited hours with the same id', async () => {
      const { typeName, addHours, click, saveButton, finish, send } = await setup({
        areaId: null,
      });

      await typeName('Gym');
      await click(saveButton());
      await finish(0, FAILED);
      await addHours('Friday');
      await click(saveButton());

      expect(sent(send, 1)).toMatchObject({
        _tag: CommandTag.CreateArea,
        areaId: 'id-1',
        activeHours: hoursWith(EMPTY, { [IsoWeekday.Friday]: [[540, 1020]] }),
      });
      expect(sentKey(send, 1)).not.toBe(sentKey(send, 0));
    });

    it('shows the generic message for a Rejected duplicate_id', async () => {
      const { typeName, click, saveButton, finish, statusLine, navigate } = await setup({
        areaId: null,
      });

      await typeName('Gym');
      await click(saveButton());
      await finish(0, rejected(RejectedReason.DuplicateId));

      expect(statusLine().textContent?.trim()).toBe('Something went wrong. Try again.');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('disables Create while the send is pending', async () => {
      const { typeName, click, saveButton, send } = await setup({ areaId: null });

      await typeName('Gym');
      await click(saveButton());

      expect(must(saveButton()).disabled).toBe(true);

      await click(saveButton());

      expect(send).toHaveBeenCalledTimes(1);
    });
  });
});
