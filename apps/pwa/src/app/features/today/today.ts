// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';

/** Placeholder for the Today screen. */
@Component({
  selector: 'app-today',
  template: `
    <h1 class="today__title">Today</h1>
    <p class="today__text">Today arrives in a later version.</p>
  `,
  styles: `
    .today__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .today__text {
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class Today {}
