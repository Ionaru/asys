// SPDX-License-Identifier: EUPL-1.2
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  output,
  type Signal,
  viewChild,
} from '@angular/core';
import { type FieldTree, FormField } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import {
  type DateSpec,
  type LocalDate,
  type TaskExplanation,
  TaskExplanationTag,
} from '@asys/domain';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { FieldError } from '../../atoms/field-error/field-error';
import { Icon, IconName } from '../../atoms/icon/icon';
import { Input, InputVariant } from '../../atoms/input/input';
import { SingleLine } from '../../atoms/input/single-line';
import { QuadrantLabel } from '../../atoms/quadrant-label/quadrant-label';
import { StatusBadge, StatusBadgeStatus } from '../../atoms/status-badge/status-badge';
import { SyncNote } from '../../atoms/sync-note/sync-note';
import { InlineConfirm } from '../../molecules/inline-confirm/inline-confirm';
import { LoadState } from '../../molecules/load-state/load-state';
import { Segmented } from '../../molecules/segmented/segmented';
import { areaSelectOptions } from '../../molecules/select-field/area-options';
import { ChoiceRow } from '../../organisms/choice-row/choice-row';
import { DateSpecRow } from '../../organisms/date-spec-row/date-spec-row';
import { EstimateField, EstimateLayout } from '../../organisms/estimate-field/estimate-field';
import { LogProgressForm } from '../../organisms/log-progress-form/log-progress-form';
import { Sheet } from '../../organisms/sheet/sheet';
import {
  TaskBlockers,
  type TaskBlockerRow,
  type TaskBlockerTask,
} from '../../organisms/task-blockers/task-blockers';
import { activationOf } from '../../support/activation';

let nextId = 0;

/** Lays out the Task editor: a top bar, the card with the Task's fields, its blockers and its actions. */
@Component({
  selector: 'asys-task-editor-template',
  imports: [
    Button,
    ChoiceRow,
    DateSpecRow,
    EstimateField,
    FieldError,
    FormField,
    Icon,
    InlineConfirm,
    Input,
    LoadState,
    LogProgressForm,
    NgTemplateOutlet,
    QuadrantLabel,
    RouterLink,
    Segmented,
    Sheet,
    SingleLine,
    StatusBadge,
    SyncNote,
    TaskBlockers,
  ],
  templateUrl: './task-editor-template.component.html',
  styleUrl: './task-editor-template.css',
})
export class TaskEditorTemplate {
  /** The id of the Task, the morph hook of its title. */
  readonly taskId = input.required<string>();

  /** Whether the running view transition morphs this Task's title. */
  readonly morph = input.required<boolean>();

  /** The visually hidden heading. */
  readonly heading = input.required<string>();

  /** The status line under the heading. */
  readonly statusText = input.required<string>();

  /** Whether the last save succeeded. */
  readonly saved = input.required<boolean>();

  /** Whether the last save failed. */
  readonly saveFailed = input.required<boolean>();

  /** Whether the state has loaded. */
  readonly loaded = input.required<boolean>();

  /** Whether loading the state failed. */
  readonly loadFailed = input.required<boolean>();

  /** Whether the Task is found, so the card shows. */
  readonly found = input.required<boolean>();

  /** Whether the Task is Open. */
  readonly taskOpen = input.required<boolean>();

  /** Whether the form cannot change. */
  readonly readOnly = input.required<boolean>();

  /** Whether the editor is leaving. */
  readonly leaving = input.required<boolean>();

  /** Whether the draft differs from the stored Task. */
  readonly dirty = input.required<boolean>();

  /** Whether the Task waits for the server. */
  readonly awaiting = input.required<boolean>();

  /** The Title as drafted. */
  readonly title = input.required<string>();

  /** The Notes as drafted. */
  readonly notes = input.required<string>();

  /** Whether the Title is missing. */
  readonly needsTitle = input.required<boolean>();

  /** Whether the Notes field shows. */
  readonly notesShown = input.required<boolean>();

  /** The text the Task was captured with when it differs from the Title, else null. */
  readonly capturedText = input.required<string | null>();

  /** The Importance field. */
  readonly importantField = input.required<FieldTree<boolean | null>>();

  /** The Estimate field. */
  readonly estimateField = input.required<FieldTree<number | null>>();

  /** The Area field. */
  readonly areaField = input.required<FieldTree<string>>();

  /** The Available from field. */
  readonly availableFromField = input.required<FieldTree<DateSpec | null>>();

  /** The Due field. */
  readonly dueField = input.required<FieldTree<DateSpec | null>>();

  /** The Areas to choose from, already sorted. */
  readonly areas = input.required<readonly { readonly id: string; readonly name: string }[]>();

  /** Today in the person's time zone. */
  readonly today = input.required<LocalDate>();

  /** The reason line of the draft, or null. */
  readonly explanation = input.required<TaskExplanation | null>();

  /** Whether the draft is Overdue. */
  readonly overdue = input.required<boolean>();

  /** Whether the draft is Blocked. */
  readonly blocked = input.required<boolean>();

  /** Whether Done is unavailable. */
  readonly doneBlocked = input.required<boolean>();

  /** Whether Log progress and Drop are unavailable. */
  readonly actionBlocked = input.required<boolean>();

  /** Whether Log progress can be used. */
  readonly canLogProgress = input.required<boolean>();

  /** Whether the Log progress sheet is open. */
  readonly logOpen = model<boolean>(false);

