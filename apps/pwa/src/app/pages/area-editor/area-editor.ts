// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  type ActiveHours,
  type Area,
  type AreaPatch,
  CommandTag,
  type CreateArea,
  intervalFromTimes,
  isLocalTime,
  IsoWeekday,
  type MinuteInterval,
  type Palette,
  timeInputValue,
} from '@asys/domain';

import { CommandOutcomeTag } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { type DraftFields, followStore, settleSaved } from '../../core/data/draft-follow';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Ids } from '../../core/platform/ids';
import {
  type AreaEditorTimeChange,
  AreaEditorTemplate,
} from '../../components/templates/area-editor-template/area-editor-template';

/** One row of Active hours as the time inputs hold it. */
interface TimeRow {
  readonly start: string;
  readonly end: string;
}

/** The editable fields of an Area; `days` holds the rows of Monday to Sunday. */
interface AreaDraft {
  readonly name: string;
  readonly palette: Palette | null;
  readonly days: readonly (readonly TimeRow[])[];
}

const WEEKDAYS = [
  { weekday: IsoWeekday.Monday, name: 'Monday' },
  { weekday: IsoWeekday.Tuesday, name: 'Tuesday' },
  { weekday: IsoWeekday.Wednesday, name: 'Wednesday' },
  { weekday: IsoWeekday.Thursday, name: 'Thursday' },
  { weekday: IsoWeekday.Friday, name: 'Friday' },
  { weekday: IsoWeekday.Saturday, name: 'Saturday' },
  { weekday: IsoWeekday.Sunday, name: 'Sunday' },
] as const;

const NEW_ROW: TimeRow = { start: '09:00', end: '17:00' };

const TIME_LENGTH = 5;

const EMPTY_DRAFT: AreaDraft = { name: '', palette: null, days: WEEKDAYS.map(() => []) };

