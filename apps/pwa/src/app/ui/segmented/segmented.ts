// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, model, viewChild, ViewEncapsulation } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

import { FieldControl } from '../field-control/field-control';

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
  styleUrl: './segmented.css',
})
export class Segmented extends FieldControl implements FormValueControl<boolean | null> {
  readonly value = model<boolean | null>(null);

  readonly legend = input.required<string>();

  readonly trueLabel = input.required<string>();

  readonly falseLabel = input.required<string>();

  protected override readonly messageParagraphId = `asys-segmented-${nextId++}-message`;

  private readonly first = viewChild<ElementRef<HTMLButtonElement>>('first');

  /** Focuses the first option, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.first()?.nativeElement.focus(options);
  }
}
