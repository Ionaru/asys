// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, inject, input, ViewEncapsulation } from '@angular/core';

/**
 * The box that draws the border, padding and focus ring of a one-line field (see `SingleLine`): a textarea scrolls its
 * text into its own padding, so the box carries them and the textarea inside is borderless.
 */
@Component({
  selector: 'asys-input-box',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-input-box',
    '[class.asys-input-box--pill]': 'pill()',
    '(mousedown)': 'press($event)',
  },
})
export class InputBox {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Draws the box as a pill, as the quick-add field is. */
  readonly pill = input<boolean>(false);

  /** A press on the box around the textarea, outside the textarea itself, focuses it and keeps the keyboard up. */
  protected press(event: MouseEvent): void {
    if (event.target === this.#host.nativeElement) {
      event.preventDefault();
      this.#host.nativeElement.querySelector('textarea')?.focus();
    }
  }
}
