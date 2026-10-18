// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

import { Icon, IconName } from '../icon/icon';

/** The visual weight of a button. */
export enum ButtonVariant {
  Primary = 'primary',
  Secondary = 'secondary',
  Quiet = 'quiet',
  Danger = 'danger',
}

/** The size of a button. */
export enum ButtonSize {
  Default = 'default',
  Small = 'small',
  Large = 'large',
}

/** The design system button, applied to a `button` or an `a` as `asys-button`. */
@Component({
  selector: 'button[asys-button], a[asys-button]',
  imports: [Icon],
  template: `
    @if (icon(); as name) {
      <asys-icon [name]="name" />
    }
    <ng-content />
  `,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-button',
    '[class.asys-button--primary]': 'variant() === Variant.Primary',
    '[class.asys-button--secondary]': 'variant() === Variant.Secondary',
    '[class.asys-button--quiet]': 'variant() === Variant.Quiet',
    '[class.asys-button--danger]': 'variant() === Variant.Danger',
    '[class.asys-button--small]': 'size() === Size.Small',
    '[class.asys-button--large]': 'size() === Size.Large',
    '[class.asys-button--icon]': 'iconOnly()',
    '[class.asys-button--block]': 'block()',
  },
  styleUrl: './button.css',
})
export class Button {
  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  readonly variant = input<ButtonVariant>(ButtonVariant.Secondary);

  readonly size = input<ButtonSize>(ButtonSize.Default);

  readonly block = input<boolean>(false);

  /** An icon drawn before the label. */
  readonly icon = input<IconName | null>(null);

  /** A square button holding one icon. The consumer gives the host an `aria-label`. */
  readonly iconOnly = input<boolean>(false);
}
