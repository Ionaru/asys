// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { Icon, IconName } from '../icon/icon';

/**
 * The primary navigation bar with Now, Today and Inbox, each an icon over its word, and room at its end for
 * the Capture button (projected). Routing owns the current item (`routerLinkActive` sets
 * `aria-current="page"` and the Solid icon), which departs on purpose from the design system README's
 * `current` input and `(navigate)` output.
 */
@Component({
  selector: 'asys-bottom-nav',
  imports: [RouterLink, RouterLinkActive, Icon],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.css',
})
export class BottomNav {
  /** The Inbox count; null while it is not known yet, which shows no badge. */
  readonly inboxCount = input<number | null>(0);

  protected readonly IconName = IconName;

  private readonly inbox = viewChild<ElementRef<HTMLElement>>('inbox');

  /** What the Inbox link says aloud: its count, which the badge hides from screen readers. */
  protected readonly inboxLabel = computed(() => {
    const count = this.inboxCount() ?? 0;

    return count > 0 ? `Inbox, ${count} waiting` : null;
  });

  /**
   * Bumps when the count rises from one known number to a larger one, so the badge is re-created and
   * pops. A count that first appears after load (from null) does not bump.
   */
  protected readonly pop = linkedSignal<number | null, number>({
    source: this.inboxCount,
    computation: (count, previous) =>
      previous !== undefined &&
      previous.source !== null &&
      count !== null &&
      count > previous.source
        ? previous.value + 1
        : (previous?.value ?? 0),
  });

  /** The Inbox link, or null before it renders. */
  inboxTab(): HTMLElement | null {
    return this.inbox()?.nativeElement ?? null;
  }
}
