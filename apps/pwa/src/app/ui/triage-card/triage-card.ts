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
  template: `
    <article class="asys-triage">
      <p class="asys-triage__progress">{{ position() }} of {{ total() }}</p>
      <h2 class="asys-triage__title" tabindex="-1">{{ title() }}</h2>
      @if (showRaw()) {
        <p class="asys-triage__raw">{{ rawText() }}</p>
      }
      <asys-segmented
        legend="Importance"
        trueLabel="Important"
        falseLabel="Not important"
        [disabled]="busy()"
        [value]="draft().important"
        (valueChange)="draft.set({ ...draft(), important: $event })"
      />
      <asys-estimate-field
        legend="Estimate"
        [disabled]="busy()"
        [value]="draft().estimateMinutes"
        (valueChange)="draft.set({ ...draft(), estimateMinutes: $event })"
      />
      <div class="asys-triage__area">
        <span>
          Area: <strong>{{ areaName() }}</strong>
        </span>
        @if (!changingArea()) {
          <button
            asys-button
            type="button"
            [variant]="Variants.Quiet"
            [size]="Sizes.Small"
            [disabled]="busy()"
            (click)="changeArea()"
          >
            Change
          </button>
        }
      </div>
      @if (changingArea()) {
        <asys-select-field
          label="Area"
          [options]="areaOptions()"
          [disabled]="busy()"
          [value]="draft().areaId ?? ''"
          (valueChange)="draft.set({ ...draft(), areaId: $event === '' ? null : $event })"
        />
      }
      <div class="asys-triage__footer">
        <button
          asys-button
          type="button"
          [variant]="Variants.Primary"
          [disabled]="incomplete() || busy()"
          [attr.aria-describedby]="reason() === null ? null : reasonId"
          (click)="triage.emit(draft())"
        >
          Triage
        </button>
        @if (canLater()) {
          <button asys-button type="button" [variant]="Variants.Quiet" (click)="later.emit()">
            Later
          </button>
        }
        <button asys-button type="button" [variant]="Variants.Quiet" (click)="edit.emit()">
          Edit
        </button>
        <button
          asys-button
          type="button"
          class="asys-triage__drop"
          [variant]="Variants.Quiet"
          [disabled]="busy()"
          (click)="confirmingDrop.set(true)"
        >
          Drop
        </button>
        @if (reason(); as text) {
          <p class="asys-triage__reason" [id]="reasonId">{{ text }}</p>
        }
      </div>
      @if (confirmingDrop()) {
        <asys-inline-confirm
          [message]="dropMessage()"
          confirmLabel="Drop"
          [busy]="busy()"
          (confirm)="dropTask.emit()"
          (cancel)="cancelDrop()"
        />
      }
    </article>
  `,
  styles: `
    .asys-triage {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      color: var(--ink);
    }

    .asys-triage__progress {
      margin: 0 0 var(--space-2);
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
    }

    .asys-triage__title {
      margin: 0;
      font-size: var(--font-size-display);
      line-height: var(--line-height-display);
      font-weight: 700;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
    }

    .asys-triage__raw {
      margin: var(--space-2) 0 0;
      padding: var(--space-3);
      background: var(--sunken);
      border-radius: var(--radius-md);
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
      white-space: pre-wrap;
    }

    .asys-triage .asys-segmented,
    .asys-triage .asys-estimate,
    .asys-triage asys-select-field {
      display: block;
      margin-top: var(--space-4);
    }

    .asys-triage__area {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-4);
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
    }

    .asys-triage__area strong {
      color: var(--ink);
      font-weight: 600;
    }

    .asys-triage__footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
      margin-top: var(--space-4);
      padding-top: var(--space-4);
      border-top: 1px solid var(--line);
    }

    .asys-triage__reason {
      flex: 1 1 100%;
      order: 3;
      margin: 0;
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
    }
  `,
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

  protected readonly incomplete = computed(
    () => this.draft().important === null || this.draft().estimateMinutes === null,
  );

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
