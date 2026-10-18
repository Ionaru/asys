// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, ViewEncapsulation } from '@angular/core';
import { Quadrant } from '@asys/domain';

const QUADRANT_WORDS: Record<Quadrant, string> = {
  [Quadrant.Do]: 'Do',
  [Quadrant.Plan]: 'Plan',
  [Quadrant.Delegate]: 'Delegate',
  [Quadrant.Drop]: 'Drop',
};

/** The cells of the 2x2 glyph: Do top left, Plan top right, Delegate bottom left, Drop bottom right. */
const GLYPH_CELLS: readonly {
  readonly quadrant: Quadrant;
  readonly x: number;
  readonly y: number;
}[] = [
  { quadrant: Quadrant.Do, x: 0.75, y: 0.75 },
  { quadrant: Quadrant.Plan, x: 9.25, y: 0.75 },
  { quadrant: Quadrant.Delegate, x: 0.75, y: 9.25 },
  { quadrant: Quadrant.Drop, x: 9.25, y: 9.25 },
];

/**
 * The Eisenhower quadrant of a Task: a 2x2 glyph with the quadrant's cell filled, then its word. Compact
 * shows the glyph alone and keeps the word for screen readers.
 */
@Component({
  selector: 'asys-quadrant-chip, li[asys-quadrant-chip]',
  template: `
    <svg class="asys-quadrant__glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      @for (cell of cells; track cell.quadrant) {
        <rect
          width="6"
          height="6"
          rx="1.5"
          [attr.x]="cell.x"
          [attr.y]="cell.y"
          [attr.fill-opacity]="cell.quadrant === quadrant() ? null : 0.35"
        />
      }
    </svg>
    @if (compact()) {
      <span class="asys-visually-hidden">Quadrant: {{ word() }}.</span>
    } @else {
      <span class="asys-visually-hidden">Quadrant: </span>{{ word() }}
    }
  `,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-quadrant',
    '[class.asys-quadrant--do]': 'quadrant() === Quadrants.Do',
    '[class.asys-quadrant--plan]': 'quadrant() === Quadrants.Plan',
    '[class.asys-quadrant--delegate]': 'quadrant() === Quadrants.Delegate',
    '[class.asys-quadrant--drop]': 'quadrant() === Quadrants.Drop',
    '[class.asys-quadrant--compact]': 'compact()',
    '[class.asys-quadrant--strong]': 'strong()',
  },
  styleUrl: './quadrant-chip.css',
})
export class QuadrantChip {
  protected readonly Quadrants = Quadrant;

  protected readonly cells = GLYPH_CELLS;

  readonly quadrant = input.required<Quadrant>();

  /** Shows the glyph alone. */
  readonly compact = input<boolean>(false);

  /** Draws the chip in full ink and a heavier weight. */
  readonly strong = input<boolean>(false);

  protected readonly word = computed(() => QUADRANT_WORDS[this.quadrant()]);
}
