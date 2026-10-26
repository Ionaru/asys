// SPDX-License-Identifier: EUPL-1.2
import { Component, input } from '@angular/core';
import { FormField, FormRoot, type FieldTree } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { Text, TextStyle } from '../../atoms/text/text';
import { TextField } from '../../molecules/text-field/text-field';

/** Lays out signing in with a recovery code, with a way back to the passkey. */
@Component({
  selector: 'asys-recover-template',
  imports: [Text, Button, FormField, FormRoot, RouterLink, TextField],
  templateUrl: './recover-template.component.html',
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
  `,
})
export class RecoverTemplate {
  protected readonly TextStyle = TextStyle;

  /** The recovery code form, which submits the sign-in. */
  readonly codeForm = input.required<FieldTree<{ code: string }>>();

  protected readonly Variant = ButtonVariant;
}
