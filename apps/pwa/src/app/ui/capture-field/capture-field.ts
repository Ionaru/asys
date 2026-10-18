// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import { Button, ButtonVariant } from '../button/button';
import { InputBox } from '../input-box/input-box';
import { SingleLine } from '../single-line/single-line';

let nextId = 0;

/**
 * The capture row: a pill field and an Add submit button, with a hint under it. It owns no form and emits nothing: the
 * organism around it handles the form's submit, and extra buttons project into the row after Add.
 */
@Component({
  selector: 'asys-capture-field',
  imports: [Button, InputBox, SingleLine],
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-capture-field' },
  template: `
    <div class="asys-capture-field__row">
      <label class="asys-visually-hidden" [for]="inputId">{{ label() }}</label>
      <asys-input-box [pill]="true">
        <textarea
          #field
          asys-single-line
          autocomplete="off"
          enterkeyhint="send"
          [id]="inputId"
          [attr.placeholder]="placeholder()"
          [value]="value()"
          (lineChange)="value.set($event)"
        ></textarea>
      </asys-input-box>
      <button
        asys-button
        type="submit"
        [variant]="Variants.Primary"
        [attr.aria-disabled]="blank() ? 'true' : null"
        [class.is-disabled]="blank()"
        (mousedown)="$event.preventDefault()"
      >
        Add
      </button>
      <ng-content />
    </div>
    @if (hint(); as text) {
      <p class="asys-capture-field__hint">{{ text }}</p>
    }
  `,
  styleUrl: './capture-field.css',
})
export class CaptureField {
  protected readonly Variants = ButtonVariant;

  protected readonly inputId = `asys-capture-field-${nextId++}-input`;

  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');

  readonly value = model<string>('');

  readonly label = input<string>('Capture a Task');

  readonly placeholder = input<string>('Capture a Task');

  readonly hint = input<string | undefined>();

  protected readonly blank = computed(() => this.value().trim() === '');

  /** Moves focus to the field. */
  focus(): void {
    this.field().nativeElement.focus();
  }
}
