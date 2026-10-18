// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, model, viewChild, ViewEncapsulation } from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

import { FieldControl } from '../field-control/field-control';
import { FieldError } from '../field-error/field-error';
import { Input } from '../input/input';
import { InputBox } from '../input-box/input-box';
import { Label } from '../label/label';
import { SingleLine } from '../single-line/single-line';

let nextId = 0;

/**
 * A single or multi line text field, usable as a Signal Forms custom control. A single line one is a one-row textarea
 * (see `ui/single-line`), unless `autofill` asks for a text input.
 */
@Component({
  selector: 'asys-text-field',
  imports: [FieldError, Input, InputBox, Label, SingleLine],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './text-field.component.html',
})
export class TextField extends FieldControl implements FormValueControl<string> {
  readonly value = model<string>('');

  readonly label = input.required<string>();

  readonly placeholder = input<string | undefined>();

  readonly multiline = input<boolean>(false);

  readonly autocomplete = input<string | undefined>();

  /**
   * Keeps a single line field a text input, for the few fields where the browser's autofill helps: a name, or a code a
   * password manager may hold. On Android that brings Chrome's passwords, cards and addresses bar above the keyboard.
   */
  readonly autofill = input<boolean>(false);

  readonly spellcheck = input<boolean>(true);

  readonly autocapitalize = input<string | undefined>();

  readonly inputmode = input<string | undefined>();

  protected readonly controlId = `asys-text-field-${nextId}`;

  protected override readonly messageParagraphId = `asys-text-field-${nextId++}-message`;

  private readonly control =
    viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('control');

  /** Focuses the native control, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.control()?.nativeElement.focus(options);
  }
}
