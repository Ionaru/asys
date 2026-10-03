// SPDX-License-Identifier: EUPL-1.2
import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { isValidTimeZone } from '@asys/domain';

import { Session, SessionState } from './core/auth/session';
import { DataStore, SyncStatus } from './core/data/data-store';
import { AppUpdate } from './core/platform/app-update';
import { DeviceZone } from './core/platform/device-zone';
import { Button, ButtonSize, ButtonVariant } from './ui/button/button';

const AUTH_PATHS: readonly string[] = ['/signin', '/signup', '/recover'];

const pathOf = (url: string): string => url.split(/[?#]/, 1)[0] ?? url;

/** The root: update prompt, connection banners, the data store's lifecycle and the sign-out redirect. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Button],
  template: `
    @if (appUpdate.prompt()) {
      <div class="app-banner" role="status" animate.enter="asys-enter" animate.leave="asys-leave">
        <span>A new version of ASYS is ready.</span>
        <button
          asys-button
          type="button"
          [variant]="Variant.Secondary"
          [size]="Size.Small"
          (click)="appUpdate.reload()"
        >
          Reload
        </button>
      </div>
    }
    @if (session.state() === State.Unreachable) {
      <div class="app-banner" role="status" animate.enter="asys-enter" animate.leave="asys-leave">
        ASYS cannot reach the server.
      </div>
    }
    @if (dataStore.status() === SyncStatus.Stale) {
      <div class="app-banner" role="status" animate.enter="asys-enter" animate.leave="asys-leave">
        @if (syncedTime(); as time) {
          Showing what was loaded at <span class="asys-num">{{ time }}</span
          >. Trying again.
        } @else {
          Showing what was loaded earlier. Trying again.
        }
      </div>
    }
    <router-outlet />
  `,
  styles: `
    .app-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      background: var(--sunken);
      color: var(--ink);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
    }
  `,
})
export class App {
  protected readonly session = inject(Session);

  protected readonly dataStore = inject(DataStore);

  protected readonly appUpdate = inject(AppUpdate);

  private readonly router = inject(Router);

  private readonly deviceZone = inject(DeviceZone);

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
      stateZone !== undefined && isValidTimeZone(stateZone) ? stateZone : this.deviceZone.current();

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
          this.dataStore.start();
        } else if (current === SessionState.SignedOut) {
          if (started) {
            started = false;
            this.dataStore.stop();
          }

          if (before === SessionState.SignedIn || before === SessionState.Unreachable) {
            this.leave();
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

  private leave(): void {
    const url = this.router.url;
    const path = pathOf(url);

    if (AUTH_PATHS.includes(path)) {
      return;
    }

    const tree =
      path === '/account'
        ? this.router.createUrlTree(['/signin'])
        : this.router.createUrlTree(['/signin'], { queryParams: { returnUrl: url } });

    void this.router.navigateByUrl(tree);
  }
}
