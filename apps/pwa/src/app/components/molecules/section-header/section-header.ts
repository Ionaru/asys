// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, ViewEncapsulation } from '@angular/core';

import { Count, CountVariant } from '../../atoms/count/count';
import { Icon, IconName } from '../../atoms/icon/icon';

/** What a click on the header does: expand its body, or ask the parent to open something (a sheet). */
export enum SectionHeaderAction {
  Expand = 'expand',
  Open = 'open',
}

/**
 * The header button of a set-aside list such as Waiting: an icon, the title and count, a line saying what matters
 * next, and a chevron. It is stateless: the parent owns `expanded` and binds the native `(click)`. Bind the title
 * as a property, never a static attribute, or it becomes the native tooltip of the host.
 */
@Component({
  selector: 'button[asys-section-header]',
  imports: [Icon, Count],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-section-header',
    type: 'button',
    '[attr.aria-expanded]': 'isOpen() ? null : expanded() ? "true" : "false"',
    '[attr.aria-controls]': 'isOpen() ? null : controls()',
    '[attr.aria-haspopup]': 'isOpen() ? "dialog" : null',
  },
  template: `
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
  `,
  styleUrl: './section-header.css',
})
export class SectionHeader {
  protected readonly CountVariant = CountVariant;

  /** The Icon that marks the section, such as the hourglass for Waiting. */
  readonly icon = input.required<IconName>();

  readonly title = input.required<string>();

  readonly count = input<number>(0);

  /** The one fact that matters while the section is closed; none shows when null or empty. */
  readonly summary = input<string | null>(null);

  /** Expand reports aria-expanded and aria-controls; Open reports aria-haspopup instead. */
  readonly action = input<SectionHeaderAction>(SectionHeaderAction.Expand);

  /** The Icon at the end of the header. Only an Expand header's chevron turns. */
  readonly trailingIcon = input<IconName>(IconName.ChevronDown);

  readonly expanded = input<boolean>(false);

  /** The id of the body the header expands, for `aria-controls`. */
  readonly controls = input<string | null>(null);

  protected readonly isOpen = computed(() => this.action() === SectionHeaderAction.Open);
}
