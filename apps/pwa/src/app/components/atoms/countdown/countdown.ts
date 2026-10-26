// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

/**
 * A ring with a disc that fills over a duration, drawn inside a button that counts down, as the Undo bar's Undo
 * does. It is display only and hidden from screen readers: the words around it say how long. Reduced motion and
 * Voice leave the disc empty through the kill switches in `styles.css`. Without a `duration` it follows the
 * `--asys-countdown-duration` (or `--asys-undo-duration`) of an ancestor, and `--asys-countdown-delay` (or
 * `--asys-undo-delay`) starts it part-way through.
 */
@Component({
  selector: 'span[asys-countdown]',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-countdown',
    'aria-hidden': 'true',
    '[class.is-paused]': 'paused()',
    '[style.--asys-countdown-duration]': 'duration()',
  },
  template: `<svg viewBox="0 0 20 20">
    <circle class="asys-countdown__ring" cx="10" cy="10" r="9" />
    <circle
      class="asys-countdown__fill"
      cx="10"
      cy="10"
      r="3.25"
      pathLength="100"
      transform="rotate(-90 10 10)"
    />
  </svg>`,
  styles: `
    .asys-countdown {
      display: block;
      flex: none;
      inline-size: 1.25em;
      block-size: 1.25em;
      color: var(--signal);

      & svg {
        display: block;
        inline-size: 100%;
        block-size: 100%;
        overflow: visible;
      }
    }

    .asys-countdown__ring {
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }

    .asys-countdown__fill {
      fill: none;
      stroke: currentColor;
      stroke-width: 6.5;
      stroke-dasharray: 100 100;
      stroke-dashoffset: 100;
      /* linear on purpose: the disc is a clock that must agree with the timer, not motion. */
      animation: asys-countdown-fill var(--asys-countdown-duration, var(--asys-undo-duration, 5s))
        linear var(--asys-countdown-delay, var(--asys-undo-delay, 0ms)) forwards;

      .asys-countdown.is-paused & {
        animation-play-state: paused;
      }
    }

    @keyframes asys-countdown-fill {
      from {
        stroke-dashoffset: 100;
      }

      to {
        stroke-dashoffset: 0;
      }
    }
  `,
})
export class Countdown {
  readonly duration = input<string | null>(null);

  readonly paused = input(false);
}
