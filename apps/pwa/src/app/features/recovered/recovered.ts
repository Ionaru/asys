// SPDX-License-Identifier: EUPL-1.2
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button, ButtonVariant } from '../../ui/button/button';

/** Shown after a recovery code sign-in, nudging the Owner to replace lost passkeys. */
@Component({
  selector: 'asys-recovered',
  imports: [Button, RouterLink],
  template: `
    <main class="asys-page recovered">
      <h1 class="recovered__title">You are signed in</h1>
      <p class="recovered__body">
        You signed in with a recovery code. Add a passkey now, and remove any you lost.
      </p>
      <a asys-button routerLink="/account" [variant]="Variant.Primary">Go to your account</a>
      <a asys-button routerLink="/now" [variant]="Variant.Quiet">Not now</a>
    </main>
  `,
  styles: `
    .recovered {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-4);
      padding-block-end: var(--space-5);
    }

    .recovered__title {
      margin: 0;
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
    }

    .recovered__body {
      margin: 0;
      font-size: var(--font-size-body);
      line-height: var(--line-height-body);
    }
  `,
})
export class Recovered {
  protected readonly Variant = ButtonVariant;
}
