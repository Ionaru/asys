// SPDX-License-Identifier: EUPL-1.2
import { Component, inject } from '@angular/core';

import { DataStore } from '../../core/data/data-store';

/** Placeholder for the Inbox screen. */
@Component({
  selector: 'app-inbox',
  template: `
    <h1 class="inbox__title">Inbox</h1>
    @if (dataStore.state() !== null) {
      <p class="inbox__text">
        @switch (dataStore.inboxCount()) {
          @case (0) {
            Nothing waits here.
          }
          @case (1) {
            1 Task or Review item waits here.
          }
          @default {
            {{ dataStore.inboxCount() }} Tasks and Review items wait here.
          }
        }
      </p>
    }
    <p class="inbox__text">Triage arrives in a later version.</p>
  `,
  styles: `
    .inbox__title {
      margin: 0 0 var(--space-3);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
    }

    .inbox__text {
      margin: 0 0 var(--space-2);
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class Inbox {
  protected readonly dataStore = inject(DataStore);
}
