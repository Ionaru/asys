// SPDX-License-Identifier: EUPL-1.2
import { Component, ViewEncapsulation } from '@angular/core';

/** The note under a change that applied but whose follow-up sync failed, until a later sync succeeds. */
@Component({
  selector: 'p[asys-sync-note]',
  template: 'Saved. Waiting for the server.',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-sync-note' },
  styles: `
    .asys-sync-note {
      margin: 0;
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      color: var(--ink-muted);
    }
  `,
})
export class SyncNote {}
