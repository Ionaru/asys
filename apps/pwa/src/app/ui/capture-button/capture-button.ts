// SPDX-License-Identifier: EUPL-1.2
import { Component, ViewEncapsulation } from '@angular/core';

/** The Capture pill that opens quick add. */
@Component({
  selector: 'button[asys-capture-button]',
  template: 'Capture',
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

    .asys-capture:active {
      opacity: 0.85;
    }

    [data-theme='drive'] .asys-capture {
      min-height: var(--tap-target-drive);
    }
  `,
})
export class CaptureButton {}
