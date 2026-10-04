// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, ViewEncapsulation } from '@angular/core';
import { Quadrant } from '@asys/domain';

const QUADRANT_WORDS: Record<Quadrant, string> = {
  [Quadrant.Do]: 'Do',
  [Quadrant.Plan]: 'Plan',
  [Quadrant.Delegate]: 'Delegate',
  [Quadrant.Drop]: 'Drop',
};

/** The Eisenhower quadrant of a Task, shown as a word on a chip. */
@Component({
  selector: 'asys-quadrant-chip',
  template: '{{ word() }}',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-quadrant',
    '[class.asys-quadrant--do]': 'quadrant() === Quadrants.Do',
    '[class.asys-quadrant--plan]': 'quadrant() === Quadrants.Plan',
    '[class.asys-quadrant--delegate]': 'quadrant() === Quadrants.Delegate',
    '[class.asys-quadrant--drop]': 'quadrant() === Quadrants.Drop',
  },
  styles: `
    .asys-quadrant {
      display: inline-flex;
      align-items: center;
      min-height: calc(var(--line-height-label) + var(--space-2));
      padding: 0 var(--space-2);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      white-space: nowrap;
      font-family: var(--font-sans);
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .asys-quadrant--do {
      background: var(--ink);
      color: var(--paper);
    }

    .asys-quadrant--plan {
      background: var(--signal);
      color: var(--on-signal);
    }

    .asys-quadrant--delegate {
      background: var(--now);
      color: var(--on-now);
    }

    .asys-quadrant--drop {
      background: transparent;
      border-color: var(--line-strong);
      color: var(--ink-muted);
    }

    [data-theme='dark'] .asys-quadrant--delegate,
    [data-theme='drive'] .asys-quadrant--delegate {
      background: transparent;
      border: 2px solid var(--now);
      padding: 0 calc(var(--space-2) - 1px);
      color: var(--ink);
    }
  `,
})
export class QuadrantChip {
  protected readonly Quadrants = Quadrant;

  readonly quadrant = input.required<Quadrant>();

  protected readonly word = computed(() => QUADRANT_WORDS[this.quadrant()]);
}
