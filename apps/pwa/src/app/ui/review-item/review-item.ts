// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, inject, input, output, ViewEncapsulation } from '@angular/core';

import { Button, ButtonVariant } from '../button/button';

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
  imports: [Button],
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="asys-review">
      <p class="asys-review__label">Review item</p>
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
  styles: `
    .asys-review {
      background: var(--surface);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--line);
      color: var(--ink);
    }

    .asys-review__label {
      margin: 0 0 var(--space-1);
      color: var(--ink-muted);
      font-size: var(--font-size-label);
      line-height: var(--line-height-label);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .asys-review__question {
      margin: 0;
      font-size: var(--font-size-body-strong);
      line-height: var(--line-height-body-strong);
      font-weight: 600;
    }

    .asys-review__reason {
      margin: var(--space-1) 0 0;
      color: var(--ink-muted);
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
    }

    .asys-review__actions {
      margin-top: var(--space-3);
    }
  `,
})
export class ReviewItem {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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
