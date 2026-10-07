// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';

/** A seam over `location.reload()`, which jsdom cannot perform. */
@Service()
export class PageReload {
  readonly #document = inject(DOCUMENT);

  reload(): void {
    this.#document.location.reload();
  }
}
