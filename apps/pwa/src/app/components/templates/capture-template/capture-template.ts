// SPDX-License-Identifier: EUPL-1.2
import { Component, input, model, output, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { Link } from '../../atoms/link/link';
import { TextField } from '../../molecules/text-field/text-field';

/** Lays out the share target: a Title to capture, and what the last capture did. */
@Component({
  selector: 'asys-capture-template',
  imports: [RouterLink, Button, Link, TextField],
  templateUrl: './capture-template.component.html',
  styleUrl: './capture-template.css',
})
export class CaptureTemplate {
  /** The Title being captured. */
  readonly title = model.required<string>();

  /** Whether Add may send the capture. */
  readonly canAdd = input.required<boolean>();

  /** The Title just captured, if the last capture was applied. */
  readonly confirmation = input.required<string | null>();

  /** What went wrong with the last capture, if anything. */
  readonly message = input.required<string | null>();

  /** Asks to capture the Title into the Inbox. */
  readonly add = output();

  protected readonly Variant = ButtonVariant;

  private readonly titleField = viewChild(TextField);

  /** Moves focus to the Title, ready for the next capture. */
  focusTitle(): void {
    this.titleField()?.focus();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.add.emit();
  }
}
