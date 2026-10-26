// SPDX-License-Identifier: EUPL-1.2
import { Component, input, model, ViewEncapsulation } from '@angular/core';

import { IconName } from '../../atoms/icon/icon';
import { SectionHeader } from '../../molecules/section-header/section-header';

let nextId = 0;

/**
 * The muted card of a set-aside list such as Waiting: a SectionHeader and a body that hides when collapsed.
 * The rows are projected into the body. Bind the title as a property, never a static attribute, or it becomes
 * the native tooltip of the host.
 */
@Component({
  selector: 'section[asys-collapsible-section]',
  imports: [SectionHeader],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-collapsible-section',
    '[attr.aria-label]': 'title()',
  },
  template: `
    <button
      asys-section-header
      [icon]="icon()"
      [title]="title()"
      [count]="count()"
      [summary]="summary()"
      [expanded]="expanded()"
      [controls]="bodyId"
      (click)="expanded.set(!expanded())"
    ></button>
    <div class="asys-collapsible-section__body" [id]="bodyId" [hidden]="!expanded()">
      <ng-content />
    </div>
  `,
  styles: `
    .asys-collapsible-section {
      background: var(--sunken);
      border-radius: var(--radius-lg);
      overflow: hidden;
      color: var(--ink);

      & .asys-section-header {
        border-radius: 0;
      }
    }

    .asys-collapsible-section__body {
      border-top: 1px solid var(--line);
    }
  `,
})
export class CollapsibleSection {
  protected readonly bodyId = `asys-collapsible-section-body-${nextId++}`;

  /** The Icon that marks the section, such as the hourglass for Waiting. */
  readonly icon = input.required<IconName>();

  readonly title = input.required<string>();

  readonly count = input<number>(0);

  /** The one fact that matters while the section is closed; none shows when null or empty. */
  readonly summary = input<string | null>(null);

  readonly expanded = model<boolean>(false);
}
