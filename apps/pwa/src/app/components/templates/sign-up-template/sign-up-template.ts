// SPDX-License-Identifier: EUPL-1.2
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { FormField, FormRoot, type FieldTree } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';

import { Button, ButtonVariant } from '../../atoms/button/button';
import { IconName } from '../../atoms/icon/icon';
import { TextField } from '../../molecules/text-field/text-field';

/** The screens of the sign-up flow. */
export enum SignUpStep {
  Name = 'name',
  Passkey = 'passkey',
  Codes = 'codes',
  LinkInvalid = 'link_invalid',
  AlreadySignedIn = 'already_signed_in',
}

/** Lays out the sign-up flow, one step at a time, and moves focus to the heading on each new step. */
@Component({
  selector: 'asys-sign-up-template',
  imports: [Button, FormField, FormRoot, RouterLink, TextField],
  templateUrl: './sign-up-template.component.html',
  styleUrl: './sign-up-template.css',
})
export class SignUpTemplate {
  /** The step to show. */
  readonly step = input.required<SignUpStep>();

  /** The name form of the Name step, which submits the name. */
  readonly nameForm = input.required<FieldTree<{ name: string }>>();

  /** The name the passkey is created for. */
  readonly name = input.required<string>();

  /** Whether the passkey options have loaded, so a passkey can be created. */
  readonly ready = input.required<boolean>();

  /** Whether creating the passkey is running. */
  readonly busy = input.required<boolean>();

  /** The message to show on the Passkey step, if any. */
  readonly message = input.required<string | null>();

  /** Whether loading the passkey options failed, which offers Try again. */
  readonly loadFailed = input.required<boolean>();

  /** The recovery codes of the Codes step. */
  readonly codes = input.required<readonly string[]>();

  /** What copying the codes did, if they were copied. */
  readonly copyStatus = input.required<string | null>();

  /** Asks to create the passkey. */
  readonly createPasskey = output();

  /** Asks to go back to the Name step. */
  readonly changeName = output();

  /** Asks to load the passkey options again. */
  readonly retry = output();

  /** Asks to copy the recovery codes. */
  readonly copyCodes = output();

  /** Asks to leave the codes and go on to Now. */
  readonly finish = output();

  protected readonly Variant = ButtonVariant;

  protected readonly Icons = IconName;

  protected readonly Step = SignUpStep;

  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  protected readonly heading = computed(() => {
    switch (this.step()) {
      case SignUpStep.Codes:
        return 'Your recovery codes';
      case SignUpStep.LinkInvalid:
        return 'This Sign-up link does not work';
      default:
        return 'Sign up';
    }
  });

  constructor() {
    let first = true;

    afterRenderEffect(() => {
      this.step();

      if (first) {
        first = false;

        return;
      }

      this.title()?.nativeElement.focus();
    });
  }
}
