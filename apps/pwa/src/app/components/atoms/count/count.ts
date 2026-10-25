// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, ViewEncapsulation } from '@angular/core';

export enum CountVariant {
  Filled = 'filled',
  OnSignal = 'on-signal',
  Quiet = 'quiet',
}

/**
 * A number in mono: a Filled pill, an OnSignal pill for use on the signal colour, or Quiet plain text. Above 99
 * it shows "99+". The parent says the number in words and hides the Count with `aria-hidden` when it would be
 * read twice. Content projected into it follows the number.
 */
@Component({
  selector: 'span[asys-count]',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-count',
    '[class.asys-count--on-signal]': 'variant() === CountVariant.OnSignal',
    '[class.asys-count--quiet]': 'variant() === CountVariant.Quiet',
  },
  template: `{{ shown() }}<ng-content />`,
  styles: `
    .asys-count {
      display: inline-block;
      min-width: calc(var(--line-height-label) + var(--space-1));
      padding: 0 var(--space-1);
      border-radius: var(--radius-pill);
      background: var(--ink);
      color: var(--paper);
      text-align: center;
      white-space: nowrap;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0;
    }

    .asys-count--on-signal {
      background: var(--on-signal);
      color: var(--signal);
    }

    .asys-count--quiet {
      min-width: 0;
      padding: 0;
      border-radius: 0;
      background: transparent;
      color: var(--ink-muted);
      font-size: var(--font-size-time);
      line-height: var(--line-height-time);
      font-weight: 500;
    }
  `,
})
export class Count {
  readonly value = input.required<number>();

  readonly variant = input<CountVariant>(CountVariant.Filled);

  protected readonly CountVariant = CountVariant;

  protected readonly shown = computed(() => (this.value() > 99 ? '99+' : String(this.value())));
}
