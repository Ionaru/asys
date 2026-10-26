// SPDX-License-Identifier: EUPL-1.2
import { Component, computed, input, ViewEncapsulation } from '@angular/core';

import { Count, CountVariant } from '../count/count';
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

/**
 * The design system button, applied to a `button` or an `a` as `asys-button`. With `capture` it is the Capture
 * pill: a plus, the word and, when some failed, how many.
 */
@Component({
  selector: 'button[asys-button], a[asys-button]',
  imports: [Icon, Count],
  template: `
    @if (capture()) {
      <asys-icon [name]="IconName.Plus" /><span class="asys-button__label">Capture</span>
      @if (waiting() > 0) {
        &ngsp;<span
          asys-count
          class="asys-button__count"
          [variant]="CountVariant.OnSignal"
          [value]="waiting()"
          ><span class="asys-visually-hidden"> not captured</span></span
        >
      }
    } @else {
      @if (icon(); as name) {
        <asys-icon [name]="name" />
      }
      <ng-content />
    }
  `,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-button',
    '[class.asys-button--primary]': 'drawnVariant() === Variant.Primary',
    '[class.asys-button--secondary]': 'drawnVariant() === Variant.Secondary',
    '[class.asys-button--quiet]': 'drawnVariant() === Variant.Quiet',
    '[class.asys-button--danger]': 'drawnVariant() === Variant.Danger',
    '[class.asys-button--capture]': 'capture()',
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

  protected readonly IconName = IconName;

  protected readonly CountVariant = CountVariant;

  readonly variant = input<ButtonVariant>(ButtonVariant.Secondary);

  readonly size = input<ButtonSize>(ButtonSize.Default);

  readonly block = input<boolean>(false);

  /** An icon drawn before the label. */
  readonly icon = input<IconName | null>(null);

  /** A square button holding one icon. The consumer gives the host an `aria-label`. */
  readonly iconOnly = input<boolean>(false);

  /** The Capture pill, which draws its own plus and word and ignores `variant`, `icon` and the content. */
  readonly capture = input<boolean>(false);

  /** How many captures are not yet sent, shown on the Capture pill when above 0. */
  readonly waiting = input<number>(0);

  /** The variant whose class the host carries; Capture carries none, so no variant's colours or pressed state apply. */
  protected readonly drawnVariant = computed(() => (this.capture() ? null : this.variant()));
}
