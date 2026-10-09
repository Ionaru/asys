// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, inject, signal } from '@angular/core';

export enum ThemeName {
  Light = 'light',
  Dark = 'dark',
  Drive = 'drive',
}

/** Applies the colour scheme to the document and follows the device preference. */
@Service()
export class Theme {
  readonly #document = inject(DOCUMENT);

  readonly #currentSignal = signal(ThemeName.Light);

  readonly current = this.#currentSignal.asReadonly();

  constructor() {
    const mql =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : undefined;

    this.#apply(mql?.matches === true);

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

  #apply(dark: boolean): void {
    const name = dark ? ThemeName.Dark : ThemeName.Light;

    this.#currentSignal.set(name);
    this.#document.documentElement.setAttribute('data-theme', name);
  }
}
