// SPDX-License-Identifier: EUPL-1.2
import { Directive, input } from '@angular/core';

/** How an input is drawn: the bordered field, the borderless Task title, or a notes area that grows with its text. */
export enum InputVariant {
  Default = 'default',
  Title = 'title',
  Grow = 'grow',
}

/** The design system input, applied to an `input`, a `textarea` or a `select` as `asys-input`. */
@Directive({
  selector: 'input[asys-input], textarea[asys-input], select[asys-input]',
  host: {
    class: 'asys-input',
    '[class.asys-input--title]': 'variant() === Variant.Title',
    '[class.asys-input--grow]': 'variant() === Variant.Grow',
  },
})
export class Input {
  protected readonly Variant = InputVariant;

  readonly variant = input<InputVariant>(InputVariant.Default);
}
