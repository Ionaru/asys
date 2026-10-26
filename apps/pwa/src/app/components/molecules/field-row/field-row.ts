// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, inject, input, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../../atoms/icon/icon';

/**
 * A row button: a label, its value and a chevron to the sheet that changes it. The parent binds the
 * native `(click)`, `(blur)`, `[disabled]` and `[attr.aria-describedby]` on the host. The rules live in
 * `src/styles.css`, because a sheet's option rows draw the same class.
 */
@Component({
  selector: 'button[asys-field-row]',
  imports: [Icon],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-field-row',
    type: 'button',
    'aria-haspopup': 'dialog',
  },
  template: `<span class="asys-field-row__label">{{ label() }}</span
    ><span class="asys-field-row__value" [class.asys-field-row__value--set]="set()">
      @if (icon(); as name) {
        <asys-icon [name]="name" />
      }
      {{ value() }}</span
    ><asys-icon class="asys-field-row__chevron" [name]="Chevron" />`,
})
export class FieldRow {
  readonly label = input.required<string>();

  /** The shown value, or the field's none word. */
  readonly value = input.required<string>();

  /** True once something is chosen. */
  readonly set = input(false);

  readonly icon = input<IconName | null>(null);

  protected readonly Chevron = IconName.ChevronRight;

  readonly #host = inject<ElementRef<HTMLButtonElement>>(ElementRef);

  /** Focuses the row button. */
  focus(options?: FocusOptions): void {
    this.#host.nativeElement.focus(options);
  }
}
