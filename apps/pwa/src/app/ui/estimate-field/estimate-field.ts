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
import type { FormValueControl, ValidationError } from '@angular/forms/signals';
import { formatMinutes } from '@asys/domain';

let nextId = 0;

const CHIP_MINUTES: readonly number[] = [5, 15, 25, 45, 60, 120];

const MAX_MINUTES = 100000;

const OTHER_ERROR = 'Use whole minutes from 1 to 100000.';

/** Estimate chips plus an Other input, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-estimate-field',
  encapsulation: ViewEncapsulation.None,
  template: `
    <fieldset class="asys-estimate">
      <legend class="asys-estimate__legend">{{ legend() }}</legend>
      <div class="asys-estimate__chips">
        @for (chip of chips; track chip.minutes) {
          <button
            #chipButton
            type="button"
            class="asys-estimate__chip asys-estimate__chip--num"
            [disabled]="disabled()"
            [attr.aria-pressed]="value() === chip.minutes ? 'true' : 'false'"
            [attr.aria-describedby]="messageId()"
            (click)="pick(chip.minutes)"
            (blur)="touch.emit()"
          >
            {{ chip.label }}
          </button>
        }
        <button
          type="button"
          class="asys-estimate__chip"
          [disabled]="disabled()"
          [attr.aria-pressed]="otherShown() ? 'true' : 'false'"
          [attr.aria-describedby]="messageId()"
          (click)="openOther()"
          (blur)="touch.emit()"
        >
          Other
        </button>
      </div>
      @if (otherShown()) {
        <div class="asys-field asys-estimate__other" [class.asys-field--error]="showError()">
          <label class="asys-field__label" [for]="otherId">Minutes</label>
          <input
            #otherInput
            class="asys-field__input"
            type="text"
            inputmode="numeric"
            [id]="otherId"
            [value]="otherText()"
            [disabled]="disabled()"
            [attr.aria-invalid]="showError() ? 'true' : null"
            [attr.aria-describedby]="messageId()"
            (input)="typeOther(otherInput.value)"
            (blur)="touch.emit()"
          />
        </div>
      }
      @if (showError()) {
        <p class="asys-field__error" [id]="messageParagraphId">
          <span class="asys-field__error-word">Error:</span> {{ message() }}
        </p>
      } @else if (hint()) {
        <p class="asys-field__hint" [id]="messageParagraphId">{{ hint() }}</p>
      }
    </fieldset>
  `,
  styles: `
    .asys-estimate {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }

    .asys-estimate__legend {
      padding: 0;
      margin: 0 0 var(--space-2);
      color: var(--ink);
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .asys-estimate__chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .asys-estimate__chip {
      min-height: var(--tap-target);
      min-width: var(--tap-target);
      padding: var(--space-2) var(--space-3);
      background: var(--surface);
      color: var(--ink);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-md);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
      transition: background 150ms ease-out;
    }

    .asys-estimate__chip--num {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: var(--font-size-time);
      line-height: var(--line-height-time);
      font-weight: 500;
    }

    .asys-estimate__chip[aria-pressed='true'],
    .asys-estimate__chip.is-selected {
      background: var(--signal-soft);
      color: var(--on-signal-soft);
      border-color: var(--signal);
    }

    .asys-estimate__chip:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .asys-estimate__other {
      margin-top: var(--space-3);
    }

    [data-theme='drive'] .asys-estimate__chip {
      min-height: var(--tap-target-drive);
    }
  `,
})
export class EstimateField implements FormValueControl<number | null> {
  readonly value = model<number | null>(null);

  readonly legend = input<string>('Estimate');

  readonly hint = input<string | undefined>();

  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = input<boolean>(false);

  readonly disabled = input<boolean>(false);

  readonly touch = output<void>();

  protected readonly chips = CHIP_MINUTES.map((minutes) => ({
    minutes,
    label: formatMinutes(minutes),
  }));

  protected readonly otherId = `asys-estimate-${nextId}-other`;

  protected readonly messageParagraphId = `asys-estimate-${nextId++}-message`;

  private readonly injector = inject(Injector);

  private readonly chipButtons = viewChild<ElementRef<HTMLButtonElement>>('chipButton');

  private readonly otherInput = viewChild<ElementRef<HTMLInputElement>>('otherInput');

  private readonly otherOpen = signal(false);

  private readonly typed = signal('');

  private readonly localError = signal(false);

  private readonly customValue = computed(() => {
    const value = this.value();
    return value !== null && !CHIP_MINUTES.includes(value) ? value : null;
  });

  protected readonly otherShown = computed(() => this.otherOpen() || this.customValue() !== null);

  protected readonly otherText = computed(() => {
    const custom = this.customValue();
    return custom === null ? this.typed() : String(custom);
  });

  protected readonly showError = computed(
    () => this.localError() || (this.touched() && this.errors().length > 0),
  );

  protected readonly message = computed(() =>
    this.localError() ? OTHER_ERROR : (this.errors()[0]?.message ?? 'Check this value'),
  );

  protected readonly messageId = computed(() =>
    this.showError() || this.hint() ? this.messageParagraphId : null,
  );

  protected pick(minutes: number): void {
    this.value.set(minutes);
    this.otherOpen.set(false);
    this.typed.set('');
    this.localError.set(false);
  }

  protected openOther(): void {
    this.otherOpen.set(true);
    afterNextRender(() => this.otherInput()?.nativeElement.focus(), { injector: this.injector });
  }

  protected typeOther(raw: string): void {
    const text = raw.trim();
    this.otherOpen.set(true);
    this.typed.set(raw);
    if (text === '') {
      this.localError.set(false);
      this.value.set(null);
      return;
    }
    const minutes = /^\d+$/.test(text) ? Number(text) : Number.NaN;
    if (Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES) {
      this.localError.set(false);
      this.value.set(minutes);
    } else {
      this.localError.set(true);
      this.value.set(null);
    }
  }

  /** Focuses the first chip, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.chipButtons()?.nativeElement.focus(options);
  }
}
