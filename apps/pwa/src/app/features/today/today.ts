// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';

/** Placeholder for the Today screen. */
@Component({
  selector: 'app-today',
  template: `
    <h1 class="asys-page__title today__title">Today</h1>
    <p class="today__text">Today arrives in a later version.</p>
  `,
  styles: `
    .today__text {
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class Today {}
