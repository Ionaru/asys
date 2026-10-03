// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';
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
        class="asys-bottomnav__item"
        routerLink="/inbox"
        routerLinkActive="is-current"
        ariaCurrentWhenActive="page"
      >
        <span class="asys-bottomnav__pill" aria-hidden="true"></span>
        <span class="asys-bottomnav__label"
          >Inbox
          @if (inboxCount() > 0) {
            <span class="asys-bottomnav__badge">{{ inboxCount() }}</span>
          }
        </span>
      </a>
    </nav>
  `,
  styles: `
    .asys-bottomnav {
      display: flex;
      background: var(--surface);
      border-top: 1px solid var(--line);
    }

    .asys-bottomnav__item {
      flex: 1 1 0;
      min-width: 0;
      min-height: 56px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-2);
      background: transparent;
      border: 0;
      border-radius: 0;
      color: var(--ink-muted);
      text-decoration: none;
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .asys-bottomnav__item:active {
      background: var(--signal-soft);
    }

    .asys-bottomnav__pill {
      display: block;
      width: 32px;
      height: 4px;
      border-radius: var(--radius-sm);
      background: transparent;
    }

    .asys-bottomnav__item[aria-current='page'] {
      color: var(--ink);
    }

    .asys-bottomnav__item[aria-current='page'] .asys-bottomnav__pill {
      background: var(--signal);
    }

    .asys-bottomnav__label {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
    }

    .asys-bottomnav__badge {
      min-width: calc(var(--line-height-label) + var(--space-1));
      padding: 0 var(--space-1);
      border-radius: var(--radius-sm);
      background: var(--ink);
      color: var(--paper);
      text-align: center;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    [data-theme='drive'] .asys-bottomnav {
      display: none;
    }
  `,
})
export class BottomNav {
  readonly inboxCount = input<number>(0);
}
