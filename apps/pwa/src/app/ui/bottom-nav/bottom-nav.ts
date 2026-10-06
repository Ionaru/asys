// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  ElementRef,
  input,
  linkedSignal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * The primary navigation bar with Now, Today and Inbox. Routing owns the current
 * item (`routerLinkActive` sets `aria-current="page"`), which departs on purpose
 * from the design system README's `current` input and `(navigate)` output.
 */
@Component({
  selector: 'asys-bottom-nav',
  imports: [RouterLink, RouterLinkActive],
  encapsulation: ViewEncapsulation.None,
  template: `
    @let popKey = pop();
    <nav class="asys-bottomnav" aria-label="Primary">
      <a
        class="asys-bottomnav__item"
        routerLink="/now"
        routerLinkActive="is-current"
        ariaCurrentWhenActive="page"
      >
        <span class="asys-bottomnav__pill" aria-hidden="true"></span>
        <span class="asys-bottomnav__label">Now</span>
      </a>
      <a
        class="asys-bottomnav__item"
        routerLink="/today"
        routerLinkActive="is-current"
        ariaCurrentWhenActive="page"
      >
        <span class="asys-bottomnav__pill" aria-hidden="true"></span>
        <span class="asys-bottomnav__label">Today</span>
      </a>
      <a
        #inbox
        class="asys-bottomnav__item"
        routerLink="/inbox"
        routerLinkActive="is-current"
        ariaCurrentWhenActive="page"
      >
        <span class="asys-bottomnav__pill" aria-hidden="true"></span>
        <span class="asys-bottomnav__label"
          >Inbox
          @if ((inboxCount() ?? 0) > 0) {
            @for (key of [popKey]; track key) {
              @if (popKey > 0) {
                <span class="asys-bottomnav__badge" animate.enter="asys-pop">{{
                  inboxCount()
                }}</span>
              } @else {
                <span class="asys-bottomnav__badge">{{ inboxCount() }}</span>
              }
            }
          }
        </span>
      </a>
    </nav>
  `,
  styleUrl: './bottom-nav.css',
})
export class BottomNav {
  /** The Inbox count; null while it is not known yet, which shows no badge. */
  readonly inboxCount = input<number | null>(0);

  private readonly inbox = viewChild<ElementRef<HTMLElement>>('inbox');

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
