// SPDX-License-Identifier: EUPL-1.2
import { Component, input, output, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../../atoms/icon/icon';
import type { SelectOption } from '../../molecules/select-field/select-field';

/** A list of options as field rows: the chosen one is pressed and shows a check. */
@Component({
  selector: 'ul[asys-option-list]',
  imports: [Icon],
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-option-list' },
  template: `
    @for (option of options(); track option.value) {
      <li>
        <button
          type="button"
          class="asys-field-row"
          [attr.aria-pressed]="option.value === value() ? 'true' : 'false'"
          (click)="choose.emit(option.value)"
        >
          @if (icon(); as name) {
            <asys-icon [name]="name" />
          }
          <span class="asys-field-row__label">{{ option.label }}</span>
          <asys-icon class="asys-option-list__check" [name]="Check" />
        </button>
      </li>
    }
  `,
  styles: `
    .asys-option-list {
      margin: 0 calc(var(--space-4) * -1);
      padding: 0;
      list-style: none;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);

      & > li + li {
        border-top: 1px solid var(--line);
      }
    }

    .asys-option-list__check {
      visibility: hidden;
      color: var(--signal);
    }

    .asys-option-list .asys-field-row[aria-pressed='true'] {
      font-weight: 600;

      & .asys-option-list__check {
        visibility: visible;
      }
    }
  `,
})
export class OptionList {
  protected readonly Check = IconName.Check;

  readonly options = input.required<readonly SelectOption[]>();

  readonly value = input<string>('');

  readonly icon = input<IconName | null>(null);

  /** The picked option's value. */
  readonly choose = output<string>();
}