  /** The message of a failed Log progress. */
  readonly logMessage = input.required<string>();

  /** The stored Estimate while Log progress can be used, else null. */
  readonly logEstimate = input.required<number | null>();

  /** Whether the More sheet is open. */
  readonly moreOpen = model<boolean>(false);

  /** Whether the Drop confirmation shows. */
  readonly confirmingDrop = model<boolean>(false);

  /** The message of a failed Drop. */
  readonly dropMessage = input.required<string>();

  /** The title the Drop confirmation names. */
  readonly dropTitle = input.required<string>();

  /** Whether the blockers are unavailable. */
  readonly blockersBusy = input.required<boolean>();

  /** The one-line summary of the blockers. */
  readonly blockerSummary = input.required<string>();

  /** The Tasks this Task waits for. */
  readonly blockedBy = input.required<readonly TaskBlockerRow[]>();

  /** The Tasks that wait for this one. */
  readonly blocks = input.required<readonly TaskBlockerTask[]>();

  /** The Tasks offered as a blocker. */
  readonly blockerCandidates = input.required<readonly TaskBlockerTask[]>();

  /** The message of a failed Add or Remove of a blocker. */
  readonly blockerMessage = input.required<string>();

  /** Whether an Add of a blocker is in flight. */
  readonly blockerAdding = input.required<boolean>();

  /** The Find a Task text of the blockers. */
  readonly blockerFilter = model<string>('');

  /** Asks to go back. */
  readonly back = output();

  /** Asks to open the More sheet. */
  readonly more = output();

  /** Asks to mark the Task Done; true for a keyboard activation. */
  readonly done = output<boolean>();

  /** Asks to try the failed save again. */
  readonly retrySave = output();

  /** Asks to load the state again. */
  readonly retry = output();

  /** Asks to set the Title. */
  readonly titleChange = output<string>();

  /** Asks to set the Notes. */
  readonly notesChange = output<string>();

  /** Asks to commit the typed text. */
  readonly commit = output();

  /** Asks to show the Notes field. */
  readonly addNotes = output();

  /** Asks to log progress, in minutes. */
  readonly logProgress = output<number>();

  /** Asks to close the Log progress sheet from its form's Cancel. */
  readonly cancelLog = output();

  /** Asks to drop the Task. Not named `drop`, which would also catch the native drop event. */
  readonly dropTask = output();

  /** Asks to cancel the Drop confirmation. */
  readonly cancelDrop = output();

  /** Asks to make a Task a blocker; carries the blocker's Task id. */
  readonly addBlocker = output<string>();

  /** Asks to remove a blocker; carries the link id. */
  readonly removeBlocker = output<string>();

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly InputVariants = InputVariant;

  protected readonly Icons = IconName;

  protected readonly Badge = StatusBadgeStatus;

  protected readonly Tags = TaskExplanationTag;

  protected readonly Layout = EstimateLayout;

  protected readonly activationOf = activationOf;

  protected readonly titleErrorId = `task-editor-${nextId++}-title-error`;

  protected readonly areaOptions = computed(() => areaSelectOptions(this.areas()));

  private readonly headingElement = viewChild<ElementRef<HTMLElement>>('headingRef');

  private readonly notesField = viewChild<ElementRef<HTMLTextAreaElement>>('notesField');

  private readonly dropButton = viewChild('dropButton', { read: ElementRef<HTMLElement> });

  private readonly moreButton = viewChild('moreButton', { read: ElementRef<HTMLElement> });

  private readonly logButton = viewChild('logButton', { read: ElementRef<HTMLElement> });

  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');

  private readonly footer = viewChild<ElementRef<HTMLElement>>('footer');

  private readonly blockers = viewChild(TaskBlockers);

  /** The sticky top bar, for the page to measure. */
  readonly barElement: Signal<HTMLElement | undefined> = computed(() => this.bar()?.nativeElement);

  /** The sticky footer, for the page to measure; undefined while it is not rendered. */
  readonly footerElement: Signal<HTMLElement | undefined> = computed(
    () => this.footer()?.nativeElement,
  );

  /** Moves focus to the heading. */
  focusHeading(): void {
    this.headingElement()?.nativeElement.focus();
  }

  /** Moves focus to the Notes field, or the heading when it is not rendered. */
  focusNotes(): void {
    this.#focus(this.notesField()?.nativeElement);
  }

  /** Moves focus to the Log progress button, or the heading when it is not rendered. */
  focusLogButton(): void {
    this.#focus(this.logButton()?.nativeElement);
  }

  /** Moves focus to the More actions button, or the heading when it is not rendered. */
  focusMoreButton(): void {
    this.#focus(this.moreButton()?.nativeElement);
  }

  /** Moves focus to the Drop button, or the heading when it is not rendered. */
  focusDropButton(): void {
    this.#focus(this.dropButton()?.nativeElement);
  }

  /** Moves focus to the Remove button of a blocker, if the section is rendered. */
  focusBlockerRemove(index: number): void {
    this.blockers()?.focusRemove(index);
  }

  /** Moves focus to the Find a Task field of the blockers, if rendered. */
  focusBlockerFilter(): void {
    this.blockers()?.focusFilter();
  }

  protected notesInput(event: Event): void {
    this.notesChange.emit((event.target as HTMLTextAreaElement).value);
  }

  #focus(element: HTMLElement | undefined): void {
    (element ?? this.headingElement()?.nativeElement)?.focus();
  }
}
