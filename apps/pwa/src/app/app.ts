// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { isValidTimeZone } from '@asys/domain';

import { SIGNED_OUT_PATHS } from './core/auth/safe-return-url';
import { Session, SessionState, SignOutReason } from './core/auth/session';
import { DataStore, SyncStatus } from './core/data/data-store';
import { TimeZoneSync } from './core/data/time-zone-sync';
import { AppUpdate } from './core/platform/app-update';
import { DeviceZone } from './core/platform/device-zone';
import { pathOf } from './core/platform/url-path';
import { Button, ButtonSize, ButtonVariant } from './ui/button/button';

/** The root: update prompt, connection banners, the data store's and time zone sync's lifecycle, and the sign-out redirect. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Button],
  templateUrl: './app.component.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly session = inject(Session);

  protected readonly dataStore = inject(DataStore);

  protected readonly appUpdate = inject(AppUpdate);

  readonly #router = inject(Router);

  readonly #timeZoneSync = inject(TimeZoneSync);

  readonly #deviceZone = inject(DeviceZone);

  protected readonly State = SessionState;

  protected readonly SyncStatus = SyncStatus;

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly syncedTime = computed<string | null>(() => {
    const syncedAt = this.dataStore.syncedAt();

    if (syncedAt === null) {
      return null;
    }

    const stateZone = this.dataStore.state()?.settings.timeZone;

    const timeZone =
      stateZone !== undefined && isValidTimeZone(stateZone)
        ? stateZone
        : this.#deviceZone.current();

    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone,
    }).format(syncedAt);
  });

  constructor() {
    let previous = SessionState.Unknown;
    let started = false;

    effect(() => {
      const current = this.session.state();

      untracked(() => {
        if (current === previous) {
          return;
        }

        const before = previous;

        previous = current;

        if (current === SessionState.SignedIn) {
          started = true;
          this.#timeZoneSync.start();
          this.dataStore.start();
        } else if (current === SessionState.SignedOut) {
          if (started) {
            started = false;
            this.dataStore.stop();
            this.#timeZoneSync.stop();
          }

          if (before === SessionState.SignedIn || before === SessionState.Unreachable) {
            this.#leave();
          }
        }
      });
    });

    const view = inject(DOCUMENT).defaultView;

    if (view !== null) {
      const retry = (): void => {
        if (this.session.state() === SessionState.Unreachable) {
          void this.session.check();
        }
      };

      view.addEventListener('focus', retry);
      view.addEventListener('online', retry);

      inject(DestroyRef).onDestroy(() => {
        view.removeEventListener('focus', retry);
        view.removeEventListener('online', retry);
      });
    }
  }

  #leave(): void {
    const url = this.#router.url;
    const path = pathOf(url);

    if (SIGNED_OUT_PATHS.includes(path)) {
      return;
    }

    const tree =
      this.session.signOutReason() === SignOutReason.Chosen
        ? this.#router.createUrlTree(['/signin'])
        : this.#router.createUrlTree(['/signin'], { queryParams: { returnUrl: url } });

    void this.#router.navigateByUrl(tree);
  }
}
