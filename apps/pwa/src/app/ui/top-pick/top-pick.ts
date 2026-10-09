// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Quadrant } from '@asys/domain';

import { Button, ButtonSize, ButtonVariant } from '../button/button';
import { Fact } from '../fact/fact';
import { Icon, IconName } from '../icon/icon';
import { QuadrantChip } from '../quadrant-chip/quadrant-chip';
import { StatusBadge, StatusBadgeStatus } from '../status-badge/status-badge';

/**
 * The card for the Task Now recommends: its title (a link that opens the Task), the reason, its facts and
 * its actions. Content is projected at the end.
 */
@Component({
  selector: 'asys-top-pick',
  imports: [Button, Fact, Icon, QuadrantChip, RouterLink, StatusBadge],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './top-pick.component.html',
  styleUrl: './top-pick.css',
})
export class TopPick {
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly Variants = ButtonVariant;

  protected readonly Sizes = ButtonSize;

  protected readonly Statuses = StatusBadgeStatus;

  protected readonly Icons = IconName;

  readonly title = input.required<string>();

  readonly reason = input.required<string>();

  readonly quadrant = input.required<Quadrant>();

  readonly estimate = input.required<string>();

  /** The name of the Task's Area, when it has one. */
  readonly area = input<string | null>(null);

  readonly taskId = input<string | null>(null);

  readonly morph = input<boolean>(false);

  readonly overdue = input<boolean>(false);

  /** The Overdue Due fact that opens the reason (`Due yesterday 17:00`), drawn in the danger colour. */
  readonly dueFact = input<string | null>(null);

  readonly canLogProgress = input<boolean>(true);

  readonly actionsDisabled = input<boolean>(false);

  /** Shows a drawn check and "Done" in place of the actions while the card leaves. */
  readonly completed = input<boolean>(false);

  readonly done = output<{ readonly keyboard: boolean }>();

  readonly logProgress = output<void>();

  /** The reason split after its Due fact, when the card is Overdue and the reason starts with that fact. */
  protected readonly reasonParts = computed(() => {
    const fact = this.dueFact();
    const reason = this.reason();

    return this.overdue() && fact !== null && reason.startsWith(fact)
      ? { fact, rest: reason.slice(fact.length) }
      : null;
  });

  /** Moves focus to the title link (used after Done, so focus lands on the new top pick). */
  focusTitle(): void {
    this.#host.nativeElement.querySelector<HTMLElement>('.asys-top-pick__link')?.focus();
  }

  /** Moves focus to the Log progress button, when it is shown (used when Now's form closes). */
  focusLogProgress(): void {
    this.#host.nativeElement.querySelector<HTMLElement>('.asys-top-pick__log-progress')?.focus();
  }
}
