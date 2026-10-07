// SPDX-License-Identifier: EUPL-1.2
import { afterNextRender, Component, inject, Injector, signal } from '@angular/core';
import { form, FormField, FormRoot, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { AuthApi, AuthError, AuthResultTag } from '../../core/api/auth-api';
import { Session } from '../../core/auth/session';
import { GENERIC_MESSAGE } from '../../core/data/outcome-message';
import { Button, ButtonVariant } from '../../ui/button/button';
import { TextField } from '../../ui/text-field/text-field';

/** The longest recovery code the server accepts. */
export const MAX_CODE_LENGTH = 64;

/** Signs in with a recovery code. */
@Component({
  selector: 'asys-recover',
  imports: [Button, FormField, FormRoot, RouterLink, TextField],
  templateUrl: './recover.component.html',
  styles: `
    .recover {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding-block-end: var(--space-5);
    }

    .recover__form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .recover__title {
      margin: 0;
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
    }
  `,
})
export class Recover {
  private readonly authApi = inject(AuthApi);

  private readonly session = inject(Session);

  private readonly router = inject(Router);

  private readonly injector = inject(Injector);

  protected readonly Variant = ButtonVariant;

  private readonly model = signal({ code: '' });

  protected readonly codeForm = form(
    this.model,
    (path) => {
      validate(path.code, ({ value }) => {
        if (value().trim().length === 0) {
          return { kind: 'required', message: 'Enter a recovery code' };
        }

        return value().length > MAX_CODE_LENGTH
          ? { kind: 'max_length', message: 'Use at most 64 characters' }
          : undefined;
      });
    },
    {
      submission: {
        action: async (field) => {
          const result = await this.authApi.recover(field().value().code);

          if (result._tag === AuthResultTag.Ok) {
            await this.session.signedIn();
            await this.router.navigateByUrl('/recovered');

            return undefined;
          }

          afterNextRender(() => field.code().focusBoundControl(), { injector: this.injector });

          return result.error === AuthError.SignInFailed
            ? {
                fieldTree: field.code,
                kind: 'sign_in_failed',
                message: 'That recovery code did not work',
              }
            : {
                fieldTree: field.code,
                kind: 'unexpected',
                message: GENERIC_MESSAGE,
              };
        },
        onInvalid: (field) => {
          field.code().focusBoundControl();
        },
      },
    },
  );
}
