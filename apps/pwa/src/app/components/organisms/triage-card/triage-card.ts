// SPDX-License-Identifier: EUPL-1.2
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { DateSpec, LocalDate, Quadrant } from '@asys/domain';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { FieldError } from '../../atoms/field-error/field-error';
import { IconName } from '../../atoms/icon/icon';
import { Input, InputVariant } from '../../atoms/input/input';
import { SingleLine } from '../../atoms/input/single-line';
import { LabelNeed } from '../../atoms/label/label';
import { QuadrantLabel } from '../../atoms/quadrant-label/quadrant-label';
import {
  SegmentedControl,
  SegmentedControlLayout,
} from '../../molecules/segmented-control/segmented-control';
import { areaSelectOptions } from '../../molecules/select-field/area-options';
import { IMPORTANCE_OPTIONS } from '../../support/importance-options';
import { ChoiceRow } from '../choice-row/choice-row';
import { DateField } from '../date-field/date-field';
import { EstimateLayout, EstimatePicker } from '../estimate-picker/estimate-picker';

/** The card's values; areaId '' means No Area. */
export interface TriageDraft {
  readonly title: string;
  readonly notes: string;
  readonly important: boolean | null;
  readonly estimateMinutes: number | null;
  readonly areaId: string;
  readonly availableFrom: DateSpec | null;
  readonly due: DateSpec | null;
}

/** An Area the card can offer. */
export interface AreaChoice {
  readonly id: string;
  readonly name: string;
}

/** The reason line once Importance and an Estimate are chosen: what Now would say. */
export interface TriageReason {
  readonly quadrant: Quadrant;
  readonly text: string;
}

let nextId = 0;

/**
 * The card that triages one Inbox Task: its Title, Notes, Importance, Estimate, Area and dates, then the reason
 * Now would give. It holds no actions; the screen pins Drop and Triage under it.
 */
@Component({
  selector: 'asys-triage-card',
  imports: [
    Button,
    ChoiceRow,
    DateField,
    EstimatePicker,
    FieldError,
    Input,
    QuadrantLabel,
    SegmentedControl,
    SingleLine,
  ],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './triage-card.component.html',
  styleUrl: './triage-card.css',
})
export class TriageCard {
  readonly #injector = inject(Injector);

  private readonly section = viewChild<ElementRef<HTMLElement>>('section');

  private readonly moreButton = viewChild('moreButton', { read: ElementRef<HTMLElement> });

  private readonly notesField = viewChild<ElementRef<HTMLTextAreaElement>>('notesField');

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly Icons = IconName;

  protected readonly InputVariants = InputVariant;

  protected readonly SegmentLayout = SegmentedControlLayout;

  protected readonly EstimateLayout = EstimateLayout;

  protected readonly importanceOptions = IMPORTANCE_OPTIONS;

  protected readonly titleErrorId = `asys-triage-${nextId++}-title-error`;

  /** The Task's id: the shell's focus marker, and the Title's morph hook. */
  readonly taskId = input.required<string>();

  /** The card's place in this visit's run of Tasks. */
  readonly position = input.required<number>();

  readonly total = input.required<number>();

  /** What was captured, shown under Notes while it matters; null hides it. */
  readonly capturedText = input<string | null>(null);

  readonly areas = input<readonly AreaChoice[]>([]);

  readonly today = input.required<LocalDate>();

  /** How often Triage was tapped while Importance or Estimate was missing. */
  readonly attempts = input<number>(0);

  /** What Now would say once Importance and an Estimate are chosen. */
  readonly reason = input<TriageReason | null>(null);

  /** Whether the card's Task is being sent: every control is disabled. */
  readonly busy = input<boolean>(false);

  readonly draft = model.required<TriageDraft>();

  /** Emits when the person asks for more actions on this Task. */
  readonly more = output();

  /** Whether the Notes field was asked for or typed in, so clearing the text keeps it. */
  readonly #notesAsked = signal(false);

  protected readonly notesShown = computed(() => this.#notesAsked() || this.draft().notes !== '');

  protected readonly needsTitle = computed(() => this.draft().title.trim() === '');

  protected readonly areaOptions = computed(() => areaSelectOptions(this.areas()));

  protected readonly importanceNeed = computed(() => this.#need(this.draft().important !== null));

  protected readonly estimateNeed = computed(() =>
    this.#need(this.draft().estimateMinutes !== null),
  );

  protected readonly hintText = computed(() => {
    const { important, estimateMinutes } = this.draft();

    if (important === null && estimateMinutes === null) {
      return 'Pick an Importance and an Estimate to triage.';
    }

    if (important === null) {
      return 'Pick an Importance to triage.';
    }

    return estimateMinutes === null ? 'Pick an Estimate to triage.' : '';
  });

  /** Moves focus to the card, never to a field, so no phone keyboard opens. */
  focusCard(): void {
    this.section()?.nativeElement.focus();
  }

  /** Moves focus to the More button. */
  focusMore(): void {
    this.moreButton()?.nativeElement.focus();
  }

  protected edit<K extends keyof TriageDraft>(field: K, value: TriageDraft[K]): void {
    this.draft.set({ ...this.draft(), [field]: value });
  }

  protected typeNotes(event: Event): void {
    this.#notesAsked.set(true);
    this.edit('notes', (event.target as HTMLTextAreaElement).value);
  }

  protected addNotes(): void {
    this.#notesAsked.set(true);
    afterNextRender(() => this.notesField()?.nativeElement.focus(), { injector: this.#injector });
  }

  #need(chosen: boolean): LabelNeed {
    if (chosen) {
      return LabelNeed.None;
    }

    return this.attempts() > 0 ? LabelNeed.Missing : LabelNeed.Needed;
  }
}
