// SPDX-License-Identifier: EUPL-1.2
import { Component, input, ViewEncapsulation } from '@angular/core';

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
}

/** The design system button, applied to a `button` or an `a` as `asys-button`. */
@Component({
  selector: 'button[asys-button], a[asys-button]',
  template: '<ng-content />',
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'asys-button',
    '[class.asys-button--primary]': 'variant() === Variant.Primary',
    '[class.asys-button--secondary]': 'variant() === Variant.Secondary',
    '[class.asys-button--quiet]': 'variant() === Variant.Quiet',
    '[class.asys-button--danger]': 'variant() === Variant.Danger',
    '[class.asys-button--small]': 'size() === Size.Small',
    '[class.asys-button--block]': 'block()',
  },
  styles: `
    .asys-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: var(--tap-target);
      min-width: var(--tap-target);
      padding: var(--space-2) var(--space-4);
      border: 1px solid transparent;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--ink);
      cursor: pointer;
      text-align: center;
      font-family: var(--font-sans);
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
      transition: opacity 150ms ease-out;
    }

    a.asys-button {
      text-decoration: none;
    }

    .asys-button--primary {
      background: var(--signal);
      color: var(--on-signal);
    }

    .asys-button--secondary {
      background: var(--surface);
      border-color: var(--line-strong);
      color: var(--ink);
    }

    .asys-button--quiet {
      background: transparent;
      color: var(--signal);
    }

    .asys-button--danger {
      background: var(--danger);
      color: var(--on-danger);
    }

    .asys-button--small {
      position: relative;
      min-height: 36px;
      min-width: 36px;
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .asys-button--small::after {
      content: '';
      position: absolute;
      inset: -6px;
    }

    .asys-button--block {
      display: flex;
      width: 100%;
    }

    .asys-button--primary:active:not(:disabled):not(.is-disabled),
    .asys-button--danger:active:not(:disabled):not(.is-disabled) {
      opacity: 0.85;
    }

    .asys-button--secondary:active:not(:disabled):not(.is-disabled),
    .asys-button--quiet:active:not(:disabled):not(.is-disabled) {
      background: var(--signal-soft);
      color: var(--on-signal-soft);
    }

    .asys-button:disabled,
    .asys-button.is-disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    [data-theme='drive'] .asys-button {
      min-height: var(--tap-target-drive);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
      letter-spacing: normal;
      transition: none;
    }

    [data-theme='drive'] .asys-button--small {
      min-height: var(--tap-target-drive);
      min-width: var(--tap-target-drive);
      font-size: var(--font-size-title);
      line-height: var(--line-height-title);
      font-weight: 700;
      letter-spacing: normal;
    }
  `,
})
export class Button {
  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  readonly variant = input<ButtonVariant>(ButtonVariant.Secondary);

  readonly size = input<ButtonSize>(ButtonSize.Default);

  readonly block = input<boolean>(false);
}