const sortIntervals = (intervals: readonly MinuteInterval[]): readonly MinuteInterval[] =>
  [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

const rowsOf = (intervals: readonly MinuteInterval[]): readonly TimeRow[] =>
  sortIntervals(intervals).map(([start, end]) => ({
    start: timeInputValue(start),
    end: timeInputValue(end),
  }));

/** The draft of a stored Area, its hours sorted by start. */
const draftOf = (area: Area): AreaDraft => ({
  name: area.name,
  palette: area.palette,
  days: WEEKDAYS.map(({ weekday }) => rowsOf(area.activeHours[weekday])),
});

const rowInterval = (row: TimeRow): MinuteInterval | undefined =>
  intervalFromTimes(row.start, row.end);

/** The error a row shows, or null when it gives an interval. */
const rowError = (row: TimeRow): string | null => {
  if (!isLocalTime(row.start) || !isLocalTime(row.end)) {
    return 'Enter a time';
  }

  return rowInterval(row) === undefined ? 'End after the start' : null;
};

const validIntervals = (rows: readonly TimeRow[]): readonly MinuteInterval[] =>
  sortIntervals(
    rows.map(rowInterval).filter((interval): interval is MinuteInterval => interval !== undefined),
  );

/** Whether the day's valid intervals, sorted by start, overlap; touching intervals do not. */
const dayOverlaps = (rows: readonly TimeRow[]): boolean =>
  validIntervals(rows).some((interval, index, sorted) => {
    const previous = sorted[index - 1];

    return previous !== undefined && interval[0] < previous[1];
  });

/** The Active hours of the rows, each day sorted by start; null when a row gives no interval. */
const hoursOf = (days: readonly (readonly TimeRow[])[]): ActiveHours | null => {
  if (days.some((rows) => rows.some((row) => rowInterval(row) === undefined))) {
    return null;
  }

  const day = (index: number): readonly MinuteInterval[] => validIntervals(days[index] ?? []);

  return {
    [IsoWeekday.Monday]: day(0),
    [IsoWeekday.Tuesday]: day(1),
    [IsoWeekday.Wednesday]: day(2),
    [IsoWeekday.Thursday]: day(3),
    [IsoWeekday.Friday]: day(4),
    [IsoWeekday.Saturday]: day(5),
    [IsoWeekday.Sunday]: day(6),
  };
};

const sameIntervals = (a: readonly MinuteInterval[], b: readonly MinuteInterval[]): boolean =>
  a.length === b.length &&
  a.every(([start, end], index) => start === b[index][0] && end === b[index][1]);

/** Whether two Active hours hold the same intervals, compared day by day and interval by interval. */
const sameHours = (a: ActiveHours, b: ActiveHours): boolean =>
  WEEKDAYS.every(({ weekday }) =>
    sameIntervals(sortIntervals(a[weekday]), sortIntervals(b[weekday])),
  );

const sameRows = (
  a: readonly (readonly TimeRow[])[],
  b: readonly (readonly TimeRow[])[],
): boolean => {
  const hoursA = hoursOf(a);
  const hoursB = hoursOf(b);

  if (hoursA !== null && hoursB !== null) {
    return sameHours(hoursA, hoursB);
  }

  return (
    a.length === b.length &&
    a.every(
      (rows, day) =>
        rows.length === b[day].length &&
        rows.every(
          (row, index) => row.start === b[day][index].start && row.end === b[day][index].end,
        ),
    )
  );
};

/** The fields of an Area draft that follow the store. */
const AREA_DRAFT_FIELDS: DraftFields<AreaDraft> = {
  keys: ['name', 'palette', 'days'],
  same: (key, a, b) => {
    switch (key) {
      case 'name':
        return a.name.trim() === b.name.trim();
      case 'palette':
        return a.palette === b.palette;
      case 'days':
        return sameRows(a.days, b.days);
    }
  },
};

/** The fields of `draft` that differ from `baseline`, as an UpdateArea patch. */
const buildAreaPatch = (baseline: AreaDraft, draft: AreaDraft): AreaPatch => {
  const name = draft.name.trim();
  const hours = hoursOf(draft.days);
  const baselineHours = hoursOf(baseline.days);
  const hoursChanged =
    hours !== null && (baselineHours === null || !sameHours(hours, baselineHours));

  return {
    ...(name === baseline.name ? {} : { name }),
    ...(draft.palette === baseline.palette ? {} : { palette: draft.palette }),
    ...(hoursChanged ? { activeHours: hours } : {}),
  };
};

/** Edits an Area's name, palette and Active hours per weekday, or creates a new Area. */
@Component({
  selector: 'asys-area-editor',
  imports: [AreaEditorTemplate],
  providers: [CommandAttempts],
  template: `
    <asys-area-editor-template
      [heading]="heading()"
      [statusLine]="statusLine()"
      [loaded]="dataStore.state() !== null"
      [loadFailed]="dataStore.status() === Status.Failed"
      [found]="areaId() === null || area() !== undefined"
      [isNew]="areaId() === null"
      [name]="draft().name"
      [palette]="draft().palette"
      [days]="dayViews()"
      [noHours]="noHours()"
      [needsName]="needsName()"
      [canSubmit]="canSubmit()"
      [awaiting]="awaiting()"
      (retry)="dataStore.refresh()"
      (nameChange)="setName($event)"
      (paletteChange)="setPalette($event)"
      (timeChange)="setTime($event)"
      (addRow)="addRow($event)"
      (removeRow)="removeRow($event.day, $event.row)"
      (save)="submit()"
    />
  `,
})
export class AreaEditor {
  /** The Area's id; null means a new Area. */
  readonly areaId = input.required<string | null>();

  protected readonly dataStore = inject(DataStore);

  readonly #ids = inject(Ids);

  readonly #attempts = inject(CommandAttempts);

  readonly #router = inject(Router);

  readonly #injector = inject(Injector);

  readonly #destroyRef = inject(DestroyRef);

  protected readonly Status = SyncStatus;

  private readonly template = viewChild(AreaEditorTemplate);

  protected readonly statusLine = signal('');

  /** The CreateArea still being tried after Failed, so a retry reuses its areaId. */
  readonly #pendingCreate = signal<CreateArea | null>(null);

  readonly #baseline = signal<AreaDraft | null>(null);

  protected readonly draft = signal<AreaDraft>(EMPTY_DRAFT);

  protected readonly area = computed<Area | undefined>(() => {
    const id = this.areaId();

    return id === null ? undefined : this.dataStore.state()?.areas.find((area) => area.id === id);
  });

  protected readonly heading = computed(() =>
    this.areaId() === null ? 'New Area' : (this.area()?.name ?? 'Area'),
  );

  /** Each weekday with its rows, their errors and whether its hours overlap. */
  protected readonly dayViews = computed(() =>
    WEEKDAYS.map(({ name }, index) => {
      const rows = this.draft().days[index] ?? [];

      return {
        index,
        name,
        rows: rows.map((row) => ({ ...row, error: rowError(row) })),
        overlap: dayOverlaps(rows),
      };
    }),
  );

  readonly #hasErrors = computed(() =>
    this.dayViews().some((day) => day.overlap || day.rows.some((row) => row.error !== null)),
  );

  protected readonly needsName = computed(() => this.draft().name.trim() === '');

  protected readonly noHours = computed(() => this.draft().days.every((rows) => rows.length === 0));

  readonly #patch = computed(() => {
    const baseline = this.#baseline();

    return baseline === null ? {} : buildAreaPatch(baseline, this.draft());
  });

  /** The id of this Area, or of the one being created; null before a new Area has an id. */
  readonly #subject = computed(() => this.areaId() ?? this.#pendingCreate()?.areaId ?? null);

  /** Whether this Area, or the one being created, waits for the server after an applied command. */
  protected readonly awaiting = computed(() => {
    const id = this.#subject();

    return id !== null && this.dataStore.awaitingSync().has(id);
  });

  /** Whether a Save or Create send is in flight for this Area, or it waits for the server. */
  readonly #busy = computed(() => {
    const id = this.#subject();

    return id !== null && this.#attempts.busy(id);
  });

  protected readonly canSubmit = computed(
    () =>
      !this.needsName() &&
      !this.#hasErrors() &&
      !this.#busy() &&
      (this.areaId() === null ||
        (this.#baseline() !== null && Object.keys(this.#patch()).length > 0)),
  );

  constructor() {
    effect(() => {
      const area = this.area();

      untracked(() => this.#follow(area));
    });
  }

  protected setName(name: string): void {
    this.draft.update((draft) => ({ ...draft, name }));
  }

  protected setPalette(palette: Palette | null): void {
    this.draft.update((draft) => ({ ...draft, palette }));
  }

  protected setTime({ day, row, edge, value }: AreaEditorTimeChange): void {
    const time = value.slice(0, TIME_LENGTH);

    this.#updateDay(day, (rows) =>
      rows.map((current, index) => (index === row ? { ...current, [edge]: time } : current)),
    );
  }

  protected addRow(day: number): void {
    this.#updateDay(day, (rows) => [...rows, NEW_ROW]);
  }

  protected removeRow(day: number, row: number): void {
    const remaining = (this.draft().days[day]?.length ?? 1) - 1;

    this.#updateDay(day, (rows) => rows.filter((_, index) => index !== row));
    afterNextRender(
      () => {
        if (remaining === 0) {
          this.template()?.focusAdd(day);
        } else {
          this.template()?.focusRemove(day, row < remaining ? row : remaining - 1);
        }
      },
      { injector: this.#injector },
    );
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    if (this.areaId() === null) {
      await this.#create();
    } else {
      await this.#save();
    }
  }

  async #create(): Promise<void> {
    const draft = this.draft();
    const activeHours = hoursOf(draft.days);

    if (activeHours === null) {
      return;
    }

    const name = draft.name.trim();
    const pending = this.#pendingCreate();
    const command: CreateArea =
      pending !== null &&
      pending.name === name &&
      (pending.palette ?? null) === draft.palette &&
      sameHours(pending.activeHours, activeHours)
        ? pending
        : {
            _tag: CommandTag.CreateArea,
            areaId: pending?.areaId ?? this.#ids.next(),
            name,
            activeHours,
            defaultPrivacy: null,
            palette: draft.palette,
          };

    this.#pendingCreate.set(command);
    this.statusLine.set('');

    const outcome = await this.#attempts.send(command);

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag !== CommandOutcomeTag.Failed) {
      this.#pendingCreate.set(null);
    }

    if (outcome._tag === CommandOutcomeTag.Applied) {
      void this.#router.navigateByUrl(`/settings/areas/${command.areaId}`, { replaceUrl: true });
      return;
    }

    this.statusLine.set(outcomeMessage(outcome) ?? '');
  }

  async #save(): Promise<void> {
    const areaId = this.areaId();
    const baseline = this.#baseline();

    if (areaId === null || baseline === null) {
      return;
    }

    const sent = this.draft();

    this.statusLine.set('');

    const outcome = await this.#attempts.send({
      _tag: CommandTag.UpdateArea,
      areaId,
      patch: buildAreaPatch(baseline, sent),
    });

    if (this.#destroyRef.destroyed) {
      return;
    }

    if (outcome._tag !== CommandOutcomeTag.Applied) {
      this.statusLine.set(outcomeMessage(outcome) ?? '');
      return;
    }

    const area = this.area();

    if (area !== undefined) {
      const stored = draftOf(area);

      this.#baseline.set(stored);

      if (!this.dataStore.awaitingSync().has(area.id)) {
        this.draft.set(settleSaved(AREA_DRAFT_FIELDS, sent, this.draft(), stored));
      }
    }

    this.statusLine.set('Area saved.');
  }

  /** Sets the baseline when the Area first appears, then follows the store field by field. */
  #follow(area: Area | undefined): void {
    if (area === undefined) {
      return;
    }

    const stored = draftOf(area);
    const baseline = this.#baseline();

    if (baseline === null) {
      this.#baseline.set(stored);
      this.draft.set(stored);
      return;
    }

    const next = followStore(AREA_DRAFT_FIELDS, baseline, this.draft(), stored);

    this.#baseline.set(next.baseline);
    this.draft.set(next.draft);
  }

  #updateDay(day: number, change: (rows: readonly TimeRow[]) => readonly TimeRow[]): void {
    this.draft.update((draft) => ({
      ...draft,
      days: draft.days.map((rows, index) => (index === day ? change(rows) : rows)),
    }));
  }
}
