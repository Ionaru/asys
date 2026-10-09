// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, inject, input, output, ViewEncapsulation } from '@angular/core';

import { Button, ButtonVariant } from '../button/button';
import { Icon, IconName } from '../icon/icon';

/** The weight of a review action button. */
export enum ReviewItemActionKind {
  Secondary = 'secondary',
  Quiet = 'quiet',
}

/** One decision a review item offers. */
export interface ReviewItemAction {
  readonly label: string;
  readonly kind: ReviewItemActionKind;
}

/** A question about one item, with the decisions that answer it. A projected link sits after the buttons. */
@Component({
  selector: 'asys-review-item',
  imports: [Button, Icon],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="asys-review">
      <p class="asys-review__label"><asys-icon [name]="IconName.CircleQuestion" />Review item</p>
      <p class="asys-review__question" tabindex="-1">{{ question() }}</p>
      @if (reason() !== '') {
        <p class="asys-review__reason">{{ reason() }}</p>
      }
      <div class="asys-button-group asys-review__actions">
        @for (action of actions(); track $index) {
          <button
            asys-button
            type="button"
            [variant]="action.kind === Kinds.Quiet ? Variants.Quiet : Variants.Secondary"
            [disabled]="busy()"
            (click)="decide.emit(action)"
          >
            {{ action.label }}
          </button>
        }
        <ng-content />
      </div>
    </div>
  `,
  styleUrl: './review-item.css',
})
export class ReviewItem {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly IconName = IconName;

  protected readonly Kinds = ReviewItemActionKind;

  protected readonly Variants = ButtonVariant;

  readonly question = input.required<string>();

  readonly reason = input<string>('');

  readonly actions = input.required<readonly ReviewItemAction[]>();

  readonly busy = input<boolean>(false);

  readonly decide = output<ReviewItemAction>();

  /** Moves focus to the question. */
  focus(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.asys-review__question')?.focus();
  }
}
