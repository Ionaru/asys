// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, inject, signal } from '@angular/core';
import type { Instant } from '@asys/domain';

const MINUTE_MS = 60_000;

/** The current instant, refreshed on every minute boundary while the page is visible and when it becomes visible. */
@Service()
export class Clock {
  private readonly document = inject(DOCUMENT);

  private readonly nowSignal = signal<Instant>(Date.now() as Instant);

  readonly now = this.nowSignal.asReadonly();

  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const onVisibility = (): void => {
      if (this.document.visibilityState === 'visible') {
        this.nowSignal.set(Date.now() as Instant);
        this.schedule();
      } else {
        // Nothing hidden is seen, so a tick would only make DataStore rank every Task again.
        clearTimeout(this.timer);
      }
    };

    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(this.timer);
    });

    if (this.document.visibilityState === 'visible') {
      this.schedule();
    }
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.nowSignal.set(Date.now() as Instant);
        this.schedule();
      },
      MINUTE_MS - (Date.now() % MINUTE_MS),
    );
  }
}
