// SPDX-License-Identifier: EUPL-1.2
import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  contentChild,
  ElementRef,
  input,
  model,
  TemplateRef,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import { Button, ButtonVariant } from '../button/button';
import { IconName } from '../icon/icon';

let nextId = 0;

/**
 * A bottom sheet on the native modal `dialog`, which brings the focus trap, Escape, a tap on the backdrop, the
 * top layer and focus returned to the opener. Project one `ng-template` as the body: it is rendered only while
 * the sheet is open. Bind the heading as an input named `heading`, so it never becomes the host's tooltip.
 */
@Component({
  selector: 'asys-sheet',
  imports: [Button, NgTemplateOutlet],
  encapsulation: ViewEncapsulation.None,
  template: `
    <dialog
      #dialog
      class="asys-sheet"
      closedby="any"
      autofocus
      [attr.aria-labelledby]="headingId"
      (close)="closed()"
    >
      <div class="asys-sheet__grip" aria-hidden="true"></div>
      <div class="asys-sheet__head">
        <h2 class="asys-sheet__heading" [id]="headingId">{{ heading() }}</h2>
        <button
          asys-button
          type="button"
          class="asys-sheet__close"
          aria-label="Close"
          [variant]="Quiet"
          [iconOnly]="true"
          [icon]="Xmark"
          (click)="open.set(false)"
        ></button>
      </div>
      <div class="asys-sheet__body">
        @if (open()) {
          <ng-container [ngTemplateOutlet]="body()" />
        }
      </div>
    </dialog>
  `,
  styleUrl: './sheet.css',
})
export class Sheet {
  protected readonly Quiet = ButtonVariant.Quiet;

  protected readonly Xmark = IconName.Xmark;

  protected readonly headingId = `asys-sheet-${nextId++}-heading`;

  readonly heading = input.required<string>();

  readonly open = model<boolean>(false);

  protected readonly body = contentChild.required(TemplateRef);

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      const wanted = this.open();
      if (!dialog) {
        return;
      }
      if (wanted && !dialog.open) {
        dialog.showModal();
      } else if (!wanted && dialog.open) {
        dialog.close();
      }
    });
  }

  /** The native `close` event: Escape, a tap on the backdrop, or `close()` itself. */
  protected closed(): void {
    if (this.open()) {
      this.open.set(false);
    }
  }
}
