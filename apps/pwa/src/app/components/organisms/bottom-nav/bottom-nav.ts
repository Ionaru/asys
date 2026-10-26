// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, signal, viewChild, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { IconName } from '../../atoms/icon/icon';
import { NavItem } from '../../molecules/nav-item/nav-item';

/**
 * The primary navigation bar with Now, Today and Inbox, each a NavItem (an icon over its word), and room at its
 * end for the Capture button (projected). Without Capture, the destinations sit in the middle. Routing stays
 * here: `routerLink` navigates and `routerLinkActive` feeds each NavItem's `current`, which departs on purpose
 * from the design system README's `current` input and `(navigate)` output on the bar. A pressed destination
 * shows its pill from the pointer (`is-pressed`), not from the design system's `:active`: a phone can leave
 * `:active` on a destination after the press, which then looked as current as the real one.
 */
@Component({
  selector: 'asys-bottom-nav',
  imports: [RouterLink, RouterLinkActive, NavItem],
  encapsulation: ViewEncapsulation.None,
  host: {
    '(document:pointerup)': 'release()',
    '(document:pointercancel)': 'release()',
    '(contextmenu)': 'release()',
  },
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.css',
})
export class BottomNav {
  /** The Inbox count; null while it is not known yet, which shows no badge. */
  readonly inboxCount = input<number | null>(0);

  protected readonly IconName = IconName;

  private readonly inbox = viewChild('inbox', { read: ElementRef<HTMLElement> });

  /** The path of the destination under a press, whose icon shows the pill until the press ends; null when none. */
  protected readonly pressed = signal<string | null>(null);

  /** The Inbox link, or null before it renders. */
  inboxTab(): HTMLElement | null {
    return this.inbox()?.nativeElement ?? null;
  }

  /** Shows a press on the destination at `path`, for the primary pointer's main button only. */
  protected press(event: PointerEvent, path: string): void {
    if (event.isPrimary && event.button === 0) {
      this.pressed.set(path);
    }
  }

  /**
   * Ends the press when the pointer goes up or is cancelled anywhere, when a context menu takes it, and when
   * the current destination changes, which the back gesture does without a pointer event.
   */
  protected release(): void {
    this.pressed.set(null);
  }
}
