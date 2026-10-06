// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

/** The Capture pill that opens quick add. */
@Component({
  selector: 'button[asys-capture-button]',
  template: `<span class="asys-capture__label">{{ count() > 0 ? 'Capture ' : 'Capture' }}</span>
    @if (count() > 0) {
      <span class="asys-capture__badge"
        >{{ count() }}<span class="asys-visually-hidden"> not captured</span></span
      >
    }`,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-capture',
    type: 'button',
  },
  styles: `
    .asys-capture {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      min-height: 56px;
      padding: var(--space-2) var(--space-5);
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--signal);
      color: var(--on-signal);
      cursor: pointer;
      font-family: var(--font-sans);
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
    }

    .asys-capture__badge {
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

    .asys-capture:active {
      opacity: 0.85;
    }

    [data-theme='drive'] .asys-capture {
      min-height: var(--tap-target-drive);
    }
  `,
})
export class CaptureButton {
  readonly count = input<number>(0);
}
