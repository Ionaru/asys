// SPDX-License-Identifier: EUPL-1.2
import { Component, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../icon/icon';

/** The error under a field: a warning icon, the word "Error:", then the message. */
@Component({
  selector: 'p[asys-field-error]',
  imports: [Icon],
  template: `
    <asys-icon [name]="IconName.TriangleExclamation" />
    <span class="asys-field__error-word">Error:</span>{{ ' ' }}<ng-content />
  `,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-field__error' },
  styles: `
    .asys-field__error .asys-icon svg {
      margin-inline-end: var(--space-1);
    }
  `,
})
export class FieldError {
  protected readonly IconName = IconName;
}
