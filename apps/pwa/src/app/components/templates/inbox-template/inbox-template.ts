// SPDX-License-Identifier: EUPL-1.2
import {
  Component,
  computed,
  ElementRef,
  input,
  model,
  output,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button, ButtonSize, ButtonVariant } from '../../atoms/button/button';
import { SyncNote } from '../../atoms/sync-note/sync-note';
import { LoadState } from '../../molecules/load-state/load-state';
import { ReviewItem, ReviewItemActionKind } from '../../molecules/review-item/review-item';
import {
  type AreaChoice,
  TriageCard,
  type TriageDraft,
} from '../../organisms/triage-card/triage-card';

/** One open Review item as the Inbox lists it, with its copy already written. */
export interface InboxReview {
  /** The Review item id. */
  readonly id: string;
  readonly question: string;
  readonly reason: string;
  /** The Task Open Task links to, or null for no link. */
  readonly taskId: string | null;
  /** Whether its Dismiss is pending or waits for the server. */
  readonly busy: boolean;
  /** Whether the sync note shows after it. */
  readonly awaitingSync: boolean;
}

/** The Inbox Task on the Triage card. */
export interface InboxCard {
  readonly id: string;
  readonly title: string;
  /** The Task's capture text. */
  readonly rawText: string;
  readonly awaitingSync: boolean;
}

/** Lays out the Review items and the Triage card of the Inbox. */
@Component({
  selector: 'asys-inbox-template',
  imports: [Button, LoadState, ReviewItem, RouterLink, SyncNote, TriageCard],
  templateUrl: './inbox-template.component.html',
  styleUrl: './inbox-template.css',
})
export class InboxTemplate {
  /** Whether the state has loaded. */
  readonly loaded = input.required<boolean>();

  /** Whether loading the state failed. */
  readonly loadFailed = input.required<boolean>();

  /** The status line under the heading. */
  readonly statusLine = input.required<string>();

  /** The open Review items. */
  readonly reviews = input.required<readonly InboxReview[]>();

  /** The Inbox Task on the card, or null. */
  readonly card = input.required<InboxCard | null>();

  /** The card's position, 1-based. */
  readonly position = input.required<number>();

  /** How many Tasks the Triage covers. */
  readonly total = input.required<number>();

  /** The Areas to choose from. */
  readonly areas = input.required<readonly AreaChoice[]>();

  /** Whether the card's command is under way. */
  readonly cardBusy = input.required<boolean>();

  /** Whether the card can be put off. */
  readonly canLater = input.required<boolean>();

  /** Whether there is no Review item and no Inbox Task. */
  readonly empty = input.required<boolean>();

  /** The card's choices. */
  readonly draft = model.required<TriageDraft>();

  /** Asks to load the state again. */
  readonly retry = output();

  /** Asks to dismiss the Review item with this id. */
  readonly dismiss = output<string>();

  /** Asks to triage the card's Task with this draft. */
  readonly triage = output<TriageDraft>();

  /** Asks to drop the card's Task. */
  readonly dropTask = output();

  /** Asks to put off the Task with this id. */
  readonly later = output<string>();

  /** Asks to edit the Task with this id. */
  readonly edit = output<string>();

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  private readonly triageCard = viewChild(TriageCard);

  private readonly reviewItems = viewChildren(ReviewItem);

  protected readonly cards = computed<readonly InboxCard[]>(() => {
    const card = this.card();

    return card === null ? [] : [card];
  });

  protected readonly Variant = ButtonVariant;

  protected readonly Size = ButtonSize;

  protected readonly dismissActions = [{ label: 'Dismiss', kind: ReviewItemActionKind.Secondary }];

  /** Moves focus to the card's title, or to the heading when there is no card. */
  focusCard(): void {
    const card = this.triageCard();

    if (card === undefined) {
      this.heading()?.nativeElement.focus();
    } else {
      card.focusTitle();
    }
  }

  /** Moves focus to the Review item at this index, or to the heading when there is none. */
  focusReview(index: number): void {
    const next = this.reviewItems()[index];

    if (next === undefined) {
      this.heading()?.nativeElement.focus();
    } else {
      next.focus();
    }
  }
}
