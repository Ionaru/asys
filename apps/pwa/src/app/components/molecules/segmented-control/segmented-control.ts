// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, model, viewChild, ViewEncapsulation } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

import { FieldControl } from '../../support/field-control';
import { FieldError } from '../../atoms/field-error/field-error';
import { Label } from '../../atoms/label/label';
import { Segment } from '../../atoms/segment/segment';

let nextId = 0;

/** A two-way choice shown as two buttons, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-segmented-control',
  imports: [FieldError, Label, Segment],
  encapsulation: ViewEncapsulation.None,
  template: `
    <fieldset class="asys-fieldset-reset asys-segmented-control">
      <legend asys-label class="asys-segmented-control__legend">{{ legend() }}</legend>
      <div class="asys-segmented-control__options">
        <button
          asys-segment
          #first
          [pressed]="value() === true"
          [disabled]="disabled()"
          [attr.aria-describedby]="messageId()"
          (click)="value.set(true)"
          (blur)="touch.emit()"
        >
          {{ trueLabel() }}
        </button>
        <button
          asys-segment
          [pressed]="value() === false"
          [disabled]="disabled()"
          [attr.aria-describedby]="messageId()"
          (click)="value.set(false)"
          (blur)="touch.emit()"
        >
          {{ falseLabel() }}
        </button>
      </div>
      @if (showError()) {
        <p asys-field-error [id]="messageParagraphId">{{ message() }}</p>
      } @else if (hint()) {
        <p class="asys-field__hint" [id]="messageParagraphId">{{ hint() }}</p>
      }
    </fieldset>
  `,
  styleUrl: './segmented-control.css',
})
export class SegmentedControl extends FieldControl implements FormValueControl<boolean | null> {
  readonly value = model<boolean | null>(null);

  readonly legend = input.required<string>();

  readonly trueLabel = input.required<string>();

  readonly falseLabel = input.required<string>();

  protected override readonly messageParagraphId = `asys-segmented-control-${nextId++}-message`;

  private readonly first = viewChild('first', { read: ElementRef<HTMLButtonElement> });

  /** Focuses the first option, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.first()?.nativeElement.focus(options);
  }
}
