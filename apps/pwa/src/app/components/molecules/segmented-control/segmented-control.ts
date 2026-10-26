// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, model, viewChild, ViewEncapsulation } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

import { FieldControl } from '../../support/field-control';
import { FieldError } from '../../atoms/field-error/field-error';
import { Label } from '../../atoms/label/label';
import { Segment } from '../../atoms/segment/segment';

let nextId = 0;

/** How a SegmentedControl lays out its Segments. */
export enum SegmentedControlLayout {
  Wrap = 'wrap',
  Fill = 'fill',
}

/** One choice of a SegmentedControl. */
export interface SegmentOption<T> {
  readonly value: T;
  readonly label: string;
}

/** A legend over one Segment per option, usable as a Signal Forms custom control. */
@Component({
  selector: 'asys-segmented-control',
  imports: [FieldError, Label, Segment],
  encapsulation: ViewEncapsulation.None,
  template: `
    <fieldset
      class="asys-fieldset-reset asys-segmented-control"
      [class.asys-segmented-control--fill]="layout() === Layout.Fill"
    >
      <legend asys-label>{{ legend() }}</legend>
      <div class="asys-segmented-control__options">
        @for (option of options(); track option.value) {
          <button
            asys-segment
            #segment
            [pressed]="value() === option.value"
            [disabled]="disabled()"
            [attr.aria-describedby]="messageId()"
            (click)="value.set(option.value)"
            (blur)="touch.emit()"
          >
            {{ option.label }}
          </button>
        }
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
export class SegmentedControl<T extends string | number | boolean = string>
  extends FieldControl
  implements FormValueControl<T | null>
{
  readonly value = model<T | null>(null);

  readonly legend = input.required<string>();

  readonly options = input.required<readonly SegmentOption<T>[]>();

  readonly layout = input<SegmentedControlLayout>(SegmentedControlLayout.Wrap);

  protected readonly Layout = SegmentedControlLayout;

  protected override readonly messageParagraphId = `asys-segmented-control-${nextId++}-message`;

  private readonly first = viewChild('segment', { read: ElementRef<HTMLButtonElement> });

  /** Focuses the first option, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.first()?.nativeElement.focus(options);
  }
}
