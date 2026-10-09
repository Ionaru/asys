// SPDX-License-Identifier: EUPL-1.2
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Quadrant } from '@asys/domain';

import { QuadrantChip } from './quadrant-chip';

@Component({
  imports: [QuadrantChip],
  template: `
    <asys-quadrant-chip [quadrant]="quadrant()" [compact]="compact()" [strong]="strong()" />
    <ul>
      <li asys-quadrant-chip id="in-list" [quadrant]="Quadrant.Delegate"></li>
    </ul>
  `,
})
class Host {
  protected readonly Quadrant = Quadrant;

  readonly quadrant = signal(Quadrant.Do);

  readonly compact = signal(false);

  readonly strong = signal(false);
}

const CELLS = [
  [Quadrant.Do, '0.75', '0.75'],
  [Quadrant.Plan, '9.25', '0.75'],
  [Quadrant.Delegate, '0.75', '9.25'],
  [Quadrant.Drop, '9.25', '9.25'],
] as const;

const WORDS = [
  [Quadrant.Do, 'asys-quadrant--do', 'Do'],
  [Quadrant.Plan, 'asys-quadrant--plan', 'Plan'],
  [Quadrant.Delegate, 'asys-quadrant--delegate', 'Delegate'],
  [Quadrant.Drop, 'asys-quadrant--drop', 'Drop'],
] as const;

const collapsed = (el: Element | null | undefined): string | undefined =>
  el?.textContent?.replace(/\s+/g, ' ').trim();

const visibleText = (el: Element): string => {
  const copy = el.cloneNode(true) as Element;

  for (const part of Array.from(copy.querySelectorAll('svg, .asys-visually-hidden'))) {
    part.remove();
  }

  return collapsed(copy) ?? '';
};

const rects = (el: Element): SVGRectElement[] =>
  Array.from(el.querySelectorAll('svg.asys-quadrant__glyph rect'));

const cellOf = (rect: Element): string => `${rect.getAttribute('x')},${rect.getAttribute('y')}`;

const isSolid = (rect: Element): boolean => {
  const opacity = rect.getAttribute('fill-opacity');

  return opacity === null || opacity === '1';
};

const setup = async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();

  const chip = (): HTMLElement => fixture.nativeElement.querySelector('asys-quadrant-chip');
  const listed = (): HTMLElement =>
    fixture.nativeElement.querySelector('ul li[asys-quadrant-chip]');

  return { fixture, host: fixture.componentInstance, chip, listed };
};

