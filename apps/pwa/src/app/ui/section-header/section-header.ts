// SPDX-License-Identifier: EUPL-1.2
import { Component, input, model, ViewEncapsulation } from '@angular/core';

/**
 * The full-width, collapsible header of a list section. The consumer renders the
 * rows after it and hides them when collapsed. Bind the title as a property, not
 * a static attribute, so it does not become the native tooltip of the host.
 */
@Component({
  selector: 'asys-section-header',
  encapsulation: ViewEncapsulation.None,
  template: `
    <button
      class="asys-section-header"
      type="button"
      [attr.aria-expanded]="expanded() ? 'true' : 'false'"
      (click)="expanded.set(!expanded())"
    >
      <span class="asys-section-header__title">{{ title() }}</span>
      @if (count() > 0) {
        <span class="asys-section-header__count">{{ count() }}</span>
      }
      <span class="asys-section-header__chevron" aria-hidden="true"></span>
    </button>
  `,
  styles: `
    .asys-section-header {
      appearance: none;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      min-height: var(--tap-target);
      margin: 0;
      padding: 0 var(--space-4);
      background: var(--paper);
      color: var(--ink);
      border: 0;
      border-radius: 0;
      text-align: left;
      cursor: pointer;
      transition: background-color var(--duration-quick) var(--ease-out);
    }

    .asys-section-header:active {
      background: var(--signal-soft);
    }

    .asys-section-header__title {
      font-size: var(--font-size-heading);
      line-height: var(--line-height-heading);
      font-weight: 700;
    }

    .asys-section-header__count {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: var(--font-size-time);
      line-height: var(--line-height-time);
      font-weight: 500;
      color: var(--ink-muted);
    }

    .asys-section-header__chevron {
      margin-left: auto;
      width: 8px;
      height: 8px;
      border-right: 2px solid var(--ink-muted);
      border-bottom: 2px solid var(--ink-muted);
      transform: rotate(-45deg);
      transition: transform var(--duration-quick) var(--ease-out);
    }

    .asys-section-header[aria-expanded='true'] .asys-section-header__chevron {
      transform: rotate(45deg);
    }

    [data-theme='drive'] .asys-section-header {
      min-height: var(--tap-target-drive);
    }
  `,
})
export class SectionHeader {
  readonly title = input.required<string>();

  readonly count = input<number>(0);

  readonly expanded = model<boolean>(false);
}
