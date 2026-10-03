// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { DestroyRef, Service, inject, signal } from '@angular/core';
import type { Instant } from '@asys/domain';

const MINUTE_MS = 60_000;

/** The current instant, refreshed on every minute boundary and when the page becomes visible. */
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
      }
    };

    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(this.timer);
    });

    this.schedule();
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
