// SPDX-License-Identifier: EUPL-1.2
import { Component, ElementRef, inject, input, output, ViewEncapsulation } from '@angular/core';
import { Quadrant } from '@asys/domain';

import { Button, ButtonVariant } from '../button/button';
import { QuadrantChip } from '../quadrant-chip/quadrant-chip';
import { StatusBadge, StatusBadgeStatus } from '../status-badge/status-badge';

/** The card for the Task Now recommends, with its actions. Content is projected at the end. */
@Component({
  selector: 'asys-top-pick',
  imports: [Button, QuadrantChip, StatusBadge],
  encapsulation: ViewEncapsulation.None,
  template: `
    <article class="asys-top-pick">
      <h2
        class="asys-top-pick__title"
        tabindex="-1"
        [attr.data-task-id]="taskId()"
        [attr.data-morph]="morph() ? '' : null"
      >
        {{ title() }}
      </h2>
      <p class="asys-top-pick__reason">{{ reason() }}</p>
      <div class="asys-top-pick__meta">
        @if (overdue()) {
          <asys-status-badge [status]="Statuses.Overdue" />
        }
        <asys-quadrant-chip [quadrant]="quadrant()" />
        <span class="asys-top-pick__estimate">{{ estimate() }}</span>
      </div>
      <div class="asys-top-pick__actions">
        <div class="asys-button-group">
          <button
            asys-button
            type="button"
            [variant]="Variants.Primary"
            class="asys-top-pick__main-action"
            [disabled]="actionsDisabled()"
            (click)="done.emit()"
          >
            Done
          </button>
          @if (canLogProgress()) {
            <button
              asys-button
              type="button"
              [variant]="Variants.Secondary"
              class="asys-top-pick__secondary asys-top-pick__log-progress"
              [disabled]="actionsDisabled()"
              (click)="logProgress.emit()"
            >
              Log progress
            </button>
          }
          <button
            asys-button
            type="button"
            [variant]="Variants.Quiet"
            class="asys-top-pick__secondary"
            (click)="open.emit()"
          >
            Open
          </button>
        </div>
      </div>
      <ng-content />
    </article>
  `,
  styles: `
    .asys-top-pick {
      background: var(--surface);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .asys-top-pick__title {
      margin: 0;
      font-size: var(--font-size-display);
      line-height: var(--line-height-display);
      font-weight: 700;
      letter-spacing: -0.01em;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }

    .asys-top-pick__reason {
      margin: 0;
      font-size: var(--font-size-reason);
      line-height: var(--line-height-reason);
      font-weight: 400;
      color: var(--ink-muted);
    }

    .asys-top-pick__meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2) var(--space-3);
    }

    .asys-top-pick__estimate {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: var(--font-size-time);
      line-height: var(--line-height-time);
      font-weight: 500;
      color: var(--ink);
    }

    .asys-top-pick__actions {
      padding-top: var(--space-2);
    }

    [data-theme='drive'] .asys-top-pick {
      border-color: transparent;
      background: transparent;
      padding: var(--space-4) 0;
    }

    [data-theme='drive'] .asys-top-pick__secondary {
      display: none;
    }

    [data-theme='drive'] .asys-top-pick__main-action {
      flex: 1 1 100%;
    }
  `,
})
export class TopPick {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly Variants = ButtonVariant;

  protected readonly Statuses = StatusBadgeStatus;

  readonly title = input.required<string>();

  readonly reason = input.required<string>();

  readonly quadrant = input.required<Quadrant>();

  readonly estimate = input.required<string>();

  readonly taskId = input<string | null>(null);

  readonly morph = input<boolean>(false);

  readonly overdue = input<boolean>(false);

  readonly canLogProgress = input<boolean>(true);

  readonly actionsDisabled = input<boolean>(false);

  readonly done = output<void>();

  readonly logProgress = output<void>();

  readonly open = output<void>();

  /** Moves focus to the title (used after Done, so focus lands on the new top pick). */
  focusTitle(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.asys-top-pick__title')?.focus();
  }

  /** Moves focus to the Log progress button, when it is shown (used when Now's form closes). */
  focusLogProgress(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.asys-top-pick__log-progress')?.focus();
  }
}
