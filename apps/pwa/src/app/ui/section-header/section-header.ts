// SPDX-License-Identifier: EUPL-1.2
import { Component, input, model, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../icon/icon';

let nextId = 0;

/**
 * The muted card of a set-aside list such as Waiting: an icon, the title and count, a line saying what matters
 * next, and a chevron. The rows are projected into the body, which hides when collapsed. Bind the title as a
 * property, not a static attribute, so it does not become the native tooltip of the host.
 */
@Component({
  selector: 'asys-section-header',
  imports: [Icon],
  encapsulation: ViewEncapsulation.None,
  template: `
    <section class="asys-section" [attr.aria-label]="title()">
      <button
        class="asys-section-header"
        type="button"
        [attr.aria-expanded]="expanded() ? 'true' : 'false'"
        [attr.aria-controls]="bodyId"
        (click)="expanded.set(!expanded())"
      >
        <asys-icon class="asys-section-header__icon" [name]="icon()" />
        <span class="asys-section-header__text">
          <span class="asys-section-header__title"
            >{{ title() }}
            @if (count() > 0) {
              <span class="asys-num asys-section-header__count">{{ count() }}</span>
            }
          </span>
          @if (summary(); as text) {
            <span class="asys-section-header__summary">{{ text }}</span>
          }
        </span>
        <asys-icon class="asys-section-header__chevron" [name]="ChevronDown" />
      </button>
      <div class="asys-section__body" [id]="bodyId" [hidden]="!expanded()">
        <ng-content />
      </div>
    </section>
  `,
  styleUrl: './section-header.css',
})
export class SectionHeader {
  protected readonly ChevronDown = IconName.ChevronDown;

  protected readonly bodyId = `asys-section-body-${nextId++}`;

  /** The Icon that marks the section, such as the hourglass for Waiting. */
  readonly icon = input.required<IconName>();

  readonly title = input.required<string>();

  readonly count = input<number>(0);

  /** The one fact that matters while the section is closed; none shows when null or empty. */
  readonly summary = input<string | null>(null);

  readonly expanded = model<boolean>(false);
}
