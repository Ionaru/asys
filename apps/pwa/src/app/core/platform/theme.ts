// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, inject, signal } from '@angular/core';
import { Palette } from '@asys/domain';

import { Clock } from './clock';
import { DeviceStorage } from './device-storage';

export enum ThemeName {
  Light = 'light',
  Dark = 'dark',
  Drive = 'drive',
}

/** Where the last palette in use is kept in DeviceStorage, with when it was saved. */
export const PALETTE_KEY = 'asys.palette';

/** How long a stored palette is applied at launch, before the data has loaded. */
export const STORED_PALETTE_MS = 3_600_000;

const PALETTES: readonly string[] = Object.values(Palette);

/** Reads a stored palette record; null when it is absent, malformed, stale or from the future. */
const parseStored = (raw: string | null, now: number): { palette: Palette | null } | null => {
  if (raw === null) {
    return null;
  }

  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const { palette, savedAt } = value as { palette?: unknown; savedAt?: unknown };

  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
    return null;
  }

  if (palette !== null && (typeof palette !== 'string' || !PALETTES.includes(palette))) {
    return null;
  }

  const age = now - savedAt;

  return age >= 0 && age < STORED_PALETTE_MS ? { palette: palette as Palette | null } : null;
};

/**
 * Applies the colour scheme and the palette to the document and follows the device preference. It keeps
 * the last palette on this device for the next launch, and points the theme-color metas at the page colour.
 */
@Service()
export class Theme {
  readonly #document = inject(DOCUMENT);

  readonly #storage = inject(DeviceStorage);

  readonly #clock = inject(Clock);

  readonly #currentSignal = signal(ThemeName.Light);

  readonly current = this.#currentSignal.asReadonly();

  readonly #paletteSignal = signal<Palette | null>(null);

  /** The palette applied to the document, or null for the default look. */
  readonly palette = this.#paletteSignal.asReadonly();

  constructor() {
    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : undefined;

    this.#apply(mql?.matches === true);

    const stored = parseStored(this.#storage.get(PALETTE_KEY), this.#clock.now());

    if (stored !== null) {
      this.#show(stored.palette);
    }

    if (mql === undefined) {
      return;
    }

    const handler = (event: Event): void => {
      this.#apply((event as MediaQueryListEvent).matches);
    };

    mql.addEventListener('change', handler);
    inject(DestroyRef).onDestroy(() => {
      mql.removeEventListener('change', handler);
    });
  }

  /** Applies a palette (null for the default look) and keeps it, with the time, on this device. */
  setPalette(palette: Palette | null): void {
    this.#show(palette);
    this.#storage.set(PALETTE_KEY, JSON.stringify({ palette, savedAt: this.#clock.now() }));
  }

  /** Forgets the stored palette and goes back to the default look. */
  clearPalette(): void {
    this.#storage.remove(PALETTE_KEY);
    this.#show(null);
  }

  #show(palette: Palette | null): void {
    const root = this.#document.documentElement;

    if (palette === null || palette === Palette.Evergreen) {
      root.removeAttribute('data-palette');
    } else {
      root.setAttribute('data-palette', palette);
    }

    this.#paletteSignal.set(palette);
    this.#followPaper();
  }

  /** Points the theme-color metas at the page colour the stylesheet now computes. */
  #followPaper(): void {
    const view = this.#document.defaultView;

    if (view === null) {
      return;
    }

    const paper = view
      .getComputedStyle(this.#document.documentElement)
      .getPropertyValue('--paper')
      .trim();

    if (paper === '') {
      return;
    }

    for (const meta of this.#document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', paper);
    }
  }

  #apply(dark: boolean): void {
    const name = dark ? ThemeName.Dark : ThemeName.Light;

    this.#currentSignal.set(name);
    this.#document.documentElement.setAttribute('data-theme', name);
    this.#followPaper();
  }
}
