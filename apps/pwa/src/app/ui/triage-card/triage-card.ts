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

import { Button, ButtonSize, ButtonVariant } from '../button/button';
import { EstimateField } from '../estimate-field/estimate-field';
import { InlineConfirm } from '../inline-confirm/inline-confirm';
import { Segmented } from '../segmented/segmented';
import { SelectField, SelectOption } from '../select-field/select-field';

/** The Triage choices for one Inbox Task. */
export interface TriageDraft {
  readonly important: boolean | null;
  readonly estimateMinutes: number | null;
  readonly areaId: string | null;
}

/** An Area the card can offer. */
export interface AreaChoice {
  readonly id: string;
  readonly name: string;
}

let nextId = 0;

/** The card that triages one Inbox Task: Importance, Estimate and Area. */
@Component({
  selector: 'asys-triage-card',
  imports: [Button, Segmented, EstimateField, SelectField, InlineConfirm],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './triage-card.component.html',
  styleUrl: './triage-card.css',
})
export class TriageCard {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly injector = inject(Injector);

  private readonly select = viewChild(SelectField);

  protected readonly Variants = ButtonVariant;

  protected readonly Sizes = ButtonSize;

  protected readonly reasonId = `asys-triage-${nextId++}-reason`;

  protected readonly changingArea = signal(false);

  protected readonly confirmingDrop = signal(false);

  readonly position = input.required<number>();

  readonly total = input.required<number>();

  readonly title = input.required<string>();

  readonly rawText = input<string>('');

  readonly areas = input<readonly AreaChoice[]>([]);

  readonly draft = model.required<TriageDraft>();

  readonly busy = input<boolean>(false);

  readonly canLater = input<boolean>(true);

  readonly triage = output<TriageDraft>();

  readonly dropTask = output<void>();

  readonly later = output<void>();

  readonly edit = output<void>();

  protected readonly showRaw = computed(() => {
    const raw = this.rawText().trim();

    return raw !== '' && raw !== this.title();
  });

  protected readonly areaName = computed(() => {
    const id = this.draft().areaId;

    return this.areas().find((area) => area.id === id)?.name ?? 'No Area';
  });

  protected readonly areaOptions = computed<readonly SelectOption[]>(() => [
    { value: '', label: 'No Area' },
    ...this.areas().map((area) => ({ value: area.id, label: area.name })),
  ]);

  protected readonly incomplete = computed(() => this.reason() !== null);

  protected readonly reason = computed(() => {
    const missingImportance = this.draft().important === null;
    const missingEstimate = this.draft().estimateMinutes === null;

    if (missingImportance && missingEstimate) {
      return 'Needs an Importance and an Estimate';
    }

    if (missingImportance) {
      return 'Needs an Importance';
    }

    return missingEstimate ? 'Needs an Estimate' : null;
  });

  protected readonly dropMessage = computed(() => `Drop “${this.title()}”? This cannot be undone.`);

  /** Moves focus to the title. */
  focusTitle(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.asys-triage__title')?.focus();
  }

  protected changeArea(): void {
    this.changingArea.set(true);
    afterNextRender(() => this.select()?.focus(), { injector: this.injector });
  }

  protected cancelDrop(): void {
    this.confirmingDrop.set(false);
    this.host.nativeElement.querySelector<HTMLElement>('.asys-triage__drop')?.focus();
  }
}
