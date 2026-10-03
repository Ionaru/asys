// SPDX-License-Identifier: EUPL-1.2
import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { DataStore } from '../core/data/data-store';
import { BottomNav } from '../ui/bottom-nav/bottom-nav';
import { Button, ButtonSize, ButtonVariant } from '../ui/button/button';

/** The signed-in frame: an Account link, the routed screen and the bottom navigation. */
@Component({
  selector: 'app-shell-layout',
  imports: [RouterOutlet, RouterLink, Button, BottomNav],
  template: `
    <header class="shell__header">
      <a asys-button routerLink="/account" [variant]="Variant.Quiet" [size]="Size.Small">Account</a>
    </header>
    <main class="asys-page shell__page">
      <router-outlet />
    </main>
    <asys-bottom-nav class="shell__nav" [inboxCount]="dataStore.inboxCount()" />
  `,
  styles: `
    .shell__header {
      display: flex;
      justify-content: flex-end;
      padding: var(--space-2) var(--space-4);
    }

    .shell__page {
      padding-bottom: calc(56px + var(--space-4) + env(safe-area-inset-bottom));
    }

    .shell__nav {
      position: fixed;
      inset-inline: 0;
      bottom: 0;
      display: block;
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--surface);
    }
  `,
})
export class ShellLayout {
  protected readonly dataStore = inject(DataStore);

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;
}
