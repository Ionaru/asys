// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Palette } from '@asys/domain';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { FieldError } from '../../atoms/field-error/field-error';
import { Input } from '../../atoms/input/input';
import { Label } from '../../atoms/label/label';
import { SyncNote } from '../../atoms/sync-note/sync-note';
import { LoadState } from '../../molecules/load-state/load-state';
import { type SelectOption, SelectField } from '../../molecules/select-field/select-field';
import { TextField } from '../../molecules/text-field/text-field';

/** Which time of a row an input edits. */
export enum RowEdge {
  Start = 'start',
  End = 'end',
}

/** One row of Active hours as the time inputs show it, with its error or null. */
export interface AreaEditorRow {
  readonly start: string;
  readonly end: string;
  readonly error: string | null;
}

/** One weekday of the editor: its index 0 (Monday) to 6 (Sunday), name, rows and whether its hours overlap. */
export interface AreaEditorDay {
  readonly index: number;
  readonly name: string;
  readonly rows: readonly AreaEditorRow[];
  readonly overlap: boolean;
}

/** A typed time: the day index, the row index, which edge, and the input's raw value. */
export interface AreaEditorTimeChange {
  readonly day: number;
  readonly row: number;
  readonly edge: RowEdge;
  readonly value: string;
}

/** A row by its day index and row index. */
export interface AreaEditorRowRef {
  readonly day: number;
  readonly row: number;
}

/** A row's two time inputs, in order. */
const EDGES = [
  { edge: RowEdge.Start, label: 'From' },
  { edge: RowEdge.End, label: 'To' },
] as const;

/** The Palette select's choices; the empty value is the default look (null). */
const PALETTE_OPTIONS: readonly SelectOption[] = [
  { value: '', label: 'Default look (Evergreen)' },
  { value: Palette.Evergreen, label: 'Evergreen' },
  { value: Palette.Harbour, label: 'Harbour' },
  { value: Palette.Moss, label: 'Moss' },
  { value: Palette.Graphite, label: 'Graphite' },
];

let nextId = 0;

/** Lays out the form of an Area: name, palette and Active hours per weekday. */
@Component({
  selector: 'asys-area-editor-template',
  imports: [
    Button,
    FieldError,
    Input,
    Label,
    LoadState,
    RouterLink,
    SelectField,
    SyncNote,
    TextField,
  ],
  templateUrl: './area-editor-template.component.html',
  styleUrl: './area-editor-template.css',
})
export class AreaEditorTemplate {
  /** The heading. */
  readonly heading = input.required<string>();

  /** The status line under the heading. */
  readonly statusLine = input.required<string>();

  /** Whether the state has loaded. */
  readonly loaded = input.required<boolean>();

  /** Whether loading the state failed. */
  readonly loadFailed = input.required<boolean>();

  /** Whether the form shows: a new Area, or the Area exists. */
  readonly found = input.required<boolean>();

  /** Whether the Area is new. */
  readonly isNew = input.required<boolean>();

  /** The name. */
  readonly name = input.required<string>();

  /** The Palette, or null for the default look. */
  readonly palette = input.required<Palette | null>();

  /** The weekdays, Monday first. */
  readonly days = input.required<readonly AreaEditorDay[]>();

  /** Whether no weekday has hours. */
  readonly noHours = input.required<boolean>();

  /** Whether the name is missing. */
  readonly needsName = input.required<boolean>();

  /** Whether the submit button is enabled. */
  readonly canSubmit = input.required<boolean>();

  /** Whether the Area waits for the server. */
  readonly awaiting = input.required<boolean>();

  /** Asks to load the state again. */
  readonly retry = output();

  /** Asks to set the name. */
  readonly nameChange = output<string>();

  /** Asks to set the Palette. */
  readonly paletteChange = output<Palette | null>();

  /** Asks to set a typed time. */
  readonly timeChange = output<AreaEditorTimeChange>();

  /** Asks to add a row to the day with this index. */
  readonly addRow = output<number>();

  /** Asks to remove a row. */
  readonly removeRow = output<AreaEditorRowRef>();

  /** Asks to save or create. */
  readonly save = output();

  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly #idPrefix = `asys-area-editor-${nextId++}`;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly edges = EDGES;

  protected readonly paletteOptions = PALETTE_OPTIONS;

  /** Moves focus to the Add hours button of the day, if rendered. */
  focusAdd(day: number): void {
    this.#focus(this.addId(day));
  }

  /** Moves focus to the Remove button of the row, if rendered. */
  focusRemove(day: number, row: number): void {
    this.#focus(this.removeId(day, row));
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

  protected setPalette(value: string): void {
    const palette = Object.values<string>(Palette).find((candidate) => candidate === value);

    this.paletteChange.emit(palette === undefined ? null : (palette as Palette));
  }

  #focus(id: string): void {
    this.#host.nativeElement.querySelector<HTMLElement>(`#${id}`)?.focus();
  }
}
