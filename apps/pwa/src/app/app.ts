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
import { Theme } from './core/platform/theme';
import { pathOf } from './core/platform/url-path';
import { Button, ButtonSize, ButtonVariant } from './components/atoms/button/button';

/** The root: update prompt, connection banners, the data store's and time zone sync's lifecycle, the sign-out redirect, and the Current Area's palette. */
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

  readonly #theme = inject(Theme);

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
          this.dataStore.discardPreload();

          if (started) {
            started = false;
            this.dataStore.stop();
            this.#timeZoneSync.stop();
          }

          // From Unknown, the guards are still waiting and send the person to sign-in themselves.
          if (before !== SessionState.Unknown) {
            this.#leave();
          }
        } else if (current === SessionState.Unreachable) {
          this.dataStore.discardPreload();
        }
      });
    });

    effect(() => {
      const state = this.dataStore.state();
      const current = this.dataStore.currentArea();

      if (state === null || current === null) {
        return;
      }

      const id = current.areaIds.length === 1 ? current.areaIds[0] : undefined;
      const palette = state.areas.find((area) => area.id === id)?.palette ?? null;

      untracked(() => this.#theme.setPalette(palette));
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
    // A navigation still under way, such as a remembered launch's, names the screen being left.
    const navigation = this.#router.currentNavigation();
    const target = navigation?.finalUrl ?? navigation?.extractedUrl;
    const url = target === undefined ? this.#router.url : this.#router.serializeUrl(target);
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
