// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  type ActiveHours,
  type Area,
  type AreaPatch,
  type Command,
  CommandTag,
  type CreateArea,
  intervalFromTimes,
  isLocalTime,
  IsoWeekday,
  type MinuteInterval,
  timeInputValue,
} from '@asys/domain';

import { CommandOutcomeTag, type CommandOutcome } from '../../core/api/data-api';
import { CommandAttempts } from '../../core/data/command-attempts';
import { DataStore, SyncStatus } from '../../core/data/data-store';
import { type DraftFields, followStore, settleSaved } from '../../core/data/draft-follow';
import { outcomeMessage } from '../../core/data/outcome-message';
import { Ids } from '../../core/platform/ids';
import { Button, ButtonSize, ButtonVariant } from '../../ui/button/button';
import { LoadState } from '../../ui/load-state/load-state';
import { SyncNote } from '../../ui/sync-note/sync-note';
import { TextField } from '../../ui/text-field/text-field';

/** One row of Active hours as the time inputs hold it. */
interface TimeRow {
  readonly start: string;
  readonly end: string;
}

/** The editable fields of an Area; `days` holds the rows of Monday to Sunday. */
interface AreaDraft {
  readonly name: string;
  readonly days: readonly (readonly TimeRow[])[];
}

/** Which time of a row an input edits. */
enum RowEdge {
  Start = 'start',
  End = 'end',
}

/** A row's two time inputs, in order. */
const EDGES = [
  { edge: RowEdge.Start, label: 'From' },
  { edge: RowEdge.End, label: 'To' },
] as const;

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

const EMPTY_DRAFT: AreaDraft = { name: '', days: WEEKDAYS.map(() => []) };

let nextId = 0;

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
  keys: ['name', 'days'],
  same: (key, a, b) =>
    key === 'name' ? a.name.trim() === b.name.trim() : sameRows(a.days, b.days),
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
    ...(hoursChanged ? { activeHours: hours } : {}),
  };
};

/** Edits an Area's name and its Active hours per weekday, or creates a new Area. */
@Component({
  selector: 'asys-area-editor',
  imports: [Button, LoadState, RouterLink, SyncNote, TextField],
  providers: [CommandAttempts],
  templateUrl: './area-editor.component.html',
  styleUrl: './area-editor.css',
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

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly Status = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly edges = EDGES;

  readonly #idPrefix = `asys-area-editor-${nextId++}`;

  protected readonly statusLine = signal('');

  /** Whether a Save or Create send is in flight. */
  readonly #sending = signal(false);

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

  /** Whether this Area, or the one being created, waits for the server after an applied command. */
  protected readonly awaiting = computed(() => {
    const id = this.areaId() ?? this.#pendingCreate()?.areaId ?? null;

    return id !== null && this.dataStore.awaitingSync().has(id);
  });

  protected readonly canSubmit = computed(
    () =>
      !this.needsName() &&
      !this.#hasErrors() &&
      !this.#sending() &&
      !this.awaiting() &&
      (this.areaId() === null ||
        (this.#baseline() !== null && Object.keys(this.#patch()).length > 0)),
  );

  constructor() {
    effect(() => {
      const area = this.area();

      untracked(() => this.#follow(area));
    });
  }

  /** The id of a row's time input. */
  protected inputId(day: number, row: number, edge: RowEdge): string {
    return `${this.#idPrefix}-${day}-${row}-${edge}`;
  }

  /** The id of a row's error line. */
  protected errorId(day: number, row: number): string {
    return `${this.#idPrefix}-${day}-${row}-error`;
  }

  /** The id of a day's overlap line. */
  protected overlapId(day: number): string {
    return `${this.#idPrefix}-${day}-overlap`;
  }

  /** The id of a row's Remove button. */
  protected removeId(day: number, row: number): string {
    return `${this.#idPrefix}-${day}-${row}-remove`;
  }

  /** The id of a day's Add hours button. */
  protected addId(day: number): string {
    return `${this.#idPrefix}-${day}-add`;
  }

  /** The error lines that describe a row's inputs, or null when there are none. */
  protected describedBy(
    day: number,
    row: number,
    rowError: boolean,
    overlap: boolean,
  ): string | null {
    const ids = [
      ...(rowError ? [this.errorId(day, row)] : []),
      ...(overlap ? [this.overlapId(day)] : []),
    ];

    return ids.length === 0 ? null : ids.join(' ');
  }

  protected setName(name: string): void {
    this.draft.update((draft) => ({ ...draft, name }));
  }

  protected setTime(day: number, row: number, edge: RowEdge, value: string): void {
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
        const target =
          remaining === 0
            ? this.addId(day)
            : this.removeId(day, row < remaining ? row : remaining - 1);

        this.#host.nativeElement.querySelector<HTMLElement>(`#${target}`)?.focus();
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
      pending !== null && pending.name === name && sameHours(pending.activeHours, activeHours)
        ? pending
        : {
            _tag: CommandTag.CreateArea,
            areaId: pending?.areaId ?? this.#ids.next(),
            name,
            activeHours,
            defaultPrivacy: null,
          };

    this.#pendingCreate.set(command);

    const outcome = await this.#runAction(command);

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
    const outcome = await this.#runAction({
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

  /** Sends a Save or Create through its attempt and marks it pending meanwhile. */
  async #runAction(command: Command): Promise<CommandOutcome> {
    this.statusLine.set('');
    this.#sending.set(true);

    try {
      return await this.#attempts.send(command);
    } finally {
      this.#sending.set(false);
    }
  }
}
