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

/** A single or multi line text field, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-text-field',
  encapsulation: ViewEncapsulation.None,
  template: `
    <div
      class="asys-field"
      [class.asys-field--error]="showError()"
      [class.asys-field--disabled]="disabled()"
    >
      <label class="asys-field__label" [for]="controlId">{{ label() }}</label>
      @if (multiline()) {
        <textarea
          #control
          class="asys-field__input"
          [id]="controlId"
          [value]="value()"
          [disabled]="disabled()"
          [attr.placeholder]="placeholder()"
          [attr.autocomplete]="autocomplete()"
          [attr.autocapitalize]="autocapitalize()"
          [attr.spellcheck]="spellcheck() ? null : 'false'"
          [attr.aria-invalid]="showError() ? 'true' : null"
          [attr.aria-describedby]="messageId()"
          (input)="value.set(control.value)"
          (blur)="touch.emit()"
        ></textarea>
      } @else {
        <input
          #control
          class="asys-field__input"
          type="text"
          [id]="controlId"
          [value]="value()"
          [disabled]="disabled()"
          [attr.placeholder]="placeholder()"
          [attr.autocomplete]="autocomplete()"
          [attr.autocapitalize]="autocapitalize()"
          [attr.spellcheck]="spellcheck() ? null : 'false'"
          [attr.aria-invalid]="showError() ? 'true' : null"
          [attr.aria-describedby]="messageId()"
          (input)="value.set(control.value)"
          (blur)="touch.emit()"
        />
      }
      @if (showError()) {
        <p class="asys-field__error" [id]="messageParagraphId">
          <span class="asys-field__error-word">Error:</span> {{ message() }}
        </p>
      } @else if (hint()) {
        <p class="asys-field__hint" [id]="messageParagraphId">{{ hint() }}</p>
      }
    </div>
  `,
  styles: `
    .asys-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .asys-field__label {
      color: var(--ink);
      font-family: var(--font-sans);
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .asys-field__input {
      display: block;
      width: 100%;
      min-height: var(--tap-target);
      padding: var(--space-2) var(--space-3);
      background: var(--surface);
      color: var(--ink);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-md);
      font-family: var(--font-sans);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
      font-weight: 400;
    }

    .asys-field__input::placeholder {
      color: var(--ink-muted);
      opacity: 1;
    }

    textarea.asys-field__input,
    .asys-field__input--multiline {
      min-height: 96px;
      padding: var(--space-3);
      resize: vertical;
    }

    .asys-field__hint,
    .asys-field__error {
      margin: 0;
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
    }

    .asys-field__hint {
      color: var(--ink-muted);
    }

    .asys-field__error {
      color: var(--danger);
    }

    .asys-field__error-word {
      font-weight: 700;
    }

    .asys-field--error .asys-field__input,
    .asys-field__input[aria-invalid='true'] {
      border-width: 2px;
      border-color: var(--danger);
      padding-left: calc(var(--space-3) - 1px);
      padding-right: calc(var(--space-3) - 1px);
    }

    .asys-field--disabled,
    .asys-field.is-disabled {
      opacity: 0.4;
    }

    .asys-field__input:disabled {
      cursor: not-allowed;
    }

    [data-theme='drive'] .asys-field__input {
      min-height: var(--tap-target-drive);
    }

    [data-theme='drive'] textarea.asys-field__input,
    [data-theme='drive'] .asys-field__input--multiline {
      min-height: 96px;
    }
  `,
})
export class TextField implements FormValueControl<string> {
  readonly value = model<string>('');

  readonly label = input.required<string>();

  readonly hint = input<string | undefined>();

  readonly placeholder = input<string | undefined>();

  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([]);

  readonly touched = input<boolean>(false);

  readonly disabled = input<boolean>(false);

  readonly multiline = input<boolean>(false);

  readonly autocomplete = input<string | undefined>();

  readonly spellcheck = input<boolean>(true);

  readonly autocapitalize = input<string | undefined>();

  readonly touch = output<void>();

  protected readonly controlId = `asys-text-field-${nextId}`;

  protected readonly messageParagraphId = `asys-text-field-${nextId++}-message`;

  private readonly control =
    viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('control');

  protected readonly showError = computed(() => this.touched() && this.errors().length > 0);

  protected readonly message = computed(() => this.errors()[0]?.message ?? 'Check this value');

  protected readonly messageId = computed(() =>
    this.showError() || this.hint() ? this.messageParagraphId : null,
  );

  /** Focuses the native control, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}
