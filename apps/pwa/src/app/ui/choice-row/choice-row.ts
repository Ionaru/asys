// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { FormValueControl } from '@angular/forms/signals';

import { FieldControl } from '../../components/support/field-control';
import { FieldError } from '../../components/atoms/field-error/field-error';
import { Icon, IconName } from '../../components/atoms/icon/icon';
import type { SelectOption } from '../../components/molecules/select-field/select-field';
import { Sheet } from '../sheet/sheet';

let nextId = 0;

/** A single choice as a row: it shows the chosen option and opens a sheet to change it. */
@Component({
  selector: 'asys-choice-row',
  imports: [FieldError, Icon, Sheet],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './choice-row.component.html',
  styles: `
    .asys-choice-row__options {
      margin: 0 calc(var(--space-4) * -1);
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }

    .asys-choice-row__options > li + li {
      border-top: 1px solid var(--line);
    }

    .asys-choice-row__check {
      visibility: hidden;
      color: var(--signal);
    }

    .asys-choice-row__option[aria-pressed='true'] {
      font-weight: 600;
    }

    .asys-choice-row__option[aria-pressed='true'] .asys-choice-row__check {
      visibility: visible;
    }
  `,
})
export class ChoiceRow extends FieldControl implements FormValueControl<string> {
  protected readonly Chevron = IconName.ChevronRight;

  protected readonly Check = IconName.Check;

  readonly value = model<string>('');

  readonly label = input.required<string>();

  readonly options = input.required<readonly SelectOption[]>();

  readonly icon = input<IconName | null>(null);

  protected override readonly messageParagraphId = `asys-choice-row-${nextId++}-message`;

  protected readonly sheetOpen = signal(false);

  protected readonly chosenLabel = computed(
    () => this.options().find((option) => option.value === this.value())?.label ?? '',
  );

  private readonly row = viewChild<ElementRef<HTMLButtonElement>>('row');

  /** Focuses the row button, called by Signal Forms' `focusBoundControl()`. */
  focus(options?: FocusOptions): void {
    this.row()?.nativeElement.focus(options);
  }

  protected choose(value: string): void {
    this.value.set(value);
    this.sheetOpen.set(false);
    this.touch.emit();
  }
}
