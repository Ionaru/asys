// SPDX-License-Identifier: EUPL-1.2
import { Service, computed, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

import { PageReload } from './page-reload';

/** Tracks whether a new app version is ready and lets screens hold back the reload prompt. */
@Service()
export class AppUpdate {
  readonly #swUpdate = inject(SwUpdate, { optional: true });

  readonly #pageReload = inject(PageReload);

  readonly #readySignal = signal(false);

  readonly #holds = signal(0);

  readonly ready = this.#readySignal.asReadonly();

  readonly prompt = computed(() => this.#readySignal() && this.#holds() === 0);

  constructor() {
    if (this.#swUpdate?.isEnabled === true) {
      this.#swUpdate.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') {
          this.#readySignal.set(true);
        }
      });
    }
  }

  /** Suppresses the prompt until a matching release. */
  hold(): void {
    this.#holds.update((count) => count + 1);
  }

  /** Undoes one hold; never goes below zero. */
  release(): void {
    this.#holds.update((count) => Math.max(0, count - 1));
  }

  /** Activates the pending version when possible, then reloads the page. */
  async reload(): Promise<void> {
    if (this.#swUpdate?.isEnabled === true) {
      try {
        await this.#swUpdate.activateUpdate();
      } catch {
        // Reload anyway; the old version simply stays active.
      }
    }

    this.#pageReload.reload();
  }
}