describe('QuadrantChip', () => {
  it.each(WORDS)(
    'renders %s with exactly the classes asys-quadrant and %s and the text Quadrant: %s',
    async (quadrant, modifier, word) => {
      const { fixture, host, chip } = await setup();

      host.quadrant.set(quadrant);
      await fixture.whenStable();

      expect(Array.from(chip().classList).sort()).toEqual(['asys-quadrant', modifier].sort());
      expect(collapsed(chip())).toBe(`Quadrant: ${word}`);
    },
  );

  it('updates the class and the text when the input changes', async () => {
    const { fixture, host, chip } = await setup();

    host.quadrant.set(Quadrant.Plan);
    await fixture.whenStable();
    host.quadrant.set(Quadrant.Drop);
    await fixture.whenStable();

    expect(chip().classList.contains('asys-quadrant--plan')).toBe(false);
    expect(chip().classList.contains('asys-quadrant--drop')).toBe(true);
    expect(collapsed(chip())).toBe('Quadrant: Drop');
  });

  it('adds asys-quadrant--compact only when compact', async () => {
    const { fixture, host, chip } = await setup();

    expect(chip().classList.contains('asys-quadrant--compact')).toBe(false);

    host.compact.set(true);
    await fixture.whenStable();

    expect(chip().classList.contains('asys-quadrant--compact')).toBe(true);
    expect(chip().classList.contains('asys-quadrant--strong')).toBe(false);

    host.compact.set(false);
    await fixture.whenStable();

    expect(chip().classList.contains('asys-quadrant--compact')).toBe(false);
  });

  it('adds asys-quadrant--strong only when strong', async () => {
    const { fixture, host, chip } = await setup();

    expect(chip().classList.contains('asys-quadrant--strong')).toBe(false);

    host.strong.set(true);
    await fixture.whenStable();

    expect(chip().classList.contains('asys-quadrant--strong')).toBe(true);
    expect(chip().classList.contains('asys-quadrant--compact')).toBe(false);

    host.strong.set(false);
    await fixture.whenStable();

    expect(chip().classList.contains('asys-quadrant--strong')).toBe(false);
  });

  it('keeps the quadrant class and adds both modifiers when compact and strong', async () => {
    const { fixture, host, chip } = await setup();

    host.quadrant.set(Quadrant.Plan);
    host.compact.set(true);
    host.strong.set(true);
    await fixture.whenStable();

    expect(Array.from(chip().classList).sort()).toEqual(
      [
        'asys-quadrant',
        'asys-quadrant--plan',
        'asys-quadrant--compact',
        'asys-quadrant--strong',
      ].sort(),
    );
  });

  it('draws the glyph first, as a decorative inline SVG', async () => {
    const { chip } = await setup();

    const glyph = chip().firstElementChild;

    expect(glyph?.tagName.toLowerCase()).toBe('svg');
    expect(glyph?.classList.contains('asys-quadrant__glyph')).toBe(true);
    expect(glyph?.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
    expect(glyph?.getAttribute('focusable')).toBe('false');
    expect(glyph?.hasAttribute('data-icon')).toBe(false);
  });

  it('draws four 6 by 6 rounded cells at the four corners', async () => {
    const { chip } = await setup();

    const cells = rects(chip());

    expect(cells.map(cellOf).sort()).toEqual(CELLS.map(([, x, y]) => `${x},${y}`).sort());

    for (const cell of cells) {
      expect(cell.getAttribute('width')).toBe('6');
      expect(cell.getAttribute('height')).toBe('6');
      expect(cell.getAttribute('rx')).toBe('1.5');
    }
  });

  it.each(CELLS)(
    'fills only the cell of %s solid and leaves the other three at 0.35',
    async (quadrant, x, y) => {
      const { fixture, host, chip } = await setup();

      host.quadrant.set(quadrant);
      await fixture.whenStable();

      const cells = rects(chip());
      const solid = cells.filter(isSolid);
      const faint = cells.filter((cell) => !isSolid(cell));

      expect(solid.map(cellOf)).toEqual([`${x},${y}`]);
      expect(faint.length).toBe(3);

      for (const cell of faint) {
        expect(cell.getAttribute('fill-opacity')).toBe('0.35');
      }
    },
  );

  it('moves the solid cell when the quadrant changes', async () => {
    const { fixture, host, chip } = await setup();

    expect(rects(chip()).filter(isSolid).map(cellOf)).toEqual(['0.75,0.75']);

    host.quadrant.set(Quadrant.Drop);
    await fixture.whenStable();

    expect(rects(chip()).filter(isSolid).map(cellOf)).toEqual(['9.25,9.25']);
  });

  it('puts the visually hidden prefix before the visible word when not compact', async () => {
    const { chip } = await setup();

    const hidden = chip().querySelectorAll('.asys-visually-hidden');

    expect(hidden.length).toBe(1);
    expect(hidden[0].textContent?.trim()).toBe('Quadrant:');
    expect(visibleText(chip())).toBe('Do');
  });

  it.each(WORDS)(
    'shows only the glyph and a hidden sentence for %s when compact',
    async (quadrant, _modifier, word) => {
      const { fixture, host, chip } = await setup();

      host.quadrant.set(quadrant);
      host.compact.set(true);
      await fixture.whenStable();

      expect(collapsed(chip())).toBe(`Quadrant: ${word}.`);

      const hidden = chip().querySelectorAll('.asys-visually-hidden');

      expect(hidden.length).toBe(1);
      expect(collapsed(hidden[0])).toBe(`Quadrant: ${word}.`);
      expect(chip().firstElementChild?.tagName.toLowerCase()).toBe('svg');
      expect(visibleText(chip())).toBe('');
    },
  );

  it('goes back to the full text when compact is switched off', async () => {
    const { fixture, host, chip } = await setup();

    host.compact.set(true);
    await fixture.whenStable();
    host.compact.set(false);
    await fixture.whenStable();

    expect(collapsed(chip())).toBe('Quadrant: Do');
  });

  it('works on a list item through the li[asys-quadrant-chip] selector', async () => {
    const { listed } = await setup();

    expect(listed().tagName).toBe('LI');
    expect(listed().parentElement?.tagName).toBe('UL');
    expect(Array.from(listed().classList).sort()).toEqual(
      ['asys-quadrant', 'asys-quadrant--delegate'].sort(),
    );
    expect(collapsed(listed())).toBe('Quadrant: Delegate');
    expect(rects(listed()).filter(isSolid).map(cellOf)).toEqual(['0.75,9.25']);
  });
});
