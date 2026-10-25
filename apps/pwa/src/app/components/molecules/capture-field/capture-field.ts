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

import { Button, ButtonVariant } from '../../atoms/button/button';
import { InputBox } from '../../atoms/input/input-box';
import { SingleLine } from '../../atoms/input/single-line';

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
  templateUrl: './capture-field.component.html',
  styles: `
    .asys-capture-field {
      display: block;
    }

    .asys-capture-field__row {
      display: flex;
      align-items: center;
      gap: var(--space-2);

      /* The field takes the room the buttons leave. */
      & > .asys-input-box {
        flex: 1 1 0;
      }

      /* The root's overflow-wrap would let a squeezed button break its label mid-word, so the field gives way instead. */
      & > .asys-button {
        flex: none;
      }
    }

    .asys-capture-field__hint {
      margin: var(--space-2) 0 0;
    }
  `,
})
export class CaptureField {
  protected readonly Variants = ButtonVariant;

  protected readonly inputId = `asys-capture-field-${nextId}-input`;

  protected readonly hintId = `asys-capture-field-${nextId++}-hint`;

  private readonly field = viewChild.required<ElementRef<HTMLTextAreaElement>>('field');

  private readonly box = viewChild.required(InputBox, { read: ElementRef<HTMLElement> });

  readonly value = model<string>('');

  readonly label = input<string>('Capture a Task');

  readonly placeholder = input<string>('Capture a Task');

  readonly hint = input<string | undefined>();

  protected readonly blank = computed(() => this.value().trim() === '');

  /** Moves focus to the field. */
  focus(): void {
    this.field().nativeElement.focus();
  }

  /** Where the field's box is on screen. */
  fieldRect(): DOMRect {
    return this.box().nativeElement.getBoundingClientRect();
  }
}
