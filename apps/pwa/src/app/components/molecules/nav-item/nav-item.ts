// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, linkedSignal, ViewEncapsulation } from '@angular/core';

import { Count } from '../../atoms/count/count';
import { Icon, IconName } from '../../atoms/icon/icon';

/**
 * One destination in the bottom bar: an Icon in a pill over its word, with an optional Count. It sits on the
 * anchor itself (`a[asys-nav-item]`), so `routerLink` and `href` stay on a real link. Two departures from the
 * design system: there is no `(navigate)` output, because the anchor's `routerLink` navigates, and `count`
 * takes null (not known yet), which shows no Count. `current` is fed by routing; it sets `aria-current="page"`
 * and draws the Icon Solid. `pressed` shows the pill from the pointer, not from `:active`, which a phone can
 * leave on a destination after the press. The Count is hidden from screen readers, so the anchor says it aloud.
 */
@Component({
  selector: 'a[asys-nav-item]',
  imports: [Icon, Count],
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-nav-item',
    '[class.is-pressed]': 'pressed()',
    '[attr.aria-current]': "current() ? 'page' : null",
    '[attr.aria-label]': 'name()',
  },
  template: `
    @let popKey = pop();
    <span class="asys-nav-item__icon">
      <asys-icon [name]="icon()" [solid]="current()" />
      @if ((count() ?? 0) > 0) {
        @for (key of [popKey]; track key) {
          @if (popKey > 0) {
            <span
              asys-count
              aria-hidden="true"
              animate.enter="asys-pop"
              [value]="count() ?? 0"
            ></span>
          } @else {
            <span asys-count aria-hidden="true" [value]="count() ?? 0"></span>
          }
        }
      }
    </span>
    <span class="asys-nav-item__label">{{ label() }}</span>
  `,
  styleUrl: './nav-item.css',
})
export class NavItem {
  readonly icon = input.required<IconName>();

  readonly label = input.required<string>();

  readonly current = input(false);

  /** The number waiting; null while it is not known yet. Null and 0 show no Count. */
  readonly count = input<number | null>(null);

  readonly pressed = input(false);

  /** What the link says aloud when a count is waiting, which the Count hides from screen readers. */
  protected readonly name = computed(() => {
    const count = this.count() ?? 0;

    return count > 0 ? `${this.label()}, ${count} waiting` : null;
  });

  /**
   * Bumps when the count rises from one known number to a larger one, so the Count is re-created and
   * pops. A count that first appears after load (from null) does not bump.
   */
  protected readonly pop = linkedSignal<number | null, number>({
    source: this.count,
    computation: (count, previous) =>
      previous !== undefined &&
      previous.source !== null &&
      count !== null &&
      count > previous.source
        ? previous.value + 1
        : (previous?.value ?? 0),
  });
}
