// SPDX-License-Identifier: EUPL-1.2
import { Component, ViewEncapsulation } from '@angular/core';

/**
 * The large Buttons of a screen's main actions, sharing one sticky row like a fill ButtonGroup. It sits
 * on the bottom nav where there is one, and on the Undo bar where the nav is hidden. Open quick add
 * sits on the same bars, so the row rides above it.
 */
@Component({
  selector: 'footer[asys-action-bar]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'asys-action-bar' },
  styles: `
    .asys-action-bar {
      position: sticky;
      bottom: calc(
        var(--shell-nav-height, 0px) + var(--shell-undo-height, 0px) +
          var(--shell-quickadd-height, 0px) + env(safe-area-inset-bottom)
      );
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-inline: calc(var(--space-4) * -1);
      padding: var(--space-3) var(--space-4) var(--space-4);
      background: var(--surface);
      border-top: 1px solid var(--line);
      box-shadow: 0 env(safe-area-inset-bottom) 0 0 var(--surface);

      & > .asys-button--large {
        flex: 1 1 0;
        min-width: min-content;
        padding-inline: var(--space-3);
        white-space: nowrap;
      }
    }
  `,
})
export class ActionBar {}
