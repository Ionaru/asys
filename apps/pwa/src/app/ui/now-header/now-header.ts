// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, input, viewChild, ViewEncapsulation } from '@angular/core';

/**
 * The top of Now: the moment, as a heading a screen reader announces as "Now, ...". Content is projected
 * after the moment, on the same row (the More button). Gaps arrive in slice 2.
 */
@Component({
  selector: 'asys-now-header',
  encapsulation: ViewEncapsulation.None,
  template: `
    <header class="asys-now-header">
      <div class="asys-now-header__top">
        <h1 #heading class="asys-now-header__moment" tabindex="-1">
          <span class="asys-visually-hidden">Now, </span>
          <time [attr.datetime]="datetime()">{{ moment() }}</time>
        </h1>
        <ng-content />
      </div>
    </header>
  `,
  styles: `
    .asys-now-header {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      color: var(--ink);
    }

    .asys-now-header__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      min-height: var(--tap-target);
    }

    .asys-now-header__moment {
      margin: 0;
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
    }

    .asys-now-header__top > .asys-button--icon {
      margin-inline-end: calc(var(--space-3) * -1);
    }
  `,
})
export class NowHeader {
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  /** The moment as text, such as `Fri 9 Oct · 14:05`. */
  readonly moment = input.required<string>();

  /** The moment as a machine-readable local date and time, such as `2026-10-09T14:05`. */
  readonly datetime = input.required<string>();

  /** Moves focus to the heading (used when no Task shows, and after a Done leaves nothing to pick). */
  focusHeading(): void {
    this.heading()?.nativeElement.focus();
  }
}
