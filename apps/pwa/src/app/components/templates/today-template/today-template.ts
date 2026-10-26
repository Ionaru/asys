// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';

import { Text } from '../../atoms/text/text';

/** Lays out the Today screen, a placeholder until Today arrives. */
@Component({
  selector: 'asys-today-template',
  imports: [Text],
  template: `
    <h1 class="asys-page__title today__title">Today</h1>
    <p asys-text class="today__text">Today arrives in a later version.</p>
  `,
  styles: `
    .today__text {
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class TodayTemplate {}
