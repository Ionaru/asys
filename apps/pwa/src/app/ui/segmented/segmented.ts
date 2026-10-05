// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  output,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { FormValueControl, ValidationError } from '@angular/forms/signals';

let nextId = 0;

/** A two-way choice shown as two buttons, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-segmented',
  encapsulation: ViewEncapsulation.None,
  template: `
    <fieldset class="asys-segmented">
      <legend class="asys-segmented__legend">{{ legend() }}</legend>
      <div class="asys-segmented__options">
        <button
          #first
          type="button"
          class="asys-segmented__option"
          [disabled]="disabled()"
          [attr.aria-pressed]="value() === true ? 'true' : 'false'"
          [attr.aria-describedby]="messageId()"
          (click)="value.set(true)"
          (blur)="touch.emit()"
        >
          {{ trueLabel() }}
        </button>
        <button
          type="button"
          class="asys-segmented__option"
          [disabled]="disabled()"
          [attr.aria-pressed]="value() === false ? 'true' : 'false'"
          [attr.aria-describedby]="messageId()"
          (click)="value.set(false)"
          (blur)="touch.emit()"
        >
          {{ falseLabel() }}
        </button>
      </div>
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
    .asys-segmented {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }

    .asys-segmented__legend {
      padding: 0;
      margin: 0 0 var(--space-2);
      color: var(--ink);
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .asys-segmented__options {
      display: flex;
      gap: var(--space-2);
    }

    .asys-segmented__option {
      flex: 1 1 0;
      min-height: var(--tap-target);
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
      transition: background var(--duration-quick) var(--ease-out);
    }

    .asys-segmented__option[aria-pressed='true'],
    .asys-segmented__option.is-selected {
      background: var(--signal-soft);
      color: var(--on-signal-soft);
      border-color: var(--signal);
    }

    .asys-segmented__option:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    [data-theme='drive'] .asys-segmented__option {
      min-height: var(--tap-target-drive);
    }
  `,
})
export class Segmented implements FormValueControl<boolean | null> {
  readonly value = model<boolean | null>(null);

  readonly legend = input.required<string>();

  readonly trueLabel = input.required<string>();

  readonly falseLabel = input.required<string>();

  readonly hint = input<string | undefined>();

  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = input<boolean>(false);

  readonly disabled = input<boolean>(false);

  readonly touch = output<void>();

  protected readonly messageParagraphId = `asys-segmented-${nextId++}-message`;

  private readonly first = viewChild<ElementRef<HTMLButtonElement>>('first');

  protected readonly showError = computed(() => this.touched() && this.errors().length > 0);

  protected readonly message = computed(() => this.errors()[0]?.message ?? 'Check this value');

  protected readonly messageId = computed(() =>
    this.showError() || this.hint() ? this.messageParagraphId : null,
  );

  /** Focuses the first option, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.first()?.nativeElement.focus(options);
  }
}
