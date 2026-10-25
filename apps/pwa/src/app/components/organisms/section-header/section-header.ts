// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, model, output, ViewEncapsulation } from '@angular/core';

import { Count, CountVariant } from '../../atoms/count/count';
import { Icon, IconName } from '../../atoms/icon/icon';

/** What a click on the header does: expand its body, or ask the parent to open something (a sheet). */
export enum SectionHeaderAction {
  Expand = 'expand',
  Open = 'open',
}

let nextId = 0;

/**
 * The muted card of a set-aside list such as Waiting: an icon, the title and count, a line saying what matters
 * next, and a chevron. The rows are projected into the body, which hides when collapsed. Bind the title as a
 * property, not a static attribute, so it does not become the native tooltip of the host.
 */
@Component({
  selector: 'asys-section-header',
  imports: [Icon, Count],
  encapsulation: ViewEncapsulation.None,
  template: `
    <section class="asys-section" [attr.aria-label]="title()">
      <button
        class="asys-section-header"
        type="button"
        [attr.aria-expanded]="isOpen() ? null : expanded() ? 'true' : 'false'"
        [attr.aria-controls]="isOpen() ? null : bodyId"
        [attr.aria-haspopup]="isOpen() ? 'dialog' : null"
        (click)="click()"
      >
        <asys-icon class="asys-section-header__icon" [name]="icon()" />
        <span class="asys-section-header__text">
          <span class="asys-section-header__title"
            >{{ title() }}
            @if (count() > 0) {
              <span
                asys-count
                class="asys-section-header__count"
                [variant]="CountVariant.Quiet"
                [value]="count()"
              ></span>
            }
          </span>
          @if (summary(); as text) {
            <span class="asys-section-header__summary">{{ text }}</span>
          }
        </span>
        <asys-icon class="asys-section-header__chevron" [name]="trailingIcon()" />
      </button>
      @if (!isOpen()) {
        <div class="asys-section__body" [id]="bodyId" [hidden]="!expanded()">
          <ng-content />
        </div>
      }
    </section>
  `,
  styleUrl: './section-header.css',
})
export class SectionHeader {
  protected readonly CountVariant = CountVariant;

  protected readonly bodyId = `asys-section-body-${nextId++}`;

  /** The Icon that marks the section, such as the hourglass for Waiting. */
  readonly icon = input.required<IconName>();

  readonly title = input.required<string>();

  readonly count = input<number>(0);

  /** The one fact that matters while the section is closed; none shows when null or empty. */
  readonly summary = input<string | null>(null);

  readonly expanded = model<boolean>(false);

  /** Expand toggles the body; Open emits `activate` and renders no body. */
  readonly action = input<SectionHeaderAction>(SectionHeaderAction.Expand);

  /** The Icon at the end of the header. Only an Expand header's chevron turns. */
  readonly trailingIcon = input<IconName>(IconName.ChevronDown);

  readonly activate = output<void>();

  protected readonly isOpen = computed(() => this.action() === SectionHeaderAction.Open);

  protected click(): void {
    if (this.isOpen()) this.activate.emit();
    else this.expanded.set(!this.expanded());
  }
}
