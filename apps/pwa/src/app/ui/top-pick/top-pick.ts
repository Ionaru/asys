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
  templateUrl: './top-pick.component.html',
  styleUrl: './top-pick.css',
})
export class TopPick {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

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

  /** Shows a drawn check and "Done" in place of the actions while the card leaves. */
  readonly completed = input<boolean>(false);

  readonly done = output<{ readonly keyboard: boolean }>();

  readonly logProgress = output<void>();

  readonly open = output<void>();

  /** Moves focus to the title (used after Done, so focus lands on the new top pick). */
  focusTitle(): void {
    this.#host.nativeElement.querySelector<HTMLElement>('.asys-top-pick__title')?.focus();
  }

  /** Moves focus to the Log progress button, when it is shown (used when Now's form closes). */
  focusLogProgress(): void {
    this.#host.nativeElement.querySelector<HTMLElement>('.asys-top-pick__log-progress')?.focus();
  }
}
